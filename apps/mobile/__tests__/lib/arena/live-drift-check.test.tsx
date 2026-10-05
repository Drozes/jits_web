/**
 * The drift check (jr_be 016 addendum, instant go-live 4.4; UX 019, 3k),
 * behind `live_location_drift_check` (seeded OFF).
 *
 *  - flag OFF: no reading at all, ever (fake clock across 30 minutes);
 *  - inactive without permission, in a match, in the background, without a
 *    stored go_live tag; never asks for permission;
 *  - drifted at 501 m net of accuracy, not at 499 m;
 *  - one prompt per drift streak (a not-drifted check, or a new tag, ends it);
 *  - Update re-tags (go_live report with the reading's capture time, the
 *    device store updated) and logs `retagged`; Go offline goes offline and
 *    logs `went_offline`; closing logs `dismissed`;
 *  - the sheet mounts nothing while there is no prompt, and waits while a
 *    match, the challenge prompt or a location sheet is up.
 *
 * Source: apps/mobile/lib/arena/use-live-drift-check.ts,
 * components/arena/drift-prompt-sheet.tsx
 */
import * as React from "react";
import { AppState } from "react-native";
import { act, render, renderHook } from "@testing-library/react-native";

jest.mock("@/lib/supabase/client", () => ({ supabase: { tag: "client" } }));
let mockDriftFlag = false;
jest.mock("@/lib/arena/location-flags", () => ({
  useLiveDriftCheckEnabled: () => mockDriftFlag,
}));
const mockPermission = jest.fn();
jest.mock("expo-location", () => ({
  getForegroundPermissionsAsync: () => mockPermission(),
  requestForegroundPermissionsAsync: jest.fn(),
}));
const mockReading = jest.fn();
jest.mock("@/lib/invites/location", () => ({
  readLocationOnce: (...a: unknown[]) => mockReading(...a),
  permissionRequestInFlight: () => false,
}));
const mockReport = jest.fn();
jest.mock("@jits/shared/api/location", () => ({
  reportGoLivePresence: (...a: unknown[]) => mockReport(...a),
}));
const mockDriftCheck = jest.fn();
const mockDriftPrompt = jest.fn();
jest.mock("@/lib/arena/location-telemetry", () => ({
  logDriftCheck: (...a: unknown[]) => mockDriftCheck(...a),
  logDriftPrompt: (...a: unknown[]) => mockDriftPrompt(...a),
}));
const mockGoOffline = jest.fn(() => Promise.resolve());
jest.mock("@/lib/arena/go-live-feedback", () => ({
  goOfflineWithFeedback: () => mockGoOffline(),
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: () => Promise.resolve(null),
  setItemAsync: () => Promise.resolve(),
  deleteItemAsync: () => Promise.resolve(),
}));
const mockPresent = jest.fn();
const mockDismiss = jest.fn();
jest.mock("@gorhom/bottom-sheet", () => {
  const ReactLib = jest.requireActual("react") as typeof React;
  const { View } = jest.requireActual("react-native");
  const BottomSheetModal = ReactLib.forwardRef(
    ({ children }: { children: React.ReactNode }, ref: React.Ref<unknown>) => {
      ReactLib.useImperativeHandle(ref, () => ({ present: mockPresent, dismiss: mockDismiss }));
      return <View testID="gorhom-modal">{children}</View>;
    },
  );
  return {
    BottomSheetModal,
    BottomSheetView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    BottomSheetBackdrop: () => null,
  };
});
jest.mock("@/components/ui/sheet", () => ({
  SheetBackdrop: () => null,
  useSheetChrome: () => ({}),
}));

import {
  __resetLiveDriftCheckForTests,
  answerDriftPrompt,
  runDriftCheck,
  useDriftPrompt,
  useLiveDriftCheck,
} from "@/lib/arena/use-live-drift-check";
import { DriftPromptSheet } from "@/components/arena/drift-prompt-sheet";
import { __resetArenaStoreForTests, useArenaMatchScreen } from "@/lib/arena/arena-store";
import {
  __resetDeviceLocationStoreForTests,
  peekDeviceTag,
  recordAcceptedReading,
  saveDeviceLocation,
  setDeviceLocationOwner,
} from "@/lib/location/device-location-store";
import { __resetPresenceCapabilityForTests } from "@/lib/location/presence-capability";
import { DRIFT_INTERVAL_MS } from "@jits/shared/constants/go-live";

const ME = "me-1";
const TAG = { lat: 43.65, lng: -79.38, accuracyM: 30 };
/** A reading `m` metres north of the tag, with accuracy 70 (sum 100, the cap). */
const north = (m: number) => ({ lat: TAG.lat + m / 111_195, lng: TAG.lng, accuracyM: 70 });

function seedTag(context: "go_live" | "browse" = "go_live", capturedAt = Date.now() - 10 * 60_000) {
  saveDeviceLocation(ME, { ...TAG, capturedAt, context });
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

beforeEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
  __resetLiveDriftCheckForTests();
  __resetArenaStoreForTests();
  __resetDeviceLocationStoreForTests();
  __resetPresenceCapabilityForTests();
  setDeviceLocationOwner(ME);
  Object.defineProperty(AppState, "currentState", { value: "active", configurable: true });
  mockDriftFlag = false;
  mockPermission.mockResolvedValue({ granted: true, canAskAgain: true });
  mockReading.mockResolvedValue({ status: "ok", reading: north(601), capturedAt: Date.now() });
  mockReport.mockResolvedValue({ ok: true, data: { ok: true, verdict: "recorded", captured_at: new Date().toISOString() } });
});

describe("the hook: active only with every condition", () => {
  function mount(over: Partial<{ isLive: boolean; inMatch: boolean; locationRequired: boolean }> = {}) {
    return renderHook(() =>
      useLiveDriftCheck({ athleteId: ME, isLive: true, inMatch: false, locationRequired: true, ...over }),
    );
  }

  it("flag OFF: no periodic reading at all across 30 minutes", async () => {
    jest.useFakeTimers();
    seedTag();
    mount();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(30 * 60_000);
    });
    expect(mockReading).not.toHaveBeenCalled();
    expect(mockPermission).not.toHaveBeenCalled();
  });

  it("flag ON: one silent reading every 5 minutes (never asks)", async () => {
    jest.useFakeTimers();
    mockDriftFlag = true;
    mockReading.mockResolvedValue({ status: "ok", reading: north(10), capturedAt: Date.now() });
    seedTag();
    mount();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(DRIFT_INTERVAL_MS - 1);
    });
    expect(mockReading).not.toHaveBeenCalled();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1);
    });
    expect(mockReading).toHaveBeenCalledWith({ ask: false, fast: true, skipLastKnown: true });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(DRIFT_INTERVAL_MS);
    });
    expect(mockReading).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["not live", { isLive: false }],
    ["in a match", { inMatch: true }],
    ["match_location_required off", { locationRequired: false }],
  ])("inactive %s", async (_c, over) => {
    jest.useFakeTimers();
    mockDriftFlag = true;
    seedTag();
    mount(over);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(3 * DRIFT_INTERVAL_MS);
    });
    expect(mockReading).not.toHaveBeenCalled();
  });
});

describe("one check", () => {
  it("drifted at 501 m net of accuracy: prompts and logs drift_check / drifted with the reading", async () => {
    seedTag();
    expect(await runDriftCheck(ME)).toBe(true);
    expect(mockDriftCheck).toHaveBeenCalledWith(north(601));
  });

  it("499 m net of accuracy: no prompt, nothing logged", async () => {
    seedTag();
    mockReading.mockResolvedValue({ status: "ok", reading: north(599), capturedAt: Date.now() });
    expect(await runDriftCheck(ME)).toBe(false);
    expect(mockDriftCheck).not.toHaveBeenCalled();
  });

  it.each([
    ["permission not granted (never asks)", () => mockPermission.mockResolvedValue({ granted: false, canAskAgain: true })],
    ["no stored tag", () => __resetDeviceLocationStoreForTests()],
    ["a stored browse reading, not a go_live tag", () => {
      __resetDeviceLocationStoreForTests();
      setDeviceLocationOwner(ME);
      seedTag("browse");
    }],
    ["in the background", () => Object.defineProperty(AppState, "currentState", { value: "background", configurable: true })],
  ])("inactive with %s", async (_c, arrange) => {
    seedTag();
    arrange();
    expect(await runDriftCheck(ME)).toBe(false);
    expect(mockReading).not.toHaveBeenCalled();
  });

  it("S3: a browse reading far from the tag neither replaces it nor drifts the check", async () => {
    seedTag();
    // A browse reading 2 km away was accepted (an Arena visit, say).
    recordAcceptedReading("browse", north(2_000), Date.now(), {
      ok: true,
      verdict: "recorded",
      reason: null,
      distance_m: null,
      started: false,
      match_id: null,
      start_blocked_reason: null,
    });
    expect(peekDeviceTag(ME)).toMatchObject(TAG);
    // Standing on the tag: not drifted (it would be against the browse point).
    mockReading.mockResolvedValue({ status: "ok", reading: north(10), capturedAt: Date.now() });
    expect(await runDriftCheck(ME)).toBe(false);
  });

  it("in a match: nothing", async () => {
    seedTag();
    renderHook(() => useArenaMatchScreen());
    expect(await runDriftCheck(ME)).toBe(false);
  });

  it("once per drift streak: closed, no prompt again until a not-drifted check", async () => {
    seedTag();
    expect(await runDriftCheck(ME)).toBe(true);
    await answerDriftPrompt("dismiss");
    expect(mockDriftPrompt).toHaveBeenCalledWith("dismissed");
    expect(await runDriftCheck(ME)).toBe(false);
    mockReading.mockResolvedValueOnce({ status: "ok", reading: north(10), capturedAt: Date.now() });
    expect(await runDriftCheck(ME)).toBe(false);
    expect(await runDriftCheck(ME)).toBe(true);
    expect(mockDriftCheck).toHaveBeenCalledTimes(2);
  });
});

describe("the answers", () => {
  it("Update re-tags: the reading reported as go_live with its capture time, kept on the device, logged retagged", async () => {
    seedTag();
    const at = Date.now() - 5_000;
    mockReading.mockResolvedValue({ status: "ok", reading: north(601), capturedAt: at });
    await runDriftCheck(ME);
    const serverAt = new Date(at).toISOString();
    mockReport.mockResolvedValue({ ok: true, data: { ok: true, verdict: "recorded", captured_at: serverAt } });
    await answerDriftPrompt("update");
    expect(mockReport).toHaveBeenCalledWith({ tag: "client" }, north(601), { capturedAt: at });
    expect(mockDriftPrompt).toHaveBeenCalledWith("retagged");
    expect(peekDeviceTag(ME)).toMatchObject({ ...north(601), context: "go_live", capturedAt: at });
    const { result } = renderHook(() => useDriftPrompt());
    expect(result.current).toBeNull();
  });

  it("Update whose report fails: the sheet closes anyway, nothing else is said, the old tag stays, no 'retagged' (N4)", async () => {
    seedTag();
    await runDriftCheck(ME);
    mockReport.mockResolvedValue({ ok: false, error: { hint: "unknown", message: "offline" } });
    await answerDriftPrompt("update");
    expect(mockDriftPrompt).not.toHaveBeenCalledWith("retagged");
    expect(peekDeviceTag(ME)).toMatchObject(TAG);
    const { result } = renderHook(() => useDriftPrompt());
    expect(result.current).toBeNull();
  });

  it("Go offline: the manual go-offline, logged went_offline", async () => {
    seedTag();
    await runDriftCheck(ME);
    await answerDriftPrompt("offline");
    expect(mockGoOffline).toHaveBeenCalledTimes(1);
    expect(mockDriftPrompt).toHaveBeenCalledWith("went_offline");
  });
});

describe("the sheet", () => {
  it("mounts no modal at all while there is no prompt (flag off)", () => {
    const r = render(<DriftPromptSheet blocked={false} />);
    expect(r.queryByTestId("gorhom-modal")).toBeNull();
    expect(mockPresent).not.toHaveBeenCalled();
  });

  it("presents the prompt with its copy and two buttons; the athlete stays live behind it", async () => {
    seedTag();
    const r = render(<DriftPromptSheet blocked={false} />);
    await act(async () => {
      await runDriftCheck(ME);
    });
    await flush();
    expect(mockPresent).toHaveBeenCalledTimes(1);
    expect(r.getByText("Still on the same mat?")).toBeTruthy();
    expect(
      r.getByText("You've moved since you went live. Update your location so people nearby can find you."),
    ).toBeTruthy();
    expect(r.getByTestId("drift-prompt-update")).toBeTruthy();
    // Never the Arena toggle's exact "Go offline" label (harness contract).
    expect(r.getByLabelText("Drift prompt: Go offline")).toBeTruthy();
  });

  it("waits while something else is up (a match, the challenge prompt, a location sheet), never over it", async () => {
    seedTag();
    const r = render(<DriftPromptSheet blocked />);
    await act(async () => {
      await runDriftCheck(ME);
    });
    await flush();
    expect(mockPresent).not.toHaveBeenCalled();
    r.rerender(<DriftPromptSheet blocked={false} />);
    await flush();
    expect(mockPresent).toHaveBeenCalledTimes(1);
  });
});

/**
 * Live location fixes (jr_be specs/016-invites/addendum-live-location-fixes.md,
 * section 4), at the consuming layer: `<ArenaBootstrap />` with the real Go
 * Live location flow, sheet, CTA and refresh, driven through
 * `arenaActions.goLive()` exactly as the Arena screen and the header chip
 * call it.
 *
 *  - 1a: `canAskAgain` branching (an iOS "Allow Once" grant that lapsed reads
 *    as undetermined + canAskAgain: explain, never denied); the denied
 *    sheet's Retry re-reads the permission.
 *  - 1b: a restore with no valid tag and permission gone makes no live
 *    write and offers the tap-to-go-live CTA; the tap runs the full flow;
 *    no system dialog without a tap. Since instant go-live (D12), a restore
 *    whose silent fix fails makes no write either (one toast).
 *  - 1d: the 60 s refresh (a LEGACY backend only since instant go-live)
 *    losing permission while live shows the CTA once per failure streak; a
 *    failing tick asks whether the server expired the session.
 *  - 1e: backgrounding mid-flow closes the sheet and resolves `dismissed`.
 *  - 3a: reduced precision shows the Precise Location copy.
 *  - 5: one `go_live_attempt` log per athlete-initiated flow with the
 *    spec's outcome, never blocking or changing the flow.
 *
 * Source: apps/mobile/lib/arena/go-live-location.ts, arena-bootstrap.tsx,
 * go-live-feedback.ts, location-telemetry.ts,
 * components/arena/go-live-location-sheet.tsx
 */
import * as React from "react";
import { AppState, Linking } from "react-native";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

jest.mock("@/lib/supabase/client", () => ({ supabase: { tag: "client" } }));

let mockLocationRequired = true;
jest.mock("@/lib/arena/match-location-flag", () => ({
  useMatchLocationRequired: () => mockLocationRequired,
  readMatchLocationRequired: () => Promise.resolve(mockLocationRequired),
  markMatchLocationRequired: jest.fn(),
}));

const mockPermission = jest.fn();
jest.mock("expo-location", () => ({
  getForegroundPermissionsAsync: () => mockPermission(),
}));
const mockReading = jest.fn();
const mockOsCache = jest.fn();
let mockInFlight = false;
jest.mock("@/lib/invites/location", () => ({
  readLocationOnce: (...a: unknown[]) => mockReading(...a),
  readOsCachedFix: (...a: unknown[]) => mockOsCache(...a),
  permissionRequestInFlight: () => mockInFlight,
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: () => Promise.resolve(null),
  setItemAsync: () => Promise.resolve(),
  deleteItemAsync: () => Promise.resolve(),
}));
let mockProximity = false;
jest.mock("@/lib/arena/location-flags", () => ({
  useMatchProximityRequired: () => mockProximity,
  useLiveDriftCheckEnabled: () => false,
  markMatchProximityRequired: jest.fn(),
  resetLocationFlags: jest.fn(),
}));
const mockReport = jest.fn();
const mockLog = jest.fn();
const mockArenaReport = jest.fn();
const mockServerRanked = jest.fn();
jest.mock("@jits/shared/api/location", () => ({
  reportGoLivePresence: (...a: unknown[]) => mockReport(...a),
  reportArenaPresence: (...a: unknown[]) => mockArenaReport(...a),
  logLocationEvent: (...a: unknown[]) => mockLog(...a),
  getMyLookingForRanked: (...a: unknown[]) => mockServerRanked(...a),
}));
jest.mock("@/lib/updates/app-version", () => ({
  readAppVersionInfo: () => ({ appVersion: "0.5.0", buildNumber: "25", updateId: "9287a1e5ffff", isEmbeddedLaunch: false }),
}));
const mockToastInfo = jest.fn();
const mockToastHide = jest.fn();
jest.mock("@/components/ui/toast", () => ({
  toast: {
    info: (...a: unknown[]) => mockToastInfo(...a),
    error: jest.fn(),
    success: jest.fn(),
    hide: () => mockToastHide(),
  },
}));

jest.mock("expo-keep-awake", () => ({
  activateKeepAwakeAsync: () => Promise.resolve(),
  deactivateKeepAwake: () => Promise.resolve(),
}));
jest.mock("@/components/arena/challenge-prompt-sheet", () => ({ ChallengePromptSheet: () => null }));

const ACTIVE = { id: "me-1", display_name: "Me", current_elo: 1200, current_weight: 180, status: "active" };
jest.mock("@/lib/auth/hooks", () => ({
  useAuth: () => ({ athlete: ACTIVE, refreshAthleteSoft: () => Promise.resolve() }),
}));
jest.mock("@/lib/match-flow/active-match-store", () => ({ useActiveMatchOwner: () => {} }));
jest.mock("@/lib/arena/use-lobby-presence", () => ({
  useLobbyPresence: () => {},
  useLobbyIds: () => new Set<string>(),
  useLobbyKnown: () => true,
}));

let mockIsLive = false;
let mockOutgoing: unknown = null;
const mockGoLive = jest.fn();
let mockRefusal: string | null = null;
const mockLiveArgs = jest.fn();
const mockDrop = jest.fn();
jest.mock("@/lib/arena/use-arena-live", () => ({
  useArenaLive: (args: unknown) => {
    mockLiveArgs(args);
    return {
      isLive: mockIsLive,
      isSaving: false,
      transition: null,
      lastWriteFailed: false,
      toggle: jest.fn(),
      goOffline: jest.fn(),
      goLive: () => mockGoLive(),
      lastGoLiveRefusal: () => mockRefusal,
      dropIfServerOffline: (read: () => Promise<boolean | null>) => mockDrop(read),
    };
  },
}));
jest.mock("@/lib/arena/use-arena-challenge", () => ({
  useArenaChallenge: () => ({
    // (outgoing is overridden below when a test sets mockOutgoing)
    incoming: null,
    outgoing: mockOutgoing,
    incomingCount: 0,
    incomingTucked: false,
    isBusy: false,
    capReached: false,
    beginManualOffline: () => () => undefined,
    noteIncomingRead: jest.fn(),
    tuckIncoming: jest.fn(),
    reopenIncoming: jest.fn(),
    sendChallenge: jest.fn(),
    accept: jest.fn(),
    decline: jest.fn(),
    cancelOutgoing: jest.fn(),
    clearCap: jest.fn(),
    offerIncoming: jest.fn(),
    restoreOutgoing: jest.fn(),
    startBlocked: null,
    retryBlockedStart: jest.fn(),
    cancelBlockedStart: jest.fn(),
  }),
}));
jest.mock("@/lib/arena/use-pending-challenge-recovery", () => ({ usePendingChallengeRecovery: () => {} }));

import { ArenaBootstrap } from "@/lib/arena/arena-bootstrap";
import { __resetArenaStoreForTests, arenaActions } from "@/lib/arena/arena-store";
import { GO_LIVE_REFRESH_MS, __resetGoLiveLocationForTests } from "@/lib/arena/go-live-location";
import { __resetLocationLadderForTests, RECOVERY_WINDOW_MS } from "@/lib/arena/location-ladder";
import { __resetChallengerArenaReadingForTests } from "@/lib/arena/use-challenger-arena-reading";
import { __resetDeviceLocationStoreForTests } from "@/lib/location/device-location-store";
import { __resetPresenceCapabilityForTests } from "@/lib/location/presence-capability";
import {
  LOCATION_FIX_FAILED_GO_LIVE_CTA_COPY,
  LOCATION_OFF_GO_LIVE_CTA_COPY,
  PRECISE_LOCATION_COPY,
  PRECISE_LOCATION_TITLE,
} from "@jits/shared/utils";

const READING = { lat: 43.6, lng: -79.4, accuracyM: 12 };
const OK_READING = { status: "ok", reading: READING };
/** A current backend's go_live answer (it carries `captured_at`). */
const RECORDED = {
  ok: true,
  data: { ok: true, verdict: "recorded", started: false, match_id: null, captured_at: new Date().toISOString() },
};
/** An older backend's go_live answer (no `captured_at`). */
const LEGACY_RECORDED = { ok: true, data: { ok: true, verdict: "recorded", started: false, match_id: null } };

let appStateHandlers: ((s: string) => void)[] = [];
function setAppState(s: string) {
  Object.defineProperty(AppState, "currentState", { value: s, configurable: true });
}
function emitAppState(s: string) {
  setAppState(s);
  for (const h of [...appStateHandlers]) h(s);
}

beforeEach(() => {
  mockInFlight = false;
  jest.clearAllMocks();
  jest.useRealTimers();
  __resetArenaStoreForTests();
  __resetGoLiveLocationForTests();
  __resetLocationLadderForTests();
  __resetDeviceLocationStoreForTests();
  __resetPresenceCapabilityForTests();
  __resetChallengerArenaReadingForTests();
  mockProximity = false;
  mockOsCache.mockResolvedValue(null);
  setAppState("active");
  appStateHandlers = [];
  jest.spyOn(AppState, "addEventListener").mockImplementation(((_e: string, h: (s: string) => void) => {
    appStateHandlers.push(h);
    return {
      remove: () => {
        appStateHandlers = appStateHandlers.filter((x) => x !== h);
      },
    };
  }) as never);
  mockLocationRequired = true;
  mockIsLive = false;
  mockOutgoing = null;
  mockArenaReport.mockResolvedValue(RECORDED);
  mockRefusal = null;
  mockGoLive.mockResolvedValue(true);
  mockPermission.mockResolvedValue({ granted: true, canAskAgain: true });
  mockReading.mockResolvedValue(OK_READING);
  mockReport.mockResolvedValue(RECORDED);
  mockLog.mockResolvedValue({ ok: true, data: { logged: true } });
  mockDrop.mockResolvedValue(false);
  mockServerRanked.mockResolvedValue(false);
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** Start a Go Live tap; `done` resolves once it settles. */
function tapGoLive() {
  const pending = arenaActions.goLive();
  return {
    get done() {
      return (async () => {
        let result: unknown;
        await act(async () => {
          result = await pending;
        });
        return result;
      })();
    },
  };
}

/** The outcomes logged so far, in order. */
function logged(): string[] {
  return mockLog.mock.calls.map((c) => (c[1] as { outcome: string }).outcome);
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

// ---------------------------------------------------------------------------

describe("item 5: one go_live_attempt per tapped flow, with the final outcome", () => {
  it("ok: logged after the live write, with the reading, app version and device time", async () => {
    render(<ArenaBootstrap />);
    expect(await tapGoLive().done).toBe(true);
    expect(mockLog).toHaveBeenCalledTimes(1);
    const [client, input] = mockLog.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(client).toEqual({ tag: "client" });
    expect(input).toMatchObject({
      event: "go_live_attempt",
      outcome: "ok",
      reading: READING,
      appVersion: "0.5.0 (25) 9287a1e5",
    });
    expect(input.occurredAt).toBeInstanceOf(Date);
    expect(input).not.toHaveProperty("matchId", expect.anything());
  });

  it("dismissed: the explain sheet closed before any reading", async () => {
    mockPermission.mockResolvedValue({ granted: false, canAskAgain: true });
    render(<ArenaBootstrap />);
    const tap = tapGoLive();
    await waitFor(() => expect(screen.getByTestId("go-live-location-explain")).toBeTruthy());
    fireEvent.press(screen.getByText("Not now"));
    expect(await tap.done).toBe("ignored");
    expect(logged()).toEqual(["dismissed"]);
  });

  it("permission_denied: left from the denied sheet (Not now)", async () => {
    mockPermission.mockResolvedValue({ granted: false, canAskAgain: false });
    render(<ArenaBootstrap />);
    const tap = tapGoLive();
    await waitFor(() => expect(screen.getByTestId("go-live-location-denied")).toBeTruthy());
    fireEvent.press(screen.getByText("Not now"));
    expect(await tap.done).toBe("ignored");
    expect(logged()).toEqual(["permission_denied"]);
  });

  it("permission_denied: Open Settings from the denied sheet (the sheet's reason, not dismissed)", async () => {
    mockPermission.mockResolvedValue({ granted: false, canAskAgain: false });
    const openSettings = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
    render(<ArenaBootstrap />);
    const tap = tapGoLive();
    await waitFor(() => expect(screen.getByTestId("go-live-location-denied")).toBeTruthy());
    fireEvent.press(screen.getByText("Open Settings"));
    // Leaving for Settings backgrounds the app; the attempt already ended.
    emitAppState("background");
    expect(await tap.done).toBe("ignored");
    expect(openSettings).toHaveBeenCalled();
    expect(logged()).toEqual(["permission_denied"]);
  });

  it.each([
    ["timeout", { status: "unavailable", reason: "timeout" }, "go-live-location-unavailable"],
    ["unavailable", { status: "unavailable", reason: "error" }, "go-live-location-unavailable"],
  ])("%s: no fix, left from the no-location sheet", async (outcome, reading, sheetId) => {
    mockReading.mockResolvedValue(reading);
    render(<ArenaBootstrap />);
    const tap = tapGoLive();
    await waitFor(() => expect(screen.getByTestId(sheetId)).toBeTruthy());
    fireEvent.press(screen.getByText("Not now"));
    expect(await tap.done).toBe("ignored");
    expect(mockGoLive).not.toHaveBeenCalled();
    expect(logged()).toEqual([outcome]);
  });

  it("accuracy_too_low: left from the accuracy sheet", async () => {
    mockReport.mockResolvedValue({ ok: true, data: { ok: false, code: "accuracy_too_low" } });
    render(<ArenaBootstrap />);
    const tap = tapGoLive();
    await waitFor(() => expect(screen.getByTestId("go-live-location-accuracy")).toBeTruthy());
    fireEvent.press(screen.getByText("Not now"));
    expect(await tap.done).toBe("ignored");
    expect(logged()).toEqual(["accuracy_too_low"]);
  });

  it("implausible_movement: left from the movement sheet", async () => {
    mockReport.mockResolvedValue({ ok: true, data: { ok: false, code: "implausible_movement" } });
    render(<ArenaBootstrap />);
    const tap = tapGoLive();
    await waitFor(() => expect(screen.getByTestId("go-live-location-movement")).toBeTruthy());
    fireEvent.press(screen.getByText("Not now"));
    expect(await tap.done).toBe("ignored");
    expect(logged()).toEqual(["implausible_movement"]);
  });

  /** Run a tap through the whole recovery window (fake clock). */
  async function tapThroughRecovery(): Promise<unknown> {
    jest.useFakeTimers();
    const pending = arenaActions.goLive();
    let result: unknown;
    await act(async () => {
      await jest.advanceTimersByTimeAsync(RECOVERY_WINDOW_MS + 100);
      result = await pending;
    });
    return result;
  }

  it("error: the report RPC failed (network), retried silently for the recovery window", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    mockReport.mockResolvedValue({ ok: false, error: { hint: "unknown", message: "offline" } });
    render(<ArenaBootstrap />);
    expect(await tapThroughRecovery()).toBe(false);
    expect(mockReport.mock.calls.length).toBeGreaterThan(1);
    expect(logged()).toEqual(["error"]);
  });

  it("error: the live write failed for another reason, retried silently for the recovery window", async () => {
    mockGoLive.mockResolvedValue(false);
    mockRefusal = null;
    render(<ArenaBootstrap />);
    expect(await tapThroughRecovery()).toBe(false);
    expect(mockGoLive.mock.calls.length).toBeGreaterThan(1);
    expect(logged()).toEqual(["error"]);
  });

  it("location_required: the live write was refused and the athlete left the sheet", async () => {
    mockGoLive.mockResolvedValue(false);
    mockRefusal = "location_required";
    render(<ArenaBootstrap />);
    const tap = tapGoLive();
    await waitFor(() => expect(screen.getByTestId("go-live-location-unavailable")).toBeTruthy());
    fireEvent.press(screen.getByText("Not now"));
    expect(await tap.done).toBe("ignored");
    expect(logged()).toEqual(["location_required"]);
  });

  it("location_required: refused on every retry, the flow gives up and still logs once", async () => {
    mockGoLive.mockResolvedValue(false);
    mockRefusal = "location_required";
    render(<ArenaBootstrap />);
    const tap = tapGoLive();
    for (let i = 0; i < 3; i++) {
      await waitFor(() => expect(screen.getByTestId("go-live-location-unavailable")).toBeTruthy());
      fireEvent.press(screen.getByTestId("go-live-location-retry"));
    }
    expect(await tap.done).toBe(false);
    expect(logged()).toEqual(["location_required"]);
  });

  it("a recovered failure logs only the final outcome (Retry after accuracy, then live)", async () => {
    mockReport
      .mockResolvedValueOnce({ ok: true, data: { ok: false, code: "accuracy_too_low" } })
      .mockResolvedValue(RECORDED);
    render(<ArenaBootstrap />);
    const tap = tapGoLive();
    await waitFor(() => expect(screen.getByTestId("go-live-location-accuracy")).toBeTruthy());
    fireEvent.press(screen.getByText("Retry"));
    expect(await tap.done).toBe(true);
    expect(logged()).toEqual(["ok"]);
  });

  it("flag OFF: nothing is logged", async () => {
    mockLocationRequired = false;
    render(<ArenaBootstrap />);
    expect(await tapGoLive().done).toBe(true);
    expect(mockLog).not.toHaveBeenCalled();
  });

  it.each([
    ["rejects", () => Promise.reject(new Error("offline"))],
    ["throws synchronously", () => {
      throw new Error("boom");
    }],
    ["never settles", () => new Promise(() => undefined)],
    ["returns an error Result", () => Promise.resolve({ ok: false, error: { hint: "rpc_missing", message: "" } })],
  ])("a log that %s never blocks or changes the flow", async (_case, impl) => {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    mockLog.mockImplementation(impl);
    render(<ArenaBootstrap />);
    expect(await tapGoLive().done).toBe(true);
    expect(mockGoLive).toHaveBeenCalledTimes(1);
    expect(mockToastInfo).not.toHaveBeenCalled();
  });
});

describe("item 1a: canAskAgain branching", () => {
  it("an Allow Once grant that lapsed (undetermined, canAskAgain): explain then the system prompt, never denied", async () => {
    mockPermission.mockResolvedValue({ granted: false, canAskAgain: true });
    render(<ArenaBootstrap />);
    const tap = tapGoLive();
    await waitFor(() => expect(screen.getByTestId("go-live-location-explain")).toBeTruthy());
    expect(screen.queryByTestId("go-live-location-denied")).toBeNull();
    // No system prompt before the athlete's Continue.
    expect(mockReading).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText("Continue"));
    expect(await tap.done).toBe(true);
    expect(mockReading).toHaveBeenCalledWith({ ask: true, fast: true });
  });

  it("a system prompt answered 'deny' that can still ask again goes back to explain, not denied", async () => {
    mockPermission.mockResolvedValue({ granted: false, canAskAgain: true });
    mockReading.mockResolvedValueOnce({ status: "denied", canAskAgain: true });
    render(<ArenaBootstrap />);
    const tap = tapGoLive();
    await waitFor(() => expect(screen.getByTestId("go-live-location-explain")).toBeTruthy());
    fireEvent.press(screen.getByText("Continue"));
    await waitFor(() => expect(mockReading).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId("go-live-location-explain")).toBeTruthy());
    expect(screen.queryByTestId("go-live-location-denied")).toBeNull();
    fireEvent.press(screen.getByText("Not now"));
    expect(await tap.done).toBe("ignored");
    expect(logged()).toEqual(["dismissed"]);
  });

  it("denied (cannot ask): the denied sheet has Retry, which re-reads the permission and continues when granted", async () => {
    // Read by the ladder (no tag, so no rung 3), then by the location step.
    mockPermission
      .mockResolvedValueOnce({ granted: false, canAskAgain: false })
      .mockResolvedValueOnce({ granted: false, canAskAgain: false });
    render(<ArenaBootstrap />);
    const tap = tapGoLive();
    await waitFor(() => expect(screen.getByTestId("go-live-location-denied")).toBeTruthy());
    expect(screen.getByTestId("go-live-location-settings")).toBeTruthy();
    // Turned on in Settings meanwhile.
    mockPermission.mockResolvedValue({ granted: true, canAskAgain: true });
    fireEvent.press(screen.getByTestId("go-live-location-retry"));
    expect(await tap.done).toBe(true);
    expect(mockPermission).toHaveBeenCalledTimes(3);
    expect(mockGoLive).toHaveBeenCalledTimes(1);
    expect(logged()).toEqual(["ok"]);
  });

  it("denied Retry while still denied stays on the denied sheet; when it became re-askable it explains", async () => {
    mockPermission.mockResolvedValue({ granted: false, canAskAgain: false });
    render(<ArenaBootstrap />);
    const tap = tapGoLive();
    await waitFor(() => expect(screen.getByTestId("go-live-location-denied")).toBeTruthy());
    fireEvent.press(screen.getByTestId("go-live-location-retry"));
    await waitFor(() => expect(mockPermission).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId("go-live-location-denied")).toBeTruthy());
    mockPermission.mockResolvedValue({ granted: false, canAskAgain: true });
    fireEvent.press(screen.getByTestId("go-live-location-retry"));
    await waitFor(() => expect(screen.getByTestId("go-live-location-explain")).toBeTruthy());
    fireEvent.press(screen.getByText("Not now"));
    expect(await tap.done).toBe("ignored");
    expect(mockReading).not.toHaveBeenCalled();
  });
});

describe("item 1e: backgrounding mid-flow", () => {
  it("closes the explain sheet and resolves the attempt as dismissed", async () => {
    mockPermission.mockResolvedValue({ granted: false, canAskAgain: true });
    render(<ArenaBootstrap />);
    const tap = tapGoLive();
    await waitFor(() => expect(screen.getByTestId("go-live-location-explain")).toBeTruthy());
    act(() => emitAppState("background"));
    expect(await tap.done).toBe("ignored");
    expect(screen.queryByTestId("go-live-location-explain")).toBeNull();
    expect(mockGoLive).not.toHaveBeenCalled();
    expect(logged()).toEqual(["dismissed"]);
  });

  it("closes a failure sheet too, as dismissed", async () => {
    mockReading.mockResolvedValue({ status: "unavailable", reason: "error" });
    render(<ArenaBootstrap />);
    const tap = tapGoLive();
    await waitFor(() => expect(screen.getByTestId("go-live-location-unavailable")).toBeTruthy());
    act(() => emitAppState("background"));
    expect(await tap.done).toBe("ignored");
    expect(screen.queryByTestId("go-live-location-unavailable")).toBeNull();
    expect(logged()).toEqual(["dismissed"]);
  });

  it("a reading that lands after the background never goes live", async () => {
    const reading = deferred<unknown>();
    mockReading.mockReturnValue(reading.promise);
    render(<ArenaBootstrap />);
    const tap = tapGoLive();
    await waitFor(() => expect(mockReading).toHaveBeenCalled());
    act(() => emitAppState("background"));
    reading.resolve(OK_READING);
    expect(await tap.done).toBe("ignored");
    expect(mockGoLive).not.toHaveBeenCalled();
    expect(logged()).toEqual(["dismissed"]);
  });

  it("'inactive' (the system prompt itself) does not cancel", async () => {
    mockPermission.mockResolvedValue({ granted: false, canAskAgain: true });
    render(<ArenaBootstrap />);
    const tap = tapGoLive();
    await waitFor(() => expect(screen.getByTestId("go-live-location-explain")).toBeTruthy());
    act(() => {
      emitAppState("inactive");
      emitAppState("active");
    });
    expect(screen.getByTestId("go-live-location-explain")).toBeTruthy();
    fireEvent.press(screen.getByText("Continue"));
    expect(await tap.done).toBe(true);
  });
});

describe("item 3a: Precise Location off", () => {
  const COARSE = { status: "ok", reading: { lat: 43.6, lng: -79.4, accuracyM: 1414 }, reducedPrecision: true };

  it("shows the Precise Location copy instead of 'try near a window', and sends no report", async () => {
    mockReading.mockResolvedValue(COARSE);
    render(<ArenaBootstrap />);
    const tap = tapGoLive();
    await waitFor(() => expect(screen.getByTestId("go-live-location-precise")).toBeTruthy());
    expect(screen.getByText(PRECISE_LOCATION_TITLE)).toBeTruthy();
    expect(screen.getByTestId("go-live-location-body")).toHaveTextContent(PRECISE_LOCATION_COPY);
    expect(screen.queryByText("Can't pin your location. Try near a window.")).toBeNull();
    expect(screen.getByTestId("go-live-location-settings")).toBeTruthy();
    expect(screen.getByTestId("go-live-location-retry")).toBeTruthy();
    expect(mockReport).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText("Not now"));
    expect(await tap.done).toBe("ignored");
    expect(logged()).toEqual(["accuracy_too_low"]);
    expect(mockLog.mock.calls[0][1]).toMatchObject({ reading: COARSE.reading });
  });

  it("Open Settings opens Settings and logs accuracy_too_low; Retry after fixing it goes live", async () => {
    const openSettings = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
    mockReading.mockResolvedValue(COARSE);
    render(<ArenaBootstrap />);
    const first = tapGoLive();
    await waitFor(() => expect(screen.getByTestId("go-live-location-precise")).toBeTruthy());
    fireEvent.press(screen.getByText("Open Settings"));
    expect(await first.done).toBe("ignored");
    expect(openSettings).toHaveBeenCalled();
    expect(logged()).toEqual(["accuracy_too_low"]);

    // A later attempt: Retry once Precise Location is on.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 2100));
    });
    const second = tapGoLive();
    await waitFor(() => expect(screen.getByTestId("go-live-location-precise")).toBeTruthy());
    mockReading.mockResolvedValue(OK_READING);
    fireEvent.press(screen.getByTestId("go-live-location-retry"));
    expect(await second.done).toBe(true);
    expect(logged()).toEqual(["accuracy_too_low", "ok"]);
  });
});

describe("item 1b: a restore that finds no tag and permission gone", () => {
  /** Run the owner's restore (`autoLive`) the way `useArenaLive` does. */
  async function restore(canWrite: () => string = () => "ok"): Promise<string> {
    const { autoLive } = mockLiveArgs.mock.calls.at(-1)[0] as { autoLive: (ctx: unknown) => Promise<string> };
    let r = "";
    await act(async () => {
      r = await autoLive({
        write: () => mockGoLive(),
        lastRefusal: () => mockRefusal,
        canWrite,
        reason: "foreground",
      });
    });
    return r;
  }

  it("makes no live write, shows the CTA, never asks, never reads and never logs", async () => {
    mockPermission.mockResolvedValue({ granted: false, canAskAgain: true });
    render(<ArenaBootstrap />);
    expect(await restore()).toBe("failed");
    expect(mockGoLive).not.toHaveBeenCalled();
    expect(mockReading).not.toHaveBeenCalled();
    expect(mockToastInfo).toHaveBeenCalledWith(
      expect.objectContaining({ text1: LOCATION_OFF_GO_LIVE_CTA_COPY, onPress: expect.any(Function) }),
    );
    expect(screen.queryByTestId("go-live-location-explain")).toBeNull();
    expect(mockLog).not.toHaveBeenCalled();
  });

  it("the CTA tap runs the interactive Go Live: explain, then (on Continue only) the system prompt, then live, logged", async () => {
    mockPermission.mockResolvedValue({ granted: false, canAskAgain: true });
    render(<ArenaBootstrap />);
    await restore();
    const cta = mockToastInfo.mock.calls[0][0] as { onPress: () => void };
    act(() => cta.onPress());
    expect(mockToastHide).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId("go-live-location-explain")).toBeTruthy());
    // No reading and no system dialog without the athlete's Continue.
    expect(mockReading).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText("Continue"));
    await waitFor(() => expect(mockGoLive).toHaveBeenCalledTimes(1));
    expect(mockReading).toHaveBeenLastCalledWith({ ask: true, fast: true });
    await waitFor(() => expect(logged()).toEqual(["ok"]));
  });

  it("D12: a silent fix that fails (permission granted) makes no write; one tap-to-go-live toast", async () => {
    mockReading.mockResolvedValue({ status: "unavailable", reason: "timeout" });
    render(<ArenaBootstrap />);
    expect(await restore()).toBe("failed");
    expect(mockReading).toHaveBeenCalledWith({ ask: false, fast: true, skipLastKnown: true });
    expect(mockGoLive).not.toHaveBeenCalled();
    expect(mockToastInfo).toHaveBeenCalledTimes(1);
    expect(mockToastInfo).toHaveBeenCalledWith(
      expect.objectContaining({ text1: LOCATION_FIX_FAILED_GO_LIVE_CTA_COPY, onPress: expect.any(Function) }),
    );
  });

  it("no CTA while the app is not in the foreground", async () => {
    mockPermission.mockResolvedValue({ granted: false, canAskAgain: true });
    render(<ArenaBootstrap />);
    setAppState("background");
    expect(await restore()).toBe("failed");
    expect(mockToastInfo).not.toHaveBeenCalled();
  });

  it("flag OFF: no reading, the plain write", async () => {
    mockLocationRequired = false;
    render(<ArenaBootstrap />);
    expect(await restore()).toBe("live");
    expect(mockReading).not.toHaveBeenCalled();
    expect(mockGoLive).toHaveBeenCalledTimes(1);
  });
});

describe("item 1d: the 60 s refresh while live (legacy backend only)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockIsLive = true;
    __resetPresenceCapabilityForTests("legacy");
    mockReport.mockResolvedValue(LEGACY_RECORDED);
  });

  async function tick() {
    await act(async () => {
      jest.advanceTimersByTime(GO_LIVE_REFRESH_MS);
    });
    await act(async () => {
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
  }

  function ctaShown(): number {
    return mockToastInfo.mock.calls.filter((c) => (c[0] as { text1?: string }).text1 === LOCATION_OFF_GO_LIVE_CTA_COPY)
      .length;
  }

  it("permission lost: the CTA once per failure streak, again after a tick that reports", async () => {
    mockReading.mockResolvedValue({ status: "denied", canAskAgain: true });
    render(<ArenaBootstrap />);
    await tick();
    await tick();
    await tick();
    expect(ctaShown()).toBe(1);
    mockReading.mockResolvedValue(OK_READING);
    await tick();
    mockReading.mockResolvedValue({ status: "denied", canAskAgain: true });
    await tick();
    expect(ctaShown()).toBe(2);
    // Silent refreshes never log, and never ask.
    expect(mockLog).not.toHaveBeenCalled();
    expect(mockReading).not.toHaveBeenCalledWith(expect.objectContaining({ ask: true }));
  });

  it("a failing tick asks the server whether the session was expired (own row), and says so when it was", async () => {
    mockReading.mockResolvedValue({ status: "unavailable", reason: "timeout" });
    mockDrop.mockImplementation(async (read: () => Promise<boolean | null>) => (await read()) === false);
    render(<ArenaBootstrap />);
    await tick();
    expect(mockDrop).toHaveBeenCalledTimes(1);
    expect(mockServerRanked).toHaveBeenCalledWith({ tag: "client" }, "me-1");
    expect(mockToastInfo).toHaveBeenCalledWith("You're offline. Go live again in the Arena.");
  });

  it("a ready tick never asks the server", async () => {
    render(<ArenaBootstrap />);
    await tick();
    expect(mockReport).toHaveBeenCalledTimes(1);
    expect(mockDrop).not.toHaveBeenCalled();
  });

  it("expired while permission is gone: the CTA, not the plain offline toast", async () => {
    mockReading.mockResolvedValue({ status: "denied", canAskAgain: true });
    mockDrop.mockResolvedValue(true);
    render(<ArenaBootstrap />);
    await tick();
    expect(ctaShown()).toBe(2);
    expect(mockToastInfo).not.toHaveBeenCalledWith("You're offline. Go live again in the Arena.");
  });
});

describe("review B1 / S3: the permission prompt is not the athlete leaving", () => {
  it("Android: the dialog reads as background then active; Allow still goes live and logs ok", async () => {
    mockPermission.mockResolvedValue({ granted: false, canAskAgain: true });
    mockReading.mockImplementation(async () => {
      // The runtime dialog pauses the activity while the request is up.
      mockInFlight = true;
      emitAppState("background");
      await Promise.resolve();
      mockInFlight = false;
      // "active" trails the answer.
      setTimeout(() => emitAppState("active"), 50);
      return OK_READING;
    });
    render(<ArenaBootstrap />);
    const tap = tapGoLive();
    await waitFor(() => expect(screen.getByTestId("go-live-location-explain")).toBeTruthy());
    fireEvent.press(screen.getByText("Continue"));
    expect(await tap.done).toBe(true);
    expect(mockGoLive).toHaveBeenCalledTimes(1);
    expect(logged()).toEqual(["ok"]);
  });

  it("iOS: a real background during the prompt, then back and Allow: goes live", async () => {
    mockPermission.mockResolvedValue({ granted: false, canAskAgain: true });
    mockReading.mockImplementation(async () => {
      mockInFlight = true;
      emitAppState("background");
      emitAppState("active");
      mockInFlight = false;
      return OK_READING;
    });
    render(<ArenaBootstrap />);
    const tap = tapGoLive();
    await waitFor(() => expect(screen.getByTestId("go-live-location-explain")).toBeTruthy());
    fireEvent.press(screen.getByText("Continue"));
    expect(await tap.done).toBe(true);
    expect(logged()).toEqual(["ok"]);
  });

  it("still not in the foreground after the answer: no live write, dismissed", async () => {
    mockReading.mockImplementation(async () => {
      mockInFlight = true;
      emitAppState("background");
      mockInFlight = false;
      return OK_READING;
    });
    render(<ArenaBootstrap />);
    expect(await tapGoLive().done).toBe("ignored");
    expect(mockGoLive).not.toHaveBeenCalled();
    expect(logged()).toEqual(["dismissed"]);
  });

  it("a background mid-reading resolves the flow at once (no wait on a hung fix), releasing the switch", async () => {
    mockReading.mockReturnValue(new Promise(() => undefined));
    render(<ArenaBootstrap />);
    const tap = tapGoLive();
    await waitFor(() => expect(mockReading).toHaveBeenCalled());
    act(() => emitAppState("background"));
    expect(await tap.done).toBe("ignored");
    expect(logged()).toEqual(["dismissed"]);
  });
});

describe("review S1: a Go Live never closes the challenger's arena explain", () => {
  it("the arena explain survives a Go Live that completes, and its Continue still reads and reports", async () => {
    // The challenger's ask exists only while an Arena start needs proximity.
    mockProximity = true;
    mockOutgoing = { challengeId: "ch-out", opponentId: "a-2", opponentName: "ALEX", createdAt: null, expiresAt: null };
    mockPermission.mockResolvedValue({ granted: false, canAskAgain: true });
    render(<ArenaBootstrap />);
    await waitFor(() => expect(screen.getByText("Location to start")).toBeTruthy());
    // Granted meanwhile (another surface): a programmatic Go Live completes.
    mockPermission.mockResolvedValue({ granted: true, canAskAgain: true });
    expect(await tapGoLive().done).toBe(true);
    expect(screen.getByText("Location to start")).toBeTruthy();
    fireEvent.press(screen.getByTestId("go-live-location-continue"));
    await waitFor(() => expect(mockArenaReport).toHaveBeenCalledWith(expect.anything(), READING, "ch-out"));
    await waitFor(() => expect(screen.queryByText("Location to start")).toBeNull());
  });
});

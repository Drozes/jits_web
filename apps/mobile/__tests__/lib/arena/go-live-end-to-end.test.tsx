/**
 * Live location fixes, end to end through the real store, the real live
 * switch guard (`runGuarded`), the real Go Live flow and the real
 * `readLocationOnce` (only `expo-location` and the network are mocked):
 *  - a system permission prompt that never answers times out at 30 s and
 *    releases the live switch (review: missing test);
 *  - Android's dialog (background then active) does not abort the flow (B1);
 *  - the header chip shows the pending pulse from the tap, before a slow
 *    flag read resolves (review: missing test).
 *
 * Source: apps/mobile/lib/arena/go-live-location.ts, arena-store.ts,
 * lib/invites/location.ts, components/layout/header-status-chip.tsx
 */
import * as React from "react";
import { AppState, Platform } from "react-native";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react-native";

jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/lib/supabase/client", () => ({ supabase: { tag: "client" } }));

let mockFlagRead: () => Promise<boolean> = () => Promise.resolve(true);
jest.mock("@/lib/arena/match-location-flag", () => ({
  useMatchLocationRequired: () => true,
  readMatchLocationRequired: () => mockFlagRead(),
  markMatchLocationRequired: jest.fn(),
}));

const mockGetPermission = jest.fn();
const mockRequestPermission = jest.fn();
const mockCurrent = jest.fn();
jest.mock("expo-location", () => ({
  Accuracy: { Balanced: 3, High: 4 },
  getForegroundPermissionsAsync: () => mockGetPermission(),
  requestForegroundPermissionsAsync: () => mockRequestPermission(),
  getLastKnownPositionAsync: () => Promise.resolve(null),
  getCurrentPositionAsync: (...a: unknown[]) => mockCurrent(...a),
}));
const mockReport = jest.fn();
const mockLog = jest.fn();
jest.mock("@jits/shared/api/location", () => ({
  reportGoLivePresence: (...a: unknown[]) => mockReport(...a),
  reportArenaPresence: jest.fn(),
  logLocationEvent: (...a: unknown[]) => mockLog(...a),
  getMyLookingForRanked: jest.fn(),
}));
jest.mock("@/lib/updates/app-version", () => ({
  readAppVersionInfo: () => ({ appVersion: "0.5.0", buildNumber: "25", updateId: null, isEmbeddedLaunch: true }),
}));
jest.mock("@/components/ui/toast", () => ({ toast: { info: jest.fn(), error: jest.fn(), success: jest.fn(), hide: jest.fn() } }));
jest.mock("expo-keep-awake", () => ({
  activateKeepAwakeAsync: () => Promise.resolve(),
  deactivateKeepAwake: () => Promise.resolve(),
}));
jest.mock("expo-router", () => ({
  useRouter: () => ({ navigate: jest.fn(), push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
}));
jest.mock("@/components/arena/challenge-prompt-sheet", () => ({ ChallengePromptSheet: () => null }));
const ACTIVE = { id: "me-1", display_name: "Me", current_elo: 1200, current_weight: 180, status: "active" };
jest.mock("@/lib/auth/hooks", () => ({
  useAuth: () => ({ athlete: ACTIVE, refreshAthleteSoft: () => Promise.resolve() }),
}));
jest.mock("@/lib/match-flow/active-match-store", () => ({
  useActiveMatchOwner: () => {},
  useMatchToConfirm: () => null,
}));
jest.mock("@/lib/arena/use-lobby-presence", () => ({
  useLobbyPresence: () => {},
  useLobbyIds: () => new Set<string>(),
  useLobbyKnown: () => true,
  useOnMatCount: () => null,
}));
const mockGoLive = jest.fn();
jest.mock("@/lib/arena/use-arena-live", () => ({
  useArenaLive: () => ({
    isLive: false,
    isSaving: false,
    transition: null,
    lastWriteFailed: false,
    toggle: jest.fn(),
    goOffline: jest.fn(),
    goLive: () => mockGoLive(),
    lastGoLiveRefusal: () => null,
    dropIfServerOffline: jest.fn(() => Promise.resolve(false)),
  }),
}));
jest.mock("@/lib/arena/use-arena-challenge", () => ({
  useArenaChallenge: () => ({
    incoming: null,
    outgoing: null,
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
import { __resetArenaStoreForTests, arenaActions, useLiveSwitchPhase } from "@/lib/arena/arena-store";
import { __resetGoLiveLocationForTests } from "@/lib/arena/go-live-location";
import { __resetChallengerArenaReadingForTests } from "@/lib/arena/use-challenger-arena-reading";
import { CHIP_PENDING_TEST_ID, HeaderStatusChip } from "@/components/layout/header-status-chip";
import { PERMISSION_REQUEST_TIMEOUT_MS } from "@/lib/invites/location";

const RECORDED = { ok: true, data: { ok: true, verdict: "recorded", started: false, match_id: null } };
const FIX = { coords: { latitude: 43.6, longitude: -79.4, accuracy: 12 }, timestamp: Date.now() };

let appStateHandlers: ((s: string) => void)[] = [];
function setAppState(s: string) {
  Object.defineProperty(AppState, "currentState", { value: s, configurable: true });
}
function emitAppState(s: string) {
  setAppState(s);
  for (const h of [...appStateHandlers]) h(s);
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetArenaStoreForTests();
  __resetGoLiveLocationForTests();
  __resetChallengerArenaReadingForTests();
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
  mockFlagRead = () => Promise.resolve(true);
  mockGetPermission.mockResolvedValue({ granted: false, canAskAgain: true, status: "undetermined" });
  mockCurrent.mockResolvedValue(FIX);
  mockReport.mockResolvedValue(RECORDED);
  mockLog.mockResolvedValue({ ok: true, data: { logged: true } });
  mockGoLive.mockResolvedValue(true);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

function logged(): string[] {
  return mockLog.mock.calls.map((c) => (c[1] as { outcome: string }).outcome);
}

it("a system prompt that never answers times out at 30 s and releases the live switch", async () => {
  mockRequestPermission.mockReturnValue(new Promise(() => undefined));
  // Rendered after the hook, so `screen` is the bootstrap tree.
  const phase = renderHook(() => useLiveSwitchPhase());
  render(<ArenaBootstrap />);
  let result: unknown = "pending";
  void arenaActions.goLive().then((r) => {
    result = r;
  });
  await waitFor(() => expect(screen.getByTestId("go-live-location-explain")).toBeTruthy());
  expect(phase.result.current).toBe("saving");
  // Fake clock from here: the 30 s prompt bound starts on Continue.
  jest.useFakeTimers();
  fireEvent.press(screen.getByText("Continue"));
  await act(async () => {
    await jest.advanceTimersByTimeAsync(PERMISSION_REQUEST_TIMEOUT_MS - 1);
  });
  expect(screen.queryByTestId("go-live-location-unavailable")).toBeNull();
  await act(async () => {
    await jest.advanceTimersByTimeAsync(1);
  });
  expect(screen.getByTestId("go-live-location-unavailable")).toBeTruthy();
  fireEvent.press(screen.getByText("Not now"));
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
  expect(result).toBe("ignored");
  expect(phase.result.current).toBe("cooldown");
  await act(async () => {
    await jest.advanceTimersByTimeAsync(5_000);
  });
  expect(phase.result.current).toBe("ready");
  expect(mockGoLive).not.toHaveBeenCalled();
  expect(logged()).toEqual(["timeout"]);
});

it("Android: the runtime dialog's background/active does not abort; Allow goes live and logs ok", async () => {
  const os = Platform.OS;
  Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
  try {
    mockRequestPermission.mockImplementation(async () => {
      emitAppState("background");
      await Promise.resolve();
      emitAppState("active");
      return { granted: true, canAskAgain: true, android: { accuracy: "fine" } };
    });
    render(<ArenaBootstrap />);
    const pending = arenaActions.goLive();
    await waitFor(() => expect(screen.getByTestId("go-live-location-explain")).toBeTruthy());
    fireEvent.press(screen.getByText("Continue"));
    let r: unknown;
    await act(async () => {
      r = await pending;
    });
    expect(r).toBe(true);
    expect(mockGoLive).toHaveBeenCalledTimes(1);
    expect(logged()).toEqual(["ok"]);
  } finally {
    Object.defineProperty(Platform, "OS", { value: os, configurable: true });
  }
});

it("the chip shows the pending pulse from the tap, before a slow flag read resolves", async () => {
  mockGetPermission.mockResolvedValue({ granted: true, canAskAgain: true });
  let releaseFlag!: (v: boolean) => void;
  render(
    <>
      <ArenaBootstrap />
      <HeaderStatusChip />
    </>,
  );
  mockFlagRead = () => new Promise<boolean>((r) => (releaseFlag = r));
  expect(screen.queryByTestId(CHIP_PENDING_TEST_ID, { includeHiddenElements: true })).toBeNull();
  let pending!: Promise<unknown>;
  act(() => {
    pending = arenaActions.goLive();
  });
  // The flag read has not answered yet: the pulse is already up.
  expect(screen.getByTestId(CHIP_PENDING_TEST_ID, { includeHiddenElements: true })).toBeTruthy();
  expect(screen.getByTestId("header-status-chip-lead")).toHaveTextContent("GOING LIVE");
  await act(async () => {
    releaseFlag(true);
    await pending;
  });
  expect(mockGoLive).toHaveBeenCalledTimes(1);
});

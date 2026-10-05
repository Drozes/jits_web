/**
 * Instant go-live (jr_be specs/016-invites/addendum-optimistic-go-live.md
 * 4.2; UX research/019-optimistic-go-live-ux.md), at the consuming layer:
 * `<ArenaBootstrap />` with the real location ladder, the real device
 * location store, the real Go Live sheet and the real header chip, driven
 * through `arenaActions.goLive()` exactly as the chip and the Arena call it.
 * Only `expo-location`, SecureStore, the network and the live write are
 * mocked (the write is a stateful stand-in for `useArenaLive`).
 *
 *  - the ladder's rung order, request sequences and fall-through;
 *  - the optimistic chip (green on the tap with a valid tag), its rollback
 *    on every server refusal, RECONNECTING and OFFLINE · RETRY;
 *  - the 240 ms reveal, GOING LIVE vs FINDING YOU;
 *  - restores (valid tag: live from the first frame, no haptic; no tag:
 *    FINDING YOU, then live or one toast);
 *  - never a permission prompt without a tap, and a valid tag with
 *    permission lapsed or denied still goes live;
 *  - the old-backend fallback (PGRST202 for p_captured_at);
 *  - logging never blocks.
 *
 * Source: apps/mobile/lib/arena/location-ladder.ts, go-live-location.ts,
 * arena-store.ts, arena-bootstrap.tsx, lib/location/*,
 * components/layout/header-status-chip.tsx
 */
import * as React from "react";
import { AccessibilityInfo, AppState } from "react-native";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

jest.mock("@/lib/supabase/client", () => ({ supabase: { tag: "client" } }));
jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

let mockLocationRequired = true;
/** Overrides the flag read (a hang, for S2); null: the plain value. */
let mockFlagRead: (() => Promise<boolean>) | null = null;
const mockMarkLocation = jest.fn();
jest.mock("@/lib/arena/match-location-flag", () => ({
  useMatchLocationRequired: () => mockLocationRequired,
  readMatchLocationRequired: () => (mockFlagRead ? mockFlagRead() : Promise.resolve(mockLocationRequired)),
  markMatchLocationRequired: (on: boolean) => mockMarkLocation(on),
}));
jest.mock("@/lib/arena/location-flags", () => ({
  useMatchProximityRequired: () => false,
  useLiveDriftCheckEnabled: () => false,
  markMatchProximityRequired: jest.fn(),
  resetLocationFlags: jest.fn(),
}));

const mockGetPermission = jest.fn();
const mockRequestPermission = jest.fn();
const mockLastKnown = jest.fn();
const mockCurrent = jest.fn();
jest.mock("expo-location", () => ({
  Accuracy: { Balanced: 3, High: 4 },
  getForegroundPermissionsAsync: () => mockGetPermission(),
  requestForegroundPermissionsAsync: () => mockRequestPermission(),
  getLastKnownPositionAsync: (...a: unknown[]) => mockLastKnown(...a),
  getCurrentPositionAsync: (...a: unknown[]) => mockCurrent(...a),
}));

/** SecureStore, in memory. */
const mockSecure = new Map<string, string>();
const mockSecureDelete = jest.fn();
jest.mock("expo-secure-store", () => ({
  getItemAsync: (k: string) => Promise.resolve(mockSecure.get(k) ?? null),
  setItemAsync: (k: string, v: string) => {
    mockSecure.set(k, v);
    return Promise.resolve();
  },
  deleteItemAsync: (k: string) => {
    mockSecureDelete(k);
    mockSecure.delete(k);
    return Promise.resolve();
  },
}));

const mockReport = jest.fn();
const mockLog = jest.fn();
jest.mock("@jits/shared/api/location", () => ({
  reportGoLivePresence: (...a: unknown[]) => mockReport(...a),
  reportArenaPresence: jest.fn(),
  logLocationEvent: (...a: unknown[]) => mockLog(...a),
  getMyLookingForRanked: jest.fn(() => Promise.resolve(true)),
}));
jest.mock("@/lib/updates/app-version", () => ({
  readAppVersionInfo: () => ({ appVersion: "0.5.0", buildNumber: "25", updateId: null, isEmbeddedLaunch: true }),
}));
const mockToastInfo = jest.fn();
jest.mock("@/components/ui/toast", () => ({
  toast: { info: (...a: unknown[]) => mockToastInfo(...a), error: jest.fn(), success: jest.fn(), hide: jest.fn() },
}));
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

/** The live write (`useArenaLive().goLive`): commits `isLive` when it lands. */
const mockWrite = jest.fn();
let mockRefusal: string | null = null;
const mockLiveArgs = jest.fn();
/** The hook's own goLive (commits `isLive`), for driving a restore's write. */
const mockLiveApi: { goLive: () => Promise<boolean> } = { goLive: () => Promise.resolve(false) };
jest.mock("@/lib/arena/use-arena-live", () => {
  const ReactLib = jest.requireActual("react") as typeof React;
  return {
    useArenaLive: (args: unknown) => {
      mockLiveArgs(args);
      const [isLive, setIsLive] = ReactLib.useState(false);
      const goLive = async () => {
        const ok = await mockWrite();
        if (ok) setIsLive(true);
        return ok;
      };
      mockLiveApi.goLive = goLive;
      return {
        isLive,
        isSaving: false,
        transition: null,
        lastWriteFailed: false,
        toggle: jest.fn(),
        goOffline: jest.fn(),
        goLive,
        lastGoLiveRefusal: () => mockRefusal,
        dropIfServerOffline: jest.fn(() => Promise.resolve(false)),
      };
    },
  };
});
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
import {
  __resetArenaStoreForTests,
  arenaActions,
  getGoLiveDisplay,
  isAthleteGoLiveFlip,
  PENDING_REVEAL_MS,
  useGoLiveDisplay,
  useIsArenaDisplayLive,
} from "@/lib/arena/arena-store";
import { __resetGoLiveLocationForTests } from "@/lib/arena/go-live-location";
import { goLiveWithFeedback } from "@/lib/arena/go-live-feedback";
import {
  __resetLocationLadderForTests,
  OPTIMISTIC_CONFIRM_MS,
  OS_CACHE_BUDGET_MS,
  RECOVERY_WINDOW_MS,
} from "@/lib/arena/location-ladder";
import { __resetChallengerArenaReadingForTests } from "@/lib/arena/use-challenger-arena-reading";
import { HeaderStatusChip } from "@/components/layout/header-status-chip";
import {
  __resetDeviceLocationStoreForTests,
  peekDeviceReading,
  peekDeviceTag,
  saveDeviceLocation,
} from "@/lib/location/device-location-store";
import {
  __resetPresenceCapabilityForTests,
  getPresenceCapability,
} from "@/lib/location/presence-capability";
import { __setConnectivityForTests } from "@/lib/network/connectivity";
import { GO_LIVE_TAG_MARGIN_MS, GO_LIVE_TAG_MAX_AGE_MS } from "@jits/shared/constants/go-live";
import {
  FLAG_READ_BOUND_MS,
  restoreFirstFrame,
  restoreLiveSilently,
} from "@/lib/arena/location-ladder";
import { devClearFaults, devFailNext, devNextFix } from "@/lib/arena/dev-go-live-hooks";
import { describeHeaderChip } from "@/lib/arena/header-chip-model";

const KEY = "last-location.me-1";
const TAG = { lat: 43.65, lng: -79.38, accuracyM: 22 };
const FRESH = { coords: { latitude: 43.66, longitude: -79.39, accuracy: 15 } };
const MIN = 60_000;

function recorded(capturedAt: string = new Date().toISOString()) {
  return { ok: true, data: { ok: true, verdict: "recorded", started: false, match_id: null, captured_at: capturedAt } };
}
const refused = (code: string) => ({ ok: true, data: { ok: false, code } });
const PGRST202 = { ok: false, error: { hint: "Perhaps you meant", message: "Could not find the function", code: "PGRST202" } };

/**
 * A stored entry, `ageMs` old: a go_live tag in SecureStore, or a browse /
 * arena reading (memory only, review round 1 S3).
 */
function seedTag(ageMs: number, context: "go_live" | "browse" | "arena" = "go_live", accuracyM = TAG.accuracyM) {
  const capturedAt = Date.now() - ageMs;
  if (context === "go_live") mockSecure.set(KEY, JSON.stringify({ ...TAG, accuracyM, capturedAt, context }));
  else saveDeviceLocation("me-1", { ...TAG, accuracyM, capturedAt, context });
  return capturedAt;
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Every distinct (display, drawn live) frame, in order. */
let frames: string[] = [];
function Recorder() {
  const display = useGoLiveDisplay();
  const live = useIsArenaDisplayLive();
  const frame = `${display ?? "none"}:${live ? "live" : "off"}`;
  if (frames[frames.length - 1] !== frame) frames.push(frame);
  return null;
}

function mount() {
  return render(
    <>
      <ArenaBootstrap />
      <HeaderStatusChip />
      <Recorder />
    </>,
  );
}

function lead(): string {
  return String(screen.getByTestId("header-status-chip-lead").props.children);
}

const announce = jest.fn();
let announceSpy: jest.SpyInstance | null = null;

async function flush(n = 20) {
  await act(async () => {
    for (let i = 0; i < n; i++) await Promise.resolve();
  });
}

function logged(): { outcome: string; source?: string }[] {
  return mockLog.mock.calls.map((c) => c[1] as { outcome: string; source?: string });
}

beforeEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
  mockSecure.clear();
  frames = [];
  __resetArenaStoreForTests();
  __resetGoLiveLocationForTests();
  __resetLocationLadderForTests();
  __resetDeviceLocationStoreForTests();
  __resetPresenceCapabilityForTests();
  __resetChallengerArenaReadingForTests();
  __setConnectivityForTests(true);
  Object.defineProperty(AppState, "currentState", { value: "active", configurable: true });
  mockLocationRequired = true;
  mockFlagRead = null;
  mockRefusal = null;
  mockGetPermission.mockResolvedValue({ granted: true, canAskAgain: true, status: "granted" });
  mockRequestPermission.mockResolvedValue({ granted: true, canAskAgain: true });
  mockLastKnown.mockResolvedValue(null);
  mockCurrent.mockResolvedValue({ ...FRESH, timestamp: Date.now() });
  mockReport.mockImplementation(() => Promise.resolve(recorded()));
  mockLog.mockResolvedValue({ ok: true, data: { logged: true } });
  mockWrite.mockResolvedValue(true);
  announceSpy = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation((t: string) => {
    announce(t);
  });
});

afterEach(() => {
  announceSpy?.mockRestore();
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// The ladder
// ---------------------------------------------------------------------------

describe("rung 1: the server still holds the stored go_live tag", () => {
  it("green on the tap, before the write lands; only the live write; one announcement; logged server_tag", async () => {
    seedTag(5 * MIN);
    const write = deferred<boolean>();
    mockWrite.mockReturnValue(write.promise);
    mount();
    let pending!: Promise<unknown>;
    act(() => {
      pending = arenaActions.goLive();
    });
    await flush();
    // Optimistic: drawn live while the write is in flight.
    expect(getGoLiveDisplay()).toBe("optimistic");
    expect(lead()).toBe("LIVE");
    expect(screen.getByTestId("header-status-chip").props.accessibilityValue).toEqual({ text: "live" });
    expect(mockReport).not.toHaveBeenCalled();
    expect(mockCurrent).not.toHaveBeenCalled();
    expect(mockLastKnown).not.toHaveBeenCalled();
    await act(async () => {
      write.resolve(true);
      await pending;
    });
    expect(lead()).toBe("LIVE");
    expect(getGoLiveDisplay()).toBeNull();
    expect(announce.mock.calls.filter((c) => c[0] === "You're live")).toHaveLength(1);
    expect(logged()).toEqual([expect.objectContaining({ outcome: "ok", source: "server_tag" })]);
    // Never a pending or a grey frame between the tap and LIVE.
    expect(frames.some((f) => /going-live|finding-you|recovering|retry/.test(f))).toBe(false);
    expect(frames.filter((f) => f.endsWith(":off")).every((f) => f.startsWith("none") || f.startsWith("hold"))).toBe(true);
  });

  it("a tag under 15 minutes old takes no background refresh (backend known current)", async () => {
    __resetPresenceCapabilityForTests("tagged");
    seedTag(5 * MIN);
    mount();
    await act(async () => {
      await arenaActions.goLive();
    });
    await flush();
    expect(mockCurrent).not.toHaveBeenCalled();
    expect(mockReport).not.toHaveBeenCalled();
  });

  it("a young tag with the backend still unknown: one refresh, whose answer tells current from legacy", async () => {
    seedTag(5 * MIN);
    mockReport.mockResolvedValue({ ok: true, data: { ok: true, verdict: "recorded", started: false, match_id: null } });
    mount();
    await act(async () => {
      await arenaActions.goLive();
    });
    await waitFor(() => expect(mockReport).toHaveBeenCalledTimes(1));
    // An answer without captured_at: a legacy backend (its 60 s refresh runs).
    expect(getPresenceCapability()).toBe("legacy");
  });

  it("a tag over 15 minutes old takes ONE silent refresh (permission granted), never awaited, never a prompt", async () => {
    seedTag(40 * MIN);
    mount();
    let r: unknown;
    await act(async () => {
      r = await arenaActions.goLive();
    });
    expect(r).toBe(true);
    await waitFor(() => expect(mockReport).toHaveBeenCalledTimes(1));
    // A reading taken now: no capture time, the plain two-argument call.
    expect(mockReport.mock.calls[0]).toHaveLength(2);
    expect(mockRequestPermission).not.toHaveBeenCalled();
    expect(mockLastKnown).not.toHaveBeenCalled();
  });

  it("refused location_required (the server lost the tag): rung 2 replays it with its capture time; still green throughout", async () => {
    const at = seedTag(30 * MIN);
    mockWrite.mockResolvedValueOnce(false).mockResolvedValue(true);
    mockRefusal = "location_required";
    mount();
    let r: unknown;
    await act(async () => {
      r = await arenaActions.goLive();
    });
    expect(r).toBe(true);
    expect(mockReport).toHaveBeenCalledWith({ tag: "client" }, TAG, { capturedAt: at });
    expect(mockWrite).toHaveBeenCalledTimes(2);
    expect(logged()).toEqual([expect.objectContaining({ outcome: "ok", source: "device" })]);
    expect(frames.some((f) => /going-live|finding-you|recovering|retry/.test(f))).toBe(false);
  });
});

describe("rung 2: a stored browse or arena reading", () => {
  it("is reported as go_live with its capture time, then the write; logged device", async () => {
    const at = seedTag(20 * MIN, "browse");
    mount();
    let r: unknown;
    await act(async () => {
      r = await arenaActions.goLive();
    });
    expect(r).toBe(true);
    const order = [mockReport.mock.invocationCallOrder[0], mockWrite.mock.invocationCallOrder[0]];
    expect(order[0]).toBeLessThan(order[1]);
    expect(mockReport.mock.calls[0]).toEqual([{ tag: "client" }, TAG, { capturedAt: at }]);
    expect(logged()[0]).toMatchObject({ outcome: "ok", source: "device" });
  });

  it.each(["tag_too_old", "implausible_movement", "accuracy_too_low", "captured_at_invalid"])(
    "refused %s: the entry is deleted and rung 3 (the OS cache) is tried, still green",
    async (code) => {
      seedTag(20 * MIN, "browse");
      const osAt = Date.now() - 10 * MIN;
      mockLastKnown.mockResolvedValue({ coords: { latitude: 43.7, longitude: -79.4, accuracy: 40 }, timestamp: osAt });
      mockReport.mockResolvedValueOnce(refused(code)).mockImplementation(() => Promise.resolve(recorded()));
      mount();
      let r: unknown;
      await act(async () => {
        r = await arenaActions.goLive();
      });
      expect(r).toBe(true);
      // The refused browse reading is dropped (memory slot, S3).
      expect(peekDeviceReading("me-1")).toBeNull();
      expect(mockLastKnown).toHaveBeenCalledWith({
        maxAge: GO_LIVE_TAG_MAX_AGE_MS - GO_LIVE_TAG_MARGIN_MS,
        requiredAccuracy: 100,
      });
      expect(mockReport.mock.calls[1]).toEqual([
        { tag: "client" },
        { lat: 43.7, lng: -79.4, accuracyM: 40 },
        { capturedAt: osAt },
      ]);
      expect(logged()[0]).toMatchObject({ outcome: "ok", source: "os_cache" });
      expect(frames.some((f) => /going-live|finding-you|recovering|retry/.test(f))).toBe(false);
    },
  );
});

describe("rung 3: the OS cache", () => {
  it("no stored tag: a valid OS fix is evidence for the flip, reported with its own timestamp", async () => {
    const osAt = Date.now() - 30 * MIN;
    mockLastKnown.mockResolvedValue({ coords: { latitude: 43.7, longitude: -79.4, accuracy: 35 }, timestamp: osAt });
    mount();
    let r: unknown;
    await act(async () => {
      r = await arenaActions.goLive();
    });
    expect(r).toBe(true);
    expect(frames).toContain("optimistic:live");
    expect(mockReport.mock.calls[0]).toEqual([
      { tag: "client" },
      { lat: 43.7, lng: -79.4, accuracyM: 35 },
      { capturedAt: osAt },
    ]);
    // No GPS before the live write: the only fix is the silent background
    // refresh AFTER it (rung 3 always takes one, with permission granted).
    expect(mockWrite.mock.invocationCallOrder[0]).toBeLessThan(mockCurrent.mock.invocationCallOrder[0] ?? Infinity);
    await waitFor(() => expect(mockReport).toHaveBeenCalledTimes(2));
    expect(mockReport.mock.calls[1]).toHaveLength(2);
    expect(logged()[0]).toMatchObject({ outcome: "ok", source: "os_cache" });
  });

  it.each([
    ["older than 4 h minus the margin", GO_LIVE_TAG_MAX_AGE_MS - GO_LIVE_TAG_MARGIN_MS + MIN, 30],
    ["coarser than 100 m", 10 * MIN, 140],
  ])("an OS fix %s is ignored (the OS may ignore the options): a fresh fix", async (_c, age, acc) => {
    mockLastKnown.mockResolvedValue({
      coords: { latitude: 43.7, longitude: -79.4, accuracy: acc },
      timestamp: Date.now() - age,
    });
    mount();
    let r: unknown;
    await act(async () => {
      r = await arenaActions.goLive();
    });
    expect(r).toBe(true);
    expect(frames).not.toContain("optimistic:live");
    expect(mockCurrent).toHaveBeenCalled();
    // The fresh reading carries no capture time.
    expect(mockReport).toHaveBeenCalledWith({ tag: "client" }, expect.anything(), { capturedAt: null });
    expect(logged()[0]).toMatchObject({ outcome: "ok", source: "fresh" });
    // A fresh fix IS the new tag: no background refresh after rung 4.
    await flush();
    expect(mockReport).toHaveBeenCalledTimes(1);
  });

  it("without permission rung 3 is skipped: no OS lookup, no prompt before the athlete's own Continue", async () => {
    mockGetPermission.mockResolvedValue({ granted: false, canAskAgain: true, status: "undetermined" });
    mount();
    act(() => {
      void arenaActions.goLive();
    });
    await waitFor(() => expect(screen.getByTestId("go-live-location-explain")).toBeTruthy());
    expect(mockLastKnown).not.toHaveBeenCalled();
    expect(mockRequestPermission).not.toHaveBeenCalled();
    // No pending state under a sheet that waits on the athlete.
    expect(lead()).toBe("GO LIVE");
  });
});

// ---------------------------------------------------------------------------
// Timings (UX 019, 2.3)
// ---------------------------------------------------------------------------

describe("the 240 ms reveal", () => {
  it("no evidence, permission granted: nothing pending before 240 ms, FINDING YOU at 240 ms, then LIVE with one announcement", async () => {
    jest.useFakeTimers();
    const fix = deferred<unknown>();
    mockCurrent.mockReturnValue(fix.promise);
    mount();
    let pending!: Promise<unknown>;
    act(() => {
      pending = arenaActions.goLive();
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(PENDING_REVEAL_MS - 10);
    });
    expect(lead()).toBe("GO LIVE");
    expect(screen.getByTestId("header-status-chip").props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
    await act(async () => {
      await jest.advanceTimersByTimeAsync(10);
    });
    expect(lead()).toBe("FINDING YOU");
    expect(screen.getByTestId("header-status-chip").props.accessibilityLabel).toBe("Live status: finding your location");
    expect(screen.getByTestId("header-status-chip").props.accessibilityValue?.text).toBeUndefined();
    // Over a second: announced once.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1_100);
    });
    expect(announce.mock.calls.filter((c) => c[0] === "Finding your location")).toHaveLength(1);
    await act(async () => {
      fix.resolve({ ...FRESH, timestamp: Date.now() });
      await jest.advanceTimersByTimeAsync(0);
      await pending;
    });
    expect(lead()).toBe("LIVE");
    expect(announce.mock.calls.filter((c) => c[0] === "You're live")).toHaveLength(1);
    // Exactly offline, then pending, then live: never green before the write.
    expect(frames.filter((f) => f === "optimistic:live")).toHaveLength(0);
  });

  it("an OS cache lookup still running at 240 ms: GOING LIVE, then FINDING YOU once it gives up (the one allowed label change)", async () => {
    jest.useFakeTimers();
    mockLastKnown.mockReturnValue(new Promise(() => undefined));
    const fix = deferred<unknown>();
    mockCurrent.mockReturnValue(fix.promise);
    mount();
    act(() => {
      void arenaActions.goLive();
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(PENDING_REVEAL_MS);
    });
    expect(lead()).toBe("GOING LIVE");
    await act(async () => {
      await jest.advanceTimersByTimeAsync(OS_CACHE_BUDGET_MS);
    });
    expect(lead()).toBe("FINDING YOU");
    const labels = frames.filter((f) => /going-live|finding-you/.test(f));
    expect(labels).toEqual(["going-live:off", "finding-you:off"]);
  });

  it("evidence but NetInfo says no connection: no flip; GOING LIVE at 240 ms; it lands when the network returns", async () => {
    jest.useFakeTimers();
    seedTag(5 * MIN);
    __setConnectivityForTests(false);
    mockWrite.mockResolvedValueOnce(false).mockResolvedValue(true);
    mount();
    let pending!: Promise<unknown>;
    act(() => {
      pending = arenaActions.goLive();
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(PENDING_REVEAL_MS);
    });
    expect(lead()).toBe("GOING LIVE");
    await act(async () => {
      await jest.advanceTimersByTimeAsync(2_000);
      await pending;
    });
    expect(lead()).toBe("LIVE");
    expect(frames).not.toContain("optimistic:live");
    expect(frames).not.toContain("recovering:off");
  });
});

// ---------------------------------------------------------------------------
// Rollback, recovery
// ---------------------------------------------------------------------------

describe("optimistic LIVE never outlives a server refusal", () => {
  it.each([
    ["tag_too_old", "tag_too_old"],
    ["captured_at_invalid", "permission_denied"],
    ["implausible_movement", "permission_denied"],
    ["accuracy_too_low", "permission_denied"],
  ])(
    "rung 1 refused location_required, rung 2 refused %s, no permission for more: back to GO LIVE (logged %s)",
    async (code, outcome) => {
      seedTag(30 * MIN);
      mockGetPermission.mockResolvedValue({ granted: false, canAskAgain: false, status: "denied" });
      // The first write is a real round trip (so the green frame renders).
      const first = deferred<boolean>();
      mockWrite.mockReturnValueOnce(first.promise).mockResolvedValue(false);
      mockRefusal = "location_required";
      mockReport.mockResolvedValue(refused(code));
      mount();
      let pending!: Promise<unknown>;
      act(() => {
        pending = arenaActions.goLive();
      });
      await flush();
      expect(lead()).toBe("LIVE");
      await act(async () => {
        first.resolve(false);
      });
      // Rung 4 needs the athlete: the denied sheet (the tap allows it).
      await waitFor(() => expect(screen.getByTestId("go-live-location-denied")).toBeTruthy());
      expect(frames).toContain("optimistic:live");
      // Under the sheet the chip is not green any more.
      expect(lead()).toBe("GO LIVE");
      fireEvent.press(screen.getByText("Not now"));
      let r: unknown;
      await act(async () => {
        r = await pending;
      });
      expect(r).toBe("ignored");
      expect(lead()).toBe("GO LIVE");
      expect(frames[frames.length - 1]).toBe("none:off");
      expect(mockSecureDelete).toHaveBeenCalledWith(KEY);
      expect(mockRequestPermission).not.toHaveBeenCalled();
      expect(logged()).toEqual([expect.objectContaining({ outcome })]);
      // The athlete hears why on VoiceOver from the chip.
      expect(screen.getByTestId("header-status-chip").props.accessibilityHint).toBe("Location needed to go live");
    },
  );

  it("every cached rung refused with permission granted: drops to FINDING YOU once (the allowed flicker), then live", async () => {
    seedTag(30 * MIN);
    const first = deferred<boolean>();
    mockWrite.mockReturnValueOnce(first.promise).mockResolvedValue(true);
    mockRefusal = "location_required";
    mockReport.mockResolvedValueOnce(refused("tag_too_old")).mockImplementation(() => Promise.resolve(recorded()));
    const fix = deferred<unknown>();
    mockCurrent.mockReturnValueOnce(fix.promise);
    mount();
    let pending!: Promise<unknown>;
    act(() => {
      pending = arenaActions.goLive();
    });
    await flush();
    expect(lead()).toBe("LIVE");
    await act(async () => {
      first.resolve(false);
    });
    await flush();
    expect(lead()).toBe("FINDING YOU");
    let r: unknown;
    await act(async () => {
      fix.resolve({ ...FRESH, timestamp: Date.now() });
      r = await pending;
    });
    expect(r).toBe(true);
    const seq = frames.filter((f) => f !== "hold:off" && f !== "none:off");
    expect(seq[0]).toBe("optimistic:live");
    expect(seq).toContain("finding-you:off");
    expect(lead()).toBe("LIVE");
    expect(logged()[0]).toMatchObject({ outcome: "ok", source: "fresh" });
  });
});

describe("RECONNECTING and OFFLINE · RETRY (UX 019, 3g)", () => {
  it("no ack within 5 s: RECONNECTING (announced once); lands within 15 s: LIVE, no second 'You're live'", async () => {
    jest.useFakeTimers();
    seedTag(5 * MIN);
    const write = deferred<boolean>();
    mockWrite.mockReturnValue(write.promise);
    mount();
    let pending!: Promise<unknown>;
    act(() => {
      pending = arenaActions.goLive();
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(OPTIMISTIC_CONFIRM_MS - 100);
    });
    expect(lead()).toBe("LIVE");
    await act(async () => {
      await jest.advanceTimersByTimeAsync(100);
    });
    expect(lead()).toBe("RECONNECTING");
    expect(announce.mock.calls.filter((c) => c[0] === "Reconnecting")).toHaveLength(1);
    await act(async () => {
      write.resolve(true);
      await pending;
    });
    expect(lead()).toBe("LIVE");
    expect(announce.mock.calls.filter((c) => c[0] === "You're live")).toHaveLength(1);
  });

  it("a write that keeps failing for a network reason: retried with backoff, OFFLINE · RETRY at 15 s, no toast from the chip", async () => {
    jest.useFakeTimers();
    seedTag(5 * MIN);
    mockWrite.mockResolvedValue(false);
    mount();
    let pending!: Promise<unknown>;
    act(() => {
      pending = arenaActions.goLive();
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1_500);
    });
    expect(lead()).toBe("RECONNECTING");
    let r: unknown;
    await act(async () => {
      await jest.advanceTimersByTimeAsync(RECOVERY_WINDOW_MS);
      r = await pending;
    });
    expect(r).toBe(false);
    expect(mockWrite.mock.calls.length).toBeGreaterThan(2);
    expect(lead()).toBe("OFFLINE · RETRY");
    expect(mockToastInfo).not.toHaveBeenCalled();
    expect(logged()).toEqual([expect.objectContaining({ outcome: "error" })]);
  });

  it("from an Arena surface the same failure toasts once", async () => {
    jest.useFakeTimers();
    seedTag(5 * MIN);
    mockWrite.mockResolvedValue(false);
    mount();
    let pending!: Promise<void>;
    act(() => {
      pending = goLiveWithFeedback();
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(RECOVERY_WINDOW_MS + 100);
      await pending;
    });
    expect(mockToastInfo).toHaveBeenCalledTimes(1);
    expect(mockToastInfo).toHaveBeenCalledWith("Couldn't take you live. Try again.");
  });
});

// ---------------------------------------------------------------------------
// A valid tag without permission; no dialog without a tap
// ---------------------------------------------------------------------------

describe("a valid tag goes live whatever the permission says now (no prompt)", () => {
  it.each([
    ["Allow Once lapsed (undetermined)", { granted: false, canAskAgain: true, status: "undetermined" }],
    ["denied in Settings", { granted: false, canAskAgain: false, status: "denied" }],
  ])("%s: instant, no sheet, no system dialog, no refresh", async (_c, perm) => {
    seedTag(40 * MIN);
    mockGetPermission.mockResolvedValue(perm);
    mount();
    let r: unknown;
    await act(async () => {
      r = await arenaActions.goLive();
    });
    expect(r).toBe(true);
    expect(frames).toContain("optimistic:live");
    expect(screen.queryByTestId("go-live-location-explain")).toBeNull();
    expect(screen.queryByTestId("go-live-location-denied")).toBeNull();
    expect(mockRequestPermission).not.toHaveBeenCalled();
    await flush();
    // The silent refresh needs permission already granted.
    expect(mockCurrent).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Restores
// ---------------------------------------------------------------------------

describe("restores (foreground, after a match, cold start)", () => {
  function autoLive() {
    return (mockLiveArgs.mock.calls.at(-1)[0] as { autoLive: (ctx: unknown) => Promise<string> }).autoLive;
  }
  function ctx() {
    return {
      write: () => mockLiveApi.goLive(),
      lastRefusal: () => mockRefusal,
      canWrite: () => "ok",
      reason: "foreground",
    };
  }

  it("a valid tag: drawn live from the first frame (before any await), no haptic Moment, no announcement, no prompt", async () => {
    seedTag(30 * MIN);
    mount();
    await flush(); // the owner read the store into memory
    const write = deferred<boolean>();
    mockWrite.mockReturnValue(write.promise);
    let p!: Promise<string>;
    act(() => {
      p = autoLive()(ctx());
    });
    // Synchronously, on the call.
    expect(getGoLiveDisplay()).toBe("restore-live");
    expect(lead()).toBe("LIVE");
    expect(isAthleteGoLiveFlip()).toBe(false);
    let r = "";
    await act(async () => {
      write.resolve(true);
      r = await p;
    });
    expect(r).toBe("live");
    expect(lead()).toBe("LIVE");
    expect(announce).not.toHaveBeenCalled();
    expect(mockRequestPermission).not.toHaveBeenCalled();
    expect(mockLog).not.toHaveBeenCalled();
    expect(mockToastInfo).not.toHaveBeenCalled();
  });

  it("no tag, permission granted: FINDING YOU, a silent fix (never asks), then live, no toast", async () => {
    mount();
    await flush();
    const fix = deferred<unknown>();
    mockCurrent.mockReturnValue(fix.promise);
    let p!: Promise<string>;
    act(() => {
      p = autoLive()(ctx());
    });
    await flush();
    expect(lead()).toBe("FINDING YOU");
    let r = "";
    await act(async () => {
      fix.resolve({ ...FRESH, timestamp: Date.now() });
      r = await p;
    });
    expect(r).toBe("live");
    expect(lead()).toBe("LIVE");
    expect(mockRequestPermission).not.toHaveBeenCalled();
    expect(mockToastInfo).not.toHaveBeenCalled();
  });

  it("no tag, the silent fix fails: GO LIVE and exactly one toast 'Couldn't find your location. Tap to go live again.'", async () => {
    mount();
    await flush();
    mockCurrent.mockRejectedValue(new Error("no fix"));
    let r = "";
    await act(async () => {
      r = await autoLive()(ctx());
    });
    expect(r).toBe("failed");
    expect(mockWrite).not.toHaveBeenCalled();
    expect(lead()).toBe("GO LIVE");
    expect(mockToastInfo).toHaveBeenCalledTimes(1);
    expect(mockToastInfo.mock.calls[0][0]).toMatchObject({
      text1: "Couldn't find your location. Tap to go live again.",
      onPress: expect.any(Function),
    });
  });

  it("no tag, no permission: no reading, no write, no dialog, the location-off toast", async () => {
    mockGetPermission.mockResolvedValue({ granted: false, canAskAgain: true, status: "undetermined" });
    mount();
    await flush();
    let r = "";
    await act(async () => {
      r = await autoLive()(ctx());
    });
    expect(r).toBe("failed");
    expect(mockCurrent).not.toHaveBeenCalled();
    expect(mockRequestPermission).not.toHaveBeenCalled();
    expect(mockWrite).not.toHaveBeenCalled();
    expect(mockToastInfo.mock.calls[0][0]).toMatchObject({ text1: "Location is off for ELO RATED. Tap to go live again." });
  });

  it("parks (no write) when the app is backgrounded mid-restore", async () => {
    seedTag(30 * MIN);
    mount();
    await flush();
    let r = "";
    await act(async () => {
      r = await autoLive()({ ...ctx(), canWrite: () => "parked" });
    });
    expect(r).toBe("parked");
    expect(mockWrite).not.toHaveBeenCalled();
    expect(mockToastInfo).not.toHaveBeenCalled();
  });

  it("leaving for the background while live with a valid tag keeps the chip drawn live for the return", async () => {
    seedTag(30 * MIN);
    mount();
    await flush();
    const { onResumeParked } = mockLiveArgs.mock.calls.at(-1)[0] as { onResumeParked: () => void };
    act(() => onResumeParked());
    expect(getGoLiveDisplay()).toBe("restore-live");
  });
});

// ---------------------------------------------------------------------------
// The old backend (before the instant go-live migration)
// ---------------------------------------------------------------------------

describe("an older backend: PGRST202 for p_captured_at", () => {
  it("never resends the stored location without its capture time; falls to a fresh reading; goes legacy", async () => {
    const at = seedTag(30 * MIN, "browse");
    mockReport
      .mockResolvedValueOnce(PGRST202)
      // An older backend's ok answer has no captured_at.
      .mockResolvedValue({ ok: true, data: { ok: true, verdict: "recorded", started: false, match_id: null } });
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    mount();
    let r: unknown;
    await act(async () => {
      r = await arenaActions.goLive();
    });
    expect(r).toBe(true);
    expect(mockReport.mock.calls[0]).toEqual([{ tag: "client" }, TAG, { capturedAt: at }]);
    // The second report is the FRESH reading, never the stored one.
    expect(mockReport.mock.calls[1][1]).toEqual({ lat: 43.66, lng: -79.39, accuracyM: 15 });
    expect(mockReport.mock.calls[1][2]).toEqual({ capturedAt: null });
    expect(mockReport.mock.calls.some((c) => c[1] === TAG || (c[1].lat === TAG.lat && c[2]?.capturedAt == null))).toBe(false);
    expect(getPresenceCapability()).toBe("legacy");
    expect(logged()[0]).toMatchObject({ outcome: "ok", source: "fresh" });
  });

  it("legacy: the next tap is the old flow (fresh reading first, no replay, no OS-cache rung), and nothing is stored", async () => {
    __resetPresenceCapabilityForTests("legacy");
    seedTag(5 * MIN);
    mockReport.mockResolvedValue({ ok: true, data: { ok: true, verdict: "recorded", started: false, match_id: null } });
    mount();
    let r: unknown;
    await act(async () => {
      r = await arenaActions.goLive();
    });
    expect(r).toBe(true);
    // The old flow's fast path asks the OS for a last known under 60 s only.
    expect(mockLastKnown).toHaveBeenCalledWith({ maxAge: 60_000, requiredAccuracy: 100 });
    expect(mockReport).toHaveBeenCalledTimes(1);
    expect(mockReport.mock.calls[0]).toHaveLength(2);
    expect(frames).not.toContain("optimistic:live");
  });
});

// ---------------------------------------------------------------------------
// Logging and the device store
// ---------------------------------------------------------------------------

describe("logging never blocks", () => {
  it("a log that never settles changes nothing: still live", async () => {
    seedTag(5 * MIN);
    mockLog.mockReturnValue(new Promise(() => undefined));
    mount();
    let r: unknown;
    await act(async () => {
      r = await arenaActions.goLive();
    });
    expect(r).toBe(true);
    expect(lead()).toBe("LIVE");
  });
});

describe("the device store through the ladder", () => {
  it("an accepted fresh report is stored with the SERVER's captured_at", async () => {
    const serverAt = "2026-10-04T10:00:00.000Z";
    mockReport.mockImplementation(() => Promise.resolve(recorded(serverAt)));
    mount();
    await act(async () => {
      await arenaActions.goLive();
    });
    expect(peekDeviceTag("me-1", Date.parse(serverAt) + MIN)).toMatchObject({
      lat: 43.66,
      lng: -79.39,
      accuracyM: 15,
      capturedAt: Date.parse(serverAt),
      context: "go_live",
    });
  });

  it("a refused fresh report is never stored", async () => {
    mockReport.mockResolvedValue(refused("accuracy_too_low"));
    mount();
    act(() => {
      void arenaActions.goLive();
    });
    await waitFor(() => expect(screen.getByTestId("go-live-location-accuracy")).toBeTruthy());
    expect(peekDeviceTag("me-1")).toBeNull();
    expect(mockSecure.has(KEY)).toBe(false);
  });
});


// ---------------------------------------------------------------------------
// Review round 1
// ---------------------------------------------------------------------------

describe("B1: the recovery window covers network phases only", () => {
  it("an explain sheet left open over 15 s, then Continue and Allow: the report AND the live write go out; live", async () => {
    jest.useFakeTimers();
    mockGetPermission.mockResolvedValue({ granted: false, canAskAgain: true, status: "undetermined" });
    mount();
    let pending!: Promise<unknown>;
    act(() => {
      pending = arenaActions.goLive();
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(50);
    });
    expect(screen.getByTestId("go-live-location-explain")).toBeTruthy();
    // The athlete reads the sheet for 20 s.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(20_000);
    });
    fireEvent.press(screen.getByText("Continue"));
    let r: unknown;
    await act(async () => {
      await jest.advanceTimersByTimeAsync(100);
      r = await pending;
    });
    expect(r).toBe(true);
    expect(mockReport).toHaveBeenCalledTimes(1);
    expect(mockWrite).toHaveBeenCalledTimes(1);
    expect(lead()).toBe("LIVE");
    expect(frames).not.toContain("retry:off");
  });

  it("Retry after a Settings round trip (30 s on the denied sheet) goes live", async () => {
    jest.useFakeTimers();
    mockGetPermission.mockResolvedValue({ granted: false, canAskAgain: false, status: "denied" });
    mount();
    let pending!: Promise<unknown>;
    act(() => {
      pending = arenaActions.goLive();
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(50);
    });
    expect(screen.getByTestId("go-live-location-denied")).toBeTruthy();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(30_000);
    });
    mockGetPermission.mockResolvedValue({ granted: true, canAskAgain: true, status: "granted" });
    fireEvent.press(screen.getByTestId("go-live-location-retry"));
    let r: unknown;
    await act(async () => {
      await jest.advanceTimersByTimeAsync(100);
      r = await pending;
    });
    expect(r).toBe(true);
    expect(mockWrite).toHaveBeenCalledTimes(1);
    expect(lead()).toBe("LIVE");
  });

  it("a write that lands after the 15 s window is a success: never OFFLINE · RETRY, no toast", async () => {
    jest.useFakeTimers();
    seedTag(5 * MIN);
    const write = deferred<boolean>();
    mockWrite.mockReturnValue(write.promise);
    mount();
    let pending!: Promise<void>;
    act(() => {
      pending = goLiveWithFeedback();
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(20_000);
    });
    // Still waiting on the server, honestly: RECONNECTING, not RETRY.
    expect(lead()).toBe("RECONNECTING");
    await act(async () => {
      write.resolve(true);
      await pending;
    });
    expect(lead()).toBe("LIVE");
    expect(frames).not.toContain("retry:off");
    expect(mockToastInfo).not.toHaveBeenCalled();
    expect(mockWrite).toHaveBeenCalledTimes(1);
  });

  it("a report that lands after the window still gets its live write", async () => {
    jest.useFakeTimers();
    const report = deferred<unknown>();
    mockReport.mockReturnValueOnce(report.promise);
    mount();
    let pending!: Promise<unknown>;
    act(() => {
      pending = arenaActions.goLive();
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(20_000);
    });
    let r: unknown;
    await act(async () => {
      report.resolve(recorded());
      await jest.advanceTimersByTimeAsync(10);
      r = await pending;
    });
    expect(r).toBe(true);
    expect(mockWrite).toHaveBeenCalledTimes(1);
  });

  it("a restore whose write is slower than the window: live, with no 'You're offline' toast first", async () => {
    jest.useFakeTimers();
    seedTag(30 * MIN);
    mount();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(10);
    });
    const write = deferred<boolean>();
    mockWrite.mockReturnValue(write.promise);
    const { autoLive } = mockLiveArgs.mock.calls.at(-1)[0] as { autoLive: (ctx: unknown) => Promise<string> };
    let p!: Promise<string>;
    act(() => {
      p = autoLive({ write: () => mockLiveApi.goLive(), lastRefusal: () => mockRefusal, canWrite: () => "ok", reason: "foreground" });
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(25_000);
    });
    expect(mockToastInfo).not.toHaveBeenCalled();
    let r = "";
    await act(async () => {
      write.resolve(true);
      r = await p;
    });
    expect(r).toBe("live");
    expect(mockToastInfo).not.toHaveBeenCalled();
    expect(lead()).toBe("LIVE");
  });
});

describe("S1 / N1: a restore's first frame", () => {
  it("a store not read yet is hold (GO LIVE, no taps), never a provisional LIVE", () => {
    expect(restoreFirstFrame("never-read")).toBe("hold");
  });

  it("no tag and no permission: GO LIVE through the whole restore, never a GOING LIVE frame", async () => {
    mockGetPermission.mockResolvedValue({ granted: false, canAskAgain: true, status: "undetermined" });
    mount();
    await flush();
    const { autoLive } = mockLiveArgs.mock.calls.at(-1)[0] as { autoLive: (ctx: unknown) => Promise<string> };
    const leads: string[] = [];
    let p!: Promise<string>;
    act(() => {
      p = autoLive({ write: () => mockLiveApi.goLive(), lastRefusal: () => mockRefusal, canWrite: () => "ok", reason: "arrival" });
    });
    leads.push(lead());
    await act(async () => {
      await p;
    });
    leads.push(lead());
    expect(leads.every((l) => l === "GO LIVE")).toBe(true);
    expect(frames.some((f) => /going-live|restore-live|optimistic/.test(f))).toBe(false);
  });
});

describe("S2: the restore's flag read is bounded", () => {
  const writer = () => ({
    athleteId: "me-1",
    write: () => mockWrite(),
    lastRefusal: () => mockRefusal as "location_required" | null,
    canWrite: () => "ok" as const,
  });

  it("a flag read that never answers: after the bound the restore goes by the hint (on) and lands", async () => {
    jest.useFakeTimers();
    seedTag(30 * MIN);
    mockFlagRead = () => new Promise(() => undefined);
    let p!: Promise<string>;
    act(() => {
      p = restoreLiveSilently({ ...writer(), locationRequiredHint: true });
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(FLAG_READ_BOUND_MS + 10);
    });
    let r = "";
    await act(async () => {
      r = await p;
    });
    expect(r).toBe("live");
    expect(mockWrite).toHaveBeenCalledTimes(1);
  });

  it("hint off and the server says location_required: the flag is marked on and the ladder runs", async () => {
    jest.useFakeTimers();
    seedTag(30 * MIN);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    mockFlagRead = () => new Promise(() => undefined);
    mockWrite.mockResolvedValueOnce(false).mockResolvedValue(true);
    mockRefusal = "location_required";
    let p!: Promise<string>;
    act(() => {
      p = restoreLiveSilently({ ...writer(), locationRequiredHint: false });
    });
    let r = "";
    await act(async () => {
      await jest.advanceTimersByTimeAsync(FLAG_READ_BOUND_MS + 10);
      r = await p;
    });
    expect(mockMarkLocation).toHaveBeenCalledWith(true);
    expect(r).toBe("live");
  });
});

describe("UX defect 2: no RECONNECTING over a restore drawn live", () => {
  it("the chip model keeps LIVE while the lobby rejoins during a restore", () => {
    const base = {
      isLive: false,
      phase: "saving" as const,
      direction: "going-live" as const,
      reconnecting: true,
      lastLiveWriteFailed: false,
      onMat: 3,
      outgoing: null,
      incoming: null,
      incomingTucked: false,
      incomingCount: 0,
      confirm: false,
      controllerReady: true,
      now: Date.now(),
    };
    expect(describeHeaderChip({ ...base, display: "restore-live" }).lead).toBe("LIVE · 3");
    // Settled live with the lobby down past the grace: RECONNECTING.
    expect(describeHeaderChip({ ...base, isLive: true, phase: "ready", display: null }).lead).toBe("RECONNECTING");
  });
});

describe("DEV-only QA hooks", () => {
  afterEach(() => devClearFaults());

  it("a forced report failure goes through the same recovery as a real one", async () => {
    jest.useFakeTimers();
    seedTag(20 * MIN, "browse");
    devFailNext("report");
    mount();
    let r: unknown;
    let pending!: Promise<unknown>;
    act(() => {
      pending = arenaActions.goLive();
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(3_000);
      r = await pending;
    });
    // The fault ate the first try; the retry landed (then one live write).
    expect(r).toBe(true);
    expect(mockWrite).toHaveBeenCalledTimes(1);
    expect(mockReport.mock.calls[0][2]).toEqual({ capturedAt: expect.any(Number) });
  });

  it("a forced fix accuracy reaches the sheets (300 m: too rough)", async () => {
    devNextFix({ kind: "accuracy", accuracyM: 300 });
    mockReport.mockResolvedValue(refused("accuracy_too_low"));
    mount();
    act(() => {
      void arenaActions.goLive();
    });
    await waitFor(() => expect(screen.getByTestId("go-live-location-accuracy")).toBeTruthy());
    expect(mockReport.mock.calls[0][1]).toMatchObject({ accuracyM: 300 });
  });

  it("is inert outside __DEV__", async () => {
    const g = globalThis as unknown as { __DEV__: boolean };
    const dev = g.__DEV__;
    g.__DEV__ = false;
    try {
      devFailNext("write");
    } finally {
      g.__DEV__ = dev;
    }
    seedTag(5 * MIN);
    mount();
    let r: unknown;
    await act(async () => {
      r = await arenaActions.goLive();
    });
    expect(r).toBe(true);
    expect(mockWrite).toHaveBeenCalledTimes(1);
  });
});

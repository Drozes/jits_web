/**
 * Go Live and Arena starts with `match_location_required` (contract-location-
 * flag 6), at the live owner: `<ArenaBootstrap />` with the real Go Live
 * location flow and sheet, driven through `arenaActions.goLive()` exactly as
 * the Arena screen and the header chip call it.
 *
 *  - flag OFF: Go Live is exactly as before (no location read, no prompt);
 *  - flag ON: explain, permission, a fresh reading reported as `go_live`,
 *    then live; denied with Open Settings; poor accuracy with Retry; the
 *    server's `location_required` HINT with Retry;
 *  - the 60 s go_live refresh runs only while live, foregrounded and not
 *    in a match, and stops with live state;
 *  - an Arena start the proximity gate refused shows its reason with Retry
 *    and Cancel.
 *
 * Source: apps/mobile/lib/arena/arena-bootstrap.tsx,
 * apps/mobile/lib/arena/go-live-location.ts,
 * apps/mobile/components/arena/go-live-location-sheet.tsx,
 * apps/mobile/components/arena/start-blocked-sheet.tsx
 */
import * as React from "react";
import { AppState, Linking } from "react-native";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react-native";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));

let mockLocationRequired = false;
const mockMark = jest.fn((on: boolean) => {
  mockLocationRequired = on;
});
jest.mock("@/lib/arena/match-location-flag", () => ({
  useMatchLocationRequired: () => mockLocationRequired,
  readMatchLocationRequired: () => Promise.resolve(mockLocationRequired),
  markMatchLocationRequired: (on: boolean) => mockMark(on),
}));

const mockPermission = jest.fn();
jest.mock("expo-location", () => ({
  getForegroundPermissionsAsync: () => mockPermission(),
}));
const mockReading = jest.fn();
let mockInFlight = false;
jest.mock("@/lib/invites/location", () => ({
  readLocationOnce: (...a: unknown[]) => mockReading(...a),
  permissionRequestInFlight: () => mockInFlight,
}));
const mockReport = jest.fn();
const mockArenaReport = jest.fn();
const mockLog = jest.fn();
const mockServerRanked = jest.fn();
jest.mock("@jits/shared/api/location", () => ({
  reportGoLivePresence: (...a: unknown[]) => mockReport(...a),
  reportArenaPresence: (...a: unknown[]) => mockArenaReport(...a),
  logLocationEvent: (...a: unknown[]) => mockLog(...a),
  getMyLookingForRanked: (...a: unknown[]) => mockServerRanked(...a),
}));
jest.mock("@/lib/updates/app-version", () => ({
  readAppVersionInfo: () => ({ appVersion: "0.5.0", buildNumber: "25", updateId: null, isEmbeddedLaunch: true }),
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
const mockPromptProps = jest.fn();
jest.mock("@/components/arena/challenge-prompt-sheet", () => ({
  ChallengePromptSheet: (props: unknown) => {
    mockPromptProps(props);
    return null;
  },
}));

let mockAthlete: Record<string, unknown> | null = null;
jest.mock("@/lib/auth/hooks", () => ({
  useAuth: () => ({ athlete: mockAthlete, refreshAthleteSoft: () => Promise.resolve() }),
}));
jest.mock("@/lib/match-flow/active-match-store", () => ({ useActiveMatchOwner: () => {} }));
jest.mock("@/lib/arena/use-lobby-presence", () => ({
  useLobbyPresence: () => {},
  useLobbyIds: () => new Set<string>(),
  useLobbyKnown: () => true,
}));

let mockIsLive = false;
const mockGoLive = jest.fn();
const mockDropIfServerOffline = jest.fn();
let mockRefusal: string | null = null;
const mockLiveArgs = jest.fn();
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
      dropIfServerOffline: (read: () => Promise<boolean | null>) => mockDropIfServerOffline(read),
    };
  },
}));

let mockStartBlocked: unknown = null;
let mockOutgoing: unknown = null;
let mockIncoming: unknown = null;
const mockRetryBlocked = jest.fn();
const mockCancelBlocked = jest.fn();
const mockChallengeArgs = jest.fn();
jest.mock("@/lib/arena/use-arena-challenge", () => ({
  useArenaChallenge: (args: unknown) => {
    mockChallengeArgs(args);
    return {
      incoming: mockIncoming,
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
      startBlocked: mockStartBlocked,
      retryBlockedStart: mockRetryBlocked,
      cancelBlockedStart: mockCancelBlocked,
    };
  },
}));
jest.mock("@/lib/arena/use-pending-challenge-recovery", () => ({ usePendingChallengeRecovery: () => {} }));

import { ArenaBootstrap } from "@/lib/arena/arena-bootstrap";
import { __resetArenaStoreForTests, arenaActions, useArenaMatchScreen } from "@/lib/arena/arena-store";
import { GO_LIVE_REFRESH_MS, __resetGoLiveLocationForTests } from "@/lib/arena/go-live-location";
import { __resetChallengerArenaReadingForTests } from "@/lib/arena/use-challenger-arena-reading";

const ACTIVE = { id: "me-1", display_name: "Me", current_elo: 1200, current_weight: 180, status: "active" };
const OK_READING = { status: "ok", reading: { lat: 43.6, lng: -79.4, accuracyM: 12 } };
const RECORDED = { ok: true, data: { ok: true, verdict: "recorded", started: false, match_id: null } };
const EXPLAIN =
  "ELO RATED checks you're on the same mat as your opponent. Your location is only used to start matches.";

beforeEach(() => {
  mockInFlight = false;
  jest.clearAllMocks();
  jest.useRealTimers();
  __resetArenaStoreForTests();
  __resetGoLiveLocationForTests();
  Object.defineProperty(AppState, "currentState", { value: "active", configurable: true });
  mockAthlete = { ...ACTIVE };
  mockIsLive = false;
  mockLocationRequired = false;
  mockRefusal = null;
  mockStartBlocked = null;
  mockOutgoing = null;
  mockIncoming = null;
  __resetChallengerArenaReadingForTests();
  mockArenaReport.mockResolvedValue(RECORDED);
  mockGoLive.mockResolvedValue(true);
  mockPermission.mockResolvedValue({ granted: true, canAskAgain: true });
  mockReading.mockResolvedValue(OK_READING);
  mockReport.mockResolvedValue(RECORDED);
  mockLog.mockResolvedValue({ ok: true, data: { logged: true } });
  mockDropIfServerOffline.mockResolvedValue(false);
  mockServerRanked.mockResolvedValue(true);
});

/** Start a Go Live tap; resolves once it settles. */
function tapGoLive() {
  const pending = arenaActions.goLive();
  const settle = async () => {
    let result: unknown;
    await act(async () => {
      result = await pending;
    });
    return result;
  };
  return {
    get done() {
      return settle();
    },
  };
}

describe("flag OFF: Go Live unchanged", () => {
  it("goes live with no location read and no prompt", async () => {
    render(<ArenaBootstrap />);
    const { done } = tapGoLive();
    expect(await done).toBe(true);
    expect(mockGoLive).toHaveBeenCalledTimes(1);
    expect(mockReading).not.toHaveBeenCalled();
    expect(mockReport).not.toHaveBeenCalled();
    expect(screen.queryByTestId("go-live-location-explain")).toBeNull();
  });

  it("a server that refuses with location_required turns the location step on", async () => {
    mockGoLive.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    mockRefusal = "location_required";
    render(<ArenaBootstrap />);
    const { done } = tapGoLive();
    expect(await done).toBe(true);
    expect(mockMark).toHaveBeenCalledWith(true);
    expect(mockReport).toHaveBeenCalledTimes(1);
    expect(mockGoLive).toHaveBeenCalledTimes(2);
  });

  it("a restore runs no reading", async () => {
    render(<ArenaBootstrap />);
    const { beforeAutoLive } = mockLiveArgs.mock.calls.at(-1)[0] as { beforeAutoLive: () => Promise<void> };
    await act(async () => {
      await beforeAutoLive();
    });
    expect(mockReading).not.toHaveBeenCalled();
  });
});

describe("flag ON: Go Live needs a fresh reading", () => {
  beforeEach(() => {
    mockLocationRequired = true;
  });

  it("permission already granted: reads, reports go_live, then goes live", async () => {
    const order: string[] = [];
    mockReport.mockImplementation(async () => {
      order.push("report");
      return RECORDED;
    });
    mockGoLive.mockImplementation(async () => {
      order.push("live");
      return true;
    });
    render(<ArenaBootstrap />);
    const { done } = tapGoLive();
    expect(await done).toBe(true);
    expect(mockReading).toHaveBeenCalledWith({ ask: true, fast: true });
    expect(mockReport).toHaveBeenCalledWith({}, OK_READING.reading);
    expect(order).toEqual(["report", "live"]);
  });

  it("never asked: explains first, Continue asks and goes live", async () => {
    mockPermission.mockResolvedValue({ granted: false, canAskAgain: true });
    render(<ArenaBootstrap />);
    const { done } = tapGoLive();
    await waitFor(() => expect(screen.getByTestId("go-live-location-explain")).toBeTruthy());
    expect(screen.getByTestId("go-live-location-body")).toHaveTextContent(EXPLAIN);
    expect(mockReading).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText("Continue"));
    expect(await done).toBe(true);
    expect(mockReading).toHaveBeenCalledWith({ ask: true, fast: true });
    expect(screen.queryByTestId("go-live-location-explain")).toBeNull();
  });

  it("never asked, Not now: stays offline, silently", async () => {
    mockPermission.mockResolvedValue({ granted: false, canAskAgain: true });
    render(<ArenaBootstrap />);
    const { done } = tapGoLive();
    await waitFor(() => expect(screen.getByTestId("go-live-location-explain")).toBeTruthy());
    fireEvent.press(screen.getByText("Not now"));
    expect(await done).toBe("ignored");
    expect(mockGoLive).not.toHaveBeenCalled();
    expect(mockReading).not.toHaveBeenCalled();
  });

  it("denied at the system prompt: the denied state, Open Settings, not live", async () => {
    mockPermission.mockResolvedValue({ granted: false, canAskAgain: true });
    mockReading.mockResolvedValue({ status: "denied", canAskAgain: false });
    const openSettings = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
    render(<ArenaBootstrap />);
    const { done } = tapGoLive();
    await waitFor(() => expect(screen.getByTestId("go-live-location-explain")).toBeTruthy());
    fireEvent.press(screen.getByText("Continue"));
    await waitFor(() => expect(screen.getByTestId("go-live-location-denied")).toBeTruthy());
    expect(screen.getByTestId("go-live-location-body")).toHaveTextContent(/^Location is off\./);
    fireEvent.press(screen.getByText("Open Settings"));
    expect(await done).toBe("ignored");
    expect(openSettings).toHaveBeenCalled();
    expect(mockGoLive).not.toHaveBeenCalled();
  });

  it("denied before (cannot ask): straight to the denied state", async () => {
    mockPermission.mockResolvedValue({ granted: false, canAskAgain: false });
    render(<ArenaBootstrap />);
    const { done } = tapGoLive();
    await waitFor(() => expect(screen.getByTestId("go-live-location-denied")).toBeTruthy());
    fireEvent.press(screen.getByText("Not now"));
    expect(await done).toBe("ignored");
    expect(mockReading).not.toHaveBeenCalled();
    expect(mockGoLive).not.toHaveBeenCalled();
  });

  it("accuracy too low: the accuracy copy, Retry, then live", async () => {
    mockReport.mockResolvedValueOnce({ ok: true, data: { ok: false, code: "accuracy_too_low" } });
    render(<ArenaBootstrap />);
    const { done } = tapGoLive();
    await waitFor(() => expect(screen.getByTestId("go-live-location-accuracy")).toBeTruthy());
    expect(screen.getByTestId("go-live-location-body")).toHaveTextContent(
      "Can't pin your location. Try near a window.",
    );
    expect(mockGoLive).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText("Retry"));
    expect(await done).toBe(true);
    expect(mockReport).toHaveBeenCalledTimes(2);
    expect(mockGoLive).toHaveBeenCalledTimes(1);
  });

  it("no fix in time: the no-location state with Retry; Not now stays offline", async () => {
    mockReading.mockResolvedValue({ status: "unavailable" });
    render(<ArenaBootstrap />);
    const { done } = tapGoLive();
    await waitFor(() => expect(screen.getByTestId("go-live-location-unavailable")).toBeTruthy());
    fireEvent.press(screen.getByText("Not now"));
    expect(await done).toBe("ignored");
    expect(mockGoLive).not.toHaveBeenCalled();
  });

  it("the server's location_required HINT: the same state with Retry", async () => {
    mockGoLive.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    mockRefusal = "location_required";
    render(<ArenaBootstrap />);
    const { done } = tapGoLive();
    await waitFor(() => expect(screen.getByTestId("go-live-location-unavailable")).toBeTruthy());
    fireEvent.press(screen.getByText("Retry"));
    expect(await done).toBe(true);
    expect(mockReport).toHaveBeenCalledTimes(2);
    expect(mockGoLive).toHaveBeenCalledTimes(2);
  });

  it("a failed report (network) fails the go-live so the caller says so", async () => {
    mockReport.mockResolvedValue({ ok: false, error: { hint: "unknown", message: "offline" } });
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    render(<ArenaBootstrap />);
    const { done } = tapGoLive();
    expect(await done).toBe(false);
    expect(mockGoLive).not.toHaveBeenCalled();
  });

  it("a restore reads silently (never asks) before the live write", async () => {
    render(<ArenaBootstrap />);
    const { beforeAutoLive } = mockLiveArgs.mock.calls.at(-1)[0] as { beforeAutoLive: () => Promise<boolean> };
    let proceed: boolean | undefined;
    await act(async () => {
      proceed = await beforeAutoLive();
    });
    expect(proceed).toBe(true);
    expect(mockReading).toHaveBeenCalledWith({ ask: false, fast: true });
    expect(mockReport).toHaveBeenCalledTimes(1);
    expect(mockPermission).not.toHaveBeenCalled();
  });

  it("passes the flag to the Arena challenge hook", () => {
    render(<ArenaBootstrap />);
    expect(mockChallengeArgs).toHaveBeenLastCalledWith(expect.objectContaining({ locationRequired: true }));
  });
});

describe("60 s go_live refresh", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  async function advance(ms: number) {
    await act(async () => {
      jest.advanceTimersByTime(ms);
    });
  }

  it("refreshes every 60 s while live with the flag on", async () => {
    mockLocationRequired = true;
    mockIsLive = true;
    render(<ArenaBootstrap />);
    await advance(GO_LIVE_REFRESH_MS - 1);
    expect(mockReport).not.toHaveBeenCalled();
    await advance(1);
    expect(mockReading).toHaveBeenCalledWith({ ask: false, fast: true });
    await waitFor(() => expect(mockReport).toHaveBeenCalledTimes(1));
    await advance(GO_LIVE_REFRESH_MS);
    await waitFor(() => expect(mockReport).toHaveBeenCalledTimes(2));
  });

  it("stops when live state goes off", async () => {
    mockLocationRequired = true;
    mockIsLive = true;
    const r = render(<ArenaBootstrap />);
    mockIsLive = false;
    r.rerender(<ArenaBootstrap />);
    await advance(GO_LIVE_REFRESH_MS * 3);
    expect(mockReading).not.toHaveBeenCalled();
  });

  it("starts when live state comes on", async () => {
    mockLocationRequired = true;
    const r = render(<ArenaBootstrap />);
    await advance(GO_LIVE_REFRESH_MS * 2);
    expect(mockReading).not.toHaveBeenCalled();
    mockIsLive = true;
    r.rerender(<ArenaBootstrap />);
    await advance(GO_LIVE_REFRESH_MS);
    expect(mockReading).toHaveBeenCalledTimes(1);
  });

  it("never runs with the flag off", async () => {
    mockIsLive = true;
    render(<ArenaBootstrap />);
    await advance(GO_LIVE_REFRESH_MS * 3);
    expect(mockReading).not.toHaveBeenCalled();
  });

  it("pauses in a match", async () => {
    mockLocationRequired = true;
    mockIsLive = true;
    render(<ArenaBootstrap />);
    renderHook(() => useArenaMatchScreen());
    await advance(GO_LIVE_REFRESH_MS * 3);
    expect(mockReading).not.toHaveBeenCalled();
  });

  it("skips a tick while backgrounded", async () => {
    mockLocationRequired = true;
    mockIsLive = true;
    render(<ArenaBootstrap />);
    Object.defineProperty(AppState, "currentState", { value: "background", configurable: true });
    await advance(GO_LIVE_REFRESH_MS);
    expect(mockReading).not.toHaveBeenCalled();
  });
});

describe("Arena start refused by the proximity gate", () => {
  const BLOCKED = {
    challengeId: "c1",
    challengerId: "a1",
    challengerName: "ALEX",
    title: "Not on the same mat",
    message: "You need to be on the same mat as ALEX to start.",
  };

  it("shows the reason with Retry and Cancel, never a generic error", () => {
    mockStartBlocked = BLOCKED;
    render(<ArenaBootstrap />);
    expect(screen.getByTestId("arena-start-blocked-title")).toHaveTextContent("Not on the same mat");
    expect(screen.getByTestId("arena-start-blocked-message")).toHaveTextContent(BLOCKED.message);
    fireEvent.press(screen.getByText("Retry"));
    expect(mockRetryBlocked).toHaveBeenCalled();
    fireEvent.press(screen.getByText("Cancel challenge"));
    expect(mockCancelBlocked).toHaveBeenCalled();
  });

  it("is never shown over a match", () => {
    mockStartBlocked = BLOCKED;
    render(<ArenaBootstrap />);
    renderHook(() => useArenaMatchScreen());
    expect(screen.queryByTestId("arena-start-blocked")).toBeNull();
  });

  it("shows nothing when nothing is blocked", () => {
    render(<ArenaBootstrap />);
    expect(screen.queryByTestId("arena-start-blocked")).toBeNull();
  });

  it.each([
    ["my side missing", "Location needed", "Can't confirm your location. Try again."],
    ["their side missing", "Waiting for ALEX", "Waiting for ALEX's location."],
  ])("%s: the title matches the reason", (_case, title, message) => {
    mockStartBlocked = { ...BLOCKED, title, message };
    render(<ArenaBootstrap />);
    expect(screen.getByTestId("arena-start-blocked-title")).toHaveTextContent(title);
    expect(screen.getByTestId("arena-start-blocked-message")).toHaveTextContent(message);
  });

  it("M4: a challenge arriving while the blocked sheet is up never opens a second modal", () => {
    const INCOMING = { challengeId: "c2", challengerId: "a2", challengerName: "SAM" };
    mockIncoming = INCOMING;
    mockStartBlocked = BLOCKED;
    const { rerender } = render(<ArenaBootstrap />);
    expect(screen.getByTestId("arena-start-blocked")).toBeTruthy();
    expect(mockPromptProps.mock.calls.at(-1)?.[0]).toMatchObject({ challenge: null });
    // Answered (Retry started it, or Cancel): the waiting prompt comes up.
    mockStartBlocked = null;
    rerender(<ArenaBootstrap />);
    expect(screen.queryByTestId("arena-start-blocked")).toBeNull();
    expect(mockPromptProps.mock.calls.at(-1)?.[0]).toMatchObject({ challenge: INCOMING });
  });
});

describe("a location sheet never outlives its owner (L5, L6)", () => {
  it("L5: the live owner unmounting (sign-out) answers a waiting Go Live 'cancel' and clears the sheet", async () => {
    mockLocationRequired = true;
    mockPermission.mockResolvedValue({ granted: false, canAskAgain: true });
    const { unmount } = render(<ArenaBootstrap />);
    const tap = tapGoLive();
    await waitFor(() => expect(screen.getByTestId("go-live-location-explain")).toBeTruthy());
    unmount();
    // The Go Live unwinds (the live switch is not held), silently.
    expect(await tap.done).toBe("ignored");
    expect(mockGoLive).not.toHaveBeenCalled();
    // The next owner (the next account) starts with no sheet up.
    render(<ArenaBootstrap />);
    expect(screen.queryByTestId("go-live-location-explain")).toBeNull();
  });

  it("L6: the challenger's explain closes when its challenge stops waiting", async () => {
    mockLocationRequired = true;
    mockOutgoing = { challengeId: "ch-out", opponentId: "a-2", opponentName: "ALEX", createdAt: null, expiresAt: null };
    mockPermission.mockResolvedValue({ granted: false, canAskAgain: true });
    const { rerender } = render(<ArenaBootstrap />);
    await waitFor(() => expect(screen.getByTestId("go-live-location-explain")).toBeTruthy());
    // The opponent declined: no outgoing challenge any more.
    mockOutgoing = null;
    rerender(<ArenaBootstrap />);
    await waitFor(() => expect(screen.queryByTestId("go-live-location-explain")).toBeNull());
    expect(mockArenaReport).not.toHaveBeenCalled();
  });
});

describe("the waiting challenger's arena reading (M1)", () => {
  const OUTGOING = { challengeId: "ch-out", opponentId: "a-2", opponentName: "ALEX", createdAt: null, expiresAt: null };

  it("flag on, permission granted: reports an arena reading for my outgoing challenge, not live", async () => {
    mockLocationRequired = true;
    mockOutgoing = OUTGOING;
    render(<ArenaBootstrap />);
    await waitFor(() => expect(mockArenaReport).toHaveBeenCalledTimes(1));
    expect(mockArenaReport).toHaveBeenCalledWith(expect.anything(), OK_READING.reading, "ch-out");
    expect(mockReading).toHaveBeenCalledWith({ ask: false });
    // The privacy reply (recorded only) is all it needs: no sheet, no copy.
    expect(screen.queryByTestId("go-live-location-explain")).toBeNull();
  });

  it("flag off: no arena reading while waiting", async () => {
    mockOutgoing = OUTGOING;
    render(<ArenaBootstrap />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockArenaReport).not.toHaveBeenCalled();
  });

  it("permission not granted: the waiting state explains once, then asks and reports", async () => {
    mockLocationRequired = true;
    mockOutgoing = OUTGOING;
    mockPermission.mockResolvedValue({ granted: false, canAskAgain: true });
    render(<ArenaBootstrap />);
    await waitFor(() => expect(screen.getByTestId("go-live-location-explain")).toBeTruthy());
    expect(screen.getByText("Location to start")).toBeTruthy();
    expect(screen.getByTestId("go-live-location-body").props.children).toBe(EXPLAIN);
    expect(mockArenaReport).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId("go-live-location-continue"));
    await waitFor(() => expect(mockArenaReport).toHaveBeenCalledTimes(1));
    expect(mockReading).toHaveBeenCalledWith({ ask: true });
    await waitFor(() => expect(screen.queryByTestId("go-live-location-explain")).toBeNull());
  });
});

describe("implausible_movement (reading refused for an implied speed over 50 m/s)", () => {
  it("Go Live: says so once, sends nothing more until the athlete taps Retry", async () => {
    mockLocationRequired = true;
    mockPermission.mockResolvedValue({ granted: true, canAskAgain: true });
    mockReport.mockResolvedValueOnce({ ok: true, data: { ok: false, code: "implausible_movement" } });
    render(<ArenaBootstrap />);
    const tap = tapGoLive();
    await waitFor(() => expect(screen.getByTestId("go-live-location-movement")).toBeTruthy());
    expect(screen.getByTestId("go-live-location-body").props.children).toBe("Can't pin your location. Try again.");
    expect(mockReport).toHaveBeenCalledTimes(1);
    expect(mockGoLive).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText("Retry"));
    expect(await tap.done).toBe(true);
    expect(mockReport).toHaveBeenCalledTimes(2);
  });

  it("the waiting challenger's refused arena reading is not retried before the next 60 s tick", async () => {
    mockLocationRequired = true;
    mockOutgoing = { challengeId: "ch-out", opponentId: "a-2", opponentName: "ALEX", createdAt: null, expiresAt: null };
    mockArenaReport.mockResolvedValue({ ok: true, data: { ok: false, code: "implausible_movement" } });
    jest.spyOn(console, "warn").mockImplementation(() => {});
    render(<ArenaBootstrap />);
    await waitFor(() => expect(mockArenaReport).toHaveBeenCalledTimes(1));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(mockArenaReport).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("go-live-location-movement")).toBeNull();
  });
});

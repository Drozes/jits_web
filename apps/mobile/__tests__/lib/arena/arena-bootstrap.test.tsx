/**
 * The single app-wide Arena owner.
 *
 * Being live persists across tabs and a challenge must reach a live athlete
 * on ANY screen, so the live writer, the lobby channel, the challenge
 * listener and its prompt are mounted here exactly once, beside the Stack,
 * and published to the store the rest of the app reads.
 */
import * as React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
// match_location_required: off unless a test turns it on.
let mockLocationRequired = false;
jest.mock("@/lib/arena/match-location-flag", () => ({
  useMatchLocationRequired: () => mockLocationRequired,
  readMatchLocationRequired: () => Promise.resolve(mockLocationRequired),
  markMatchLocationRequired: jest.fn(),
}));

jest.mock("@gorhom/bottom-sheet", () => {
  const R = require("react");
  const RN = require("react-native");
  return {
    BottomSheetModal: R.forwardRef(
      (props: { children: React.ReactNode }, ref: unknown) => {
        R.useImperativeHandle(ref, () => ({ present: jest.fn(), dismiss: jest.fn() }));
        return R.createElement(RN.View, {}, props.children);
      },
    ),
    BottomSheetView: (props: { children: React.ReactNode }) =>
      R.createElement(RN.View, {}, props.children),
  };
});

// The real prompt mounts its own offline banner, which reads NetInfo.
jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: {
    fetch: async () => ({ isConnected: true }),
    addEventListener: () => () => undefined,
  },
}));

jest.mock("@/lib/theme/use-theme", () => ({
  useResolvedColorScheme: () => "light",
  useThemedTokens: () => ({ bgSecondary: "#13151B", textTertiary: "#8D929D" }),
}));

// The prompt's stakes strip reads calculate_elo_stakes; not under test here.
jest.mock("@/lib/match-flow/use-viewer-stakes", () => ({ useViewerStakes: () => null, viewerStakesKey: () => "" }));

let mockAthlete: Record<string, unknown> | null = null;
const mockRefreshAthleteSoft = jest.fn(() => Promise.resolve());
jest.mock("@/lib/auth/hooks", () => ({
  useAuth: () => ({ athlete: mockAthlete, refreshAthleteSoft: mockRefreshAthleteSoft }),
}));

const mockActiveMatchOwner = jest.fn();
jest.mock("@/lib/match-flow/active-match-store", () => ({
  useActiveMatchOwner: (...a: unknown[]) => mockActiveMatchOwner(...a),
}));

const mockUseLobbyPresence = jest.fn();
jest.mock("@/lib/arena/use-lobby-presence", () => ({
  useLobbyPresence: (...a: unknown[]) => mockUseLobbyPresence(...a),
  useLobbyIds: () => mockLobbyIds,
  useLobbyKnown: () => mockLobbyKnown,
}));
let mockLobbyIds = new Set<string>();
let mockLobbyKnown = true;

const mockToggle = jest.fn().mockResolvedValue(undefined);
const mockGoOffline = jest.fn().mockResolvedValue(true);
const mockUseArenaLive = jest.fn();
let mockIsLive = false;
let mockTransition: "going-live" | "going-offline" | null = null;
let mockLastWriteFailed = false;
jest.mock("@/lib/arena/use-arena-live", () => ({
  useArenaLive: (args: unknown) => {
    mockUseArenaLive(args);
    return {
      isLive: mockIsLive,
      isSaving: false,
      transition: mockTransition,
      lastWriteFailed: mockLastWriteFailed,
      toggle: mockToggle,
      goOffline: mockGoOffline,
    };
  },
}));

const mockAccept = jest.fn();
const mockDecline = jest.fn();
const mockUseArenaChallenge = jest.fn();
const mockTuck = jest.fn();
const mockReopen = jest.fn();
const mockSettleManual = jest.fn();
const mockBeginManualOffline = jest.fn(() => mockSettleManual);
const mockNoteIncomingRead = jest.fn();
let mockIncoming: unknown = null;
let mockIncomingTucked = false;
let mockIncomingCount = 0;
jest.mock("@/lib/arena/use-arena-challenge", () => ({
  useArenaChallenge: (args: unknown) => {
    mockUseArenaChallenge(args);
    return {
      incoming: mockIncoming,
      outgoing: null,
      incomingCount: mockIncomingCount,
      incomingTucked: mockIncomingTucked,
      tuckIncoming: mockTuck,
      reopenIncoming: mockReopen,
      beginManualOffline: mockBeginManualOffline,
      noteIncomingRead: mockNoteIncomingRead,
      isBusy: false,
      capReached: false,
      sendChallenge: jest.fn(),
      accept: mockAccept,
      decline: mockDecline,
      cancelOutgoing: jest.fn(),
      clearCap: jest.fn(),
      offerIncoming: jest.fn(),
      restoreOutgoing: jest.fn(),
    };
  },
}));

const mockRecovery = jest.fn();
jest.mock("@/lib/arena/use-pending-challenge-recovery", () => ({
  usePendingChallengeRecovery: (args: unknown) => mockRecovery(args),
}));

import { ArenaBootstrap, RECONNECTING_GRACE_MS } from "@/lib/arena/arena-bootstrap";
import { Toaster, __resetToastTrackingForTests, toast } from "@/components/ui/toast";
import { PROMPT_INPUT_GUARD_MS, REOPEN_SURFACE_GRACE_MS } from "@/lib/arena/constants";
import { renderHook } from "@testing-library/react-native";
import {
  __resetArenaStoreForTests,
  useArenaMatchScreen,
  arenaActions,
  notifyOpponentUnavailable,
  takeArenaOfflineBeforeSignOut,
  useArenaSelfId,
  useArenaState,
  useIncomingReopenSurface,
} from "@/lib/arena/arena-store";

const ACTIVE = {
  id: "me-1",
  display_name: "Me",
  current_elo: 1200,
  current_weight: 180,
  looking_for_ranked: true,
  status: "active",
};

const RIVAL = {
  challengeId: "ch-1",
  challengerId: "a-9",
  challengerName: "Rival",
  challengerElo: 1350,
  challengerWeight: 190,
};

/** Stands in for the header chip: a mounted surface that can reopen a tucked challenge. */
function ReopenSurface({ active = true }: { active?: boolean }) {
  useIncomingReopenSurface(active);
  return null;
}

/** Reads the store the way a header or the Arena screen would. */
function StoreProbe({ onState }: { onState: (s: unknown) => void }) {
  onState(useArenaState());
  return null;
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetArenaStoreForTests();
  mockLobbyIds = new Set<string>();
  mockLobbyKnown = true;
  mockAthlete = { ...ACTIVE };
  mockIsLive = false;
  mockTransition = null;
  mockLastWriteFailed = false;
  mockIncoming = null;
  mockIncomingTucked = false;
  mockIncomingCount = 0;
  __resetToastTrackingForTests();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("ArenaBootstrap", () => {
  it("publishes the athlete id for the header chip, and clears it on unmount", () => {
    const self = renderHook(() => useArenaSelfId());
    expect(self.result.current).toBeNull();
    const { unmount } = render(<ArenaBootstrap />);
    expect(self.result.current).toBe(ACTIVE.id);
    unmount();
    expect(self.result.current).toBeNull();
  });

  it("re-reads the athlete once each time a match is left (jits-tlk3)", () => {
    render(<ArenaBootstrap />);
    expect(mockRefreshAthleteSoft).not.toHaveBeenCalled();

    const match = renderHook(() => useArenaMatchScreen());
    expect(mockRefreshAthleteSoft).not.toHaveBeenCalled();
    act(() => match.unmount());
    expect(mockRefreshAthleteSoft).toHaveBeenCalledTimes(1);

    const next = renderHook(() => useArenaMatchScreen());
    act(() => next.unmount());
    expect(mockRefreshAthleteSoft).toHaveBeenCalledTimes(2);
  });

  it("tracks an athlete with no rating as null, never as a 0 the IN BAND count would read", () => {
    mockAthlete = { ...ACTIVE, current_elo: null };
    render(<ArenaBootstrap />);
    expect(mockUseArenaLive).toHaveBeenLastCalledWith(
      expect.objectContaining({ currentElo: null }),
    );
  });

  it("mounts the live writer, lobby channel, challenge listener and recovery for the athlete", () => {
    render(<ArenaBootstrap />);

    expect(mockUseLobbyPresence).toHaveBeenCalledWith("me-1");
    expect(mockUseArenaLive).toHaveBeenLastCalledWith({
      athleteId: "me-1",
      displayName: "Me",
      currentElo: 1200,
      initialRanked: true,
      inMatch: false,
      onManualOffline: expect.any(Function),
      autoLive: expect.any(Function),
      onResumeParked: expect.any(Function),
      loadPersistedIntent: expect.any(Function),
      onOfflineLanded: expect.any(Function),
    });
    expect(mockActiveMatchOwner).toHaveBeenCalledWith("me-1");
    expect(mockUseArenaChallenge).toHaveBeenLastCalledWith(
      expect.objectContaining({ athleteId: "me-1", athleteWeight: 180, isLive: false }),
    );
    expect(mockRecovery).toHaveBeenLastCalledWith(
      expect.objectContaining({ athleteId: "me-1", isLive: false, hasIncoming: false }),
    );
  });

  it("passes isLive: true to the challenge listener while live", () => {
    mockIsLive = true;
    render(<ArenaBootstrap />);

    expect(mockUseArenaChallenge).toHaveBeenLastCalledWith(
      expect.objectContaining({ athleteId: "me-1", isLive: true }),
    );
  });

  it("owns nothing for a signed-out or not-yet-active athlete", () => {
    mockAthlete = null;
    const { rerender } = render(<ArenaBootstrap />);
    mockAthlete = { ...ACTIVE, status: "pending" };
    rerender(<ArenaBootstrap />);

    expect(mockUseArenaLive).not.toHaveBeenCalled();
    expect(mockUseLobbyPresence).not.toHaveBeenCalled();
    expect(mockUseArenaChallenge).not.toHaveBeenCalled();
  });

  it("raises the challenge prompt app-wide, with both answers wired", () => {
    // Rendered beside the Stack, not inside the Arena screen: a live athlete
    // on Home or Rankings gets the same prompt.
    jest.useFakeTimers();
    mockIncoming = RIVAL;
    const { getByText, getByLabelText } = render(<ArenaBootstrap />);

    expect(getByText("Rival is live in the Arena")).toBeTruthy();
    expect(getByText("ELO 1350 · 190 LBS")).toBeTruthy();

    // Past the prompt's input guard (AC-S3).
    act(() => jest.advanceTimersByTime(PROMPT_INPUT_GUARD_MS));
    fireEvent.press(getByLabelText("Accept challenge"));
    expect(mockAccept).toHaveBeenCalled();
    fireEvent.press(getByLabelText("Decline challenge"));
    expect(mockDecline).toHaveBeenCalled();
  });

  it("keeps a failed Accept's toast on screen after the prompt closes", () => {
    // use-arena-challenge's accept -> start_match CHALLENGE_NOT_ACCEPTED path:
    // it clears the prompt and toasts in the same flow. The toast first lands
    // on the prompt's in-modal host, which unmounts with the prompt.
    jest.useFakeTimers();
    mockIncoming = RIVAL;
    const App = () => (
      <>
        <Toaster />
        <ArenaBootstrap />
      </>
    );
    const screen = render(<App />);
    act(() => jest.advanceTimersByTime(PROMPT_INPUT_GUARD_MS));
    mockAccept.mockImplementation(() => {
      mockIncoming = null;
      toast.error("That challenge is no longer available.");
    });
    act(() => {
      fireEvent.press(screen.getByLabelText("Accept challenge"));
      screen.rerender(<App />);
    });
    act(() => jest.advanceTimersByTime(0));

    expect(screen.queryByText("Rival is live in the Arena")).toBeNull();
    expect(screen.getAllByText("That challenge is no longer available.")).toHaveLength(1);
    mockAccept.mockReset();
  });

  it("publishes live and challenge state to the store", () => {
    mockIsLive = true;
    mockIncoming = RIVAL;
    const seen: unknown[] = [];
    render(
      <>
        <ArenaBootstrap />
        <StoreProbe onState={(s) => seen.push(s)} />
      </>,
    );

    expect(seen[seen.length - 1]).toMatchObject({ isLive: true, incoming: RIVAL });
  });

  it("publishes a failed go-live from any path as lastLiveWriteFailed (AC-H11)", () => {
    mockLastWriteFailed = true;
    const seen: Record<string, unknown>[] = [];
    const view = render(
      <>
        <ArenaBootstrap />
        <StoreProbe onState={(s) => seen.push(s as Record<string, unknown>)} />
      </>,
    );
    expect(seen[seen.length - 1]).toMatchObject({ isLive: false, lastLiveWriteFailed: true });

    mockLastWriteFailed = false;
    mockIsLive = true;
    view.rerender(
      <>
        <ArenaBootstrap />
        <StoreProbe onState={(s) => seen.push(s as Record<string, unknown>)} />
      </>,
    );
    expect(seen[seen.length - 1]).toMatchObject({ isLive: true, lastLiveWriteFailed: false });
  });

  it("publishes reconnecting only while live with the lobby channel down for over 2 s (AC-H11, UX defect 2)", () => {
    jest.useFakeTimers();
    try {
      const seen: Record<string, unknown>[] = [];
      const tree = () => (
        <>
          <ArenaBootstrap />
          <StoreProbe onState={(s) => seen.push(s as Record<string, unknown>)} />
        </>
      );
      // Offline with the channel down: nothing to reconnect.
      mockLobbyKnown = false;
      const view = render(tree());
      expect(seen[seen.length - 1]).toMatchObject({ reconnecting: false });

      mockIsLive = true;
      view.rerender(tree());
      // The grace: a channel rejoining after a foreground return is not a
      // reconnect (no green, grey, green).
      act(() => {
        jest.advanceTimersByTime(RECONNECTING_GRACE_MS - 10);
      });
      expect(seen.some((x) => x.reconnecting === true)).toBe(false);
      act(() => {
        jest.advanceTimersByTime(10);
      });
      expect(seen[seen.length - 1]).toMatchObject({ isLive: true, reconnecting: true });

      mockLobbyKnown = true;
      view.rerender(tree());
      expect(seen[seen.length - 1]).toMatchObject({ isLive: true, reconnecting: false });
    } finally {
      jest.useRealTimers();
    }
  });

  it("a lobby rejoining within the grace never publishes reconnecting (foreground return)", () => {
    jest.useFakeTimers();
    try {
      const seen: Record<string, unknown>[] = [];
      const tree = () => (
        <>
          <ArenaBootstrap />
          <StoreProbe onState={(s) => seen.push(s as Record<string, unknown>)} />
        </>
      );
      mockIsLive = true;
      mockLobbyKnown = false;
      const view = render(tree());
      act(() => {
        jest.advanceTimersByTime(400);
      });
      mockLobbyKnown = true;
      view.rerender(tree());
      act(() => {
        jest.advanceTimersByTime(5_000);
      });
      expect(seen.some((x) => x.reconnecting === true)).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it("routes the app's actions to its hooks while mounted, and resets on unmount", async () => {
    mockIsLive = true;
    const seen: { isLive: boolean }[] = [];
    const Probe = () => <StoreProbe onState={(s) => seen.push(s as { isLive: boolean })} />;
    const { rerender } = render(
      <>
        <ArenaBootstrap />
        <Probe />
      </>,
    );

    await act(async () => {
      // A choice (review round 3): live now, so the toggle chooses offline.
      await arenaActions.toggle();
      await takeArenaOfflineBeforeSignOut();
    });
    expect(mockGoOffline).toHaveBeenCalled();

    // Sign-out: the athlete goes away and the owner unmounts.
    mockAthlete = null;
    rerender(
      <>
        <ArenaBootstrap />
        <Probe />
      </>,
    );
    expect(seen[seen.length - 1].isLive).toBe(false);

    mockToggle.mockClear();
    await act(async () => {
      await arenaActions.toggle();
    });
    expect(mockToggle).not.toHaveBeenCalled();
  });

  it("passes the in-match bit to every hook and holds the prompt back mid-match", () => {
    mockIncoming = RIVAL;
    const { queryByText, getByText } = render(<ArenaBootstrap />);
    expect(getByText("Rival is live in the Arena")).toBeTruthy();

    const match = renderHook(() => useArenaMatchScreen());

    expect(mockUseArenaLive).toHaveBeenLastCalledWith(
      expect.objectContaining({ inMatch: true }),
    );
    expect(mockUseArenaChallenge).toHaveBeenLastCalledWith(
      expect.objectContaining({ inMatch: true }),
    );
    expect(mockRecovery).toHaveBeenLastCalledWith(
      expect.objectContaining({ inMatch: true }),
    );
    expect(queryByText("Rival is live in the Arena")).toBeNull();

    // Still pending after the match: it comes back.
    match.unmount();
    expect(getByText("Rival is live in the Arena")).toBeTruthy();
  });

  it("Later on the prompt tucks it into the chip without answering (AC-S4)", () => {
    jest.useFakeTimers();
    mockIsLive = true;
    mockIncoming = RIVAL;
    const { getByLabelText } = render(
      <>
        <ArenaBootstrap />
        <ReopenSurface />
      </>,
    );
    act(() => jest.advanceTimersByTime(PROMPT_INPUT_GUARD_MS));

    fireEvent.press(getByLabelText("Later"));
    expect(mockTuck).toHaveBeenCalledTimes(1);
    expect(mockAccept).not.toHaveBeenCalled();
    expect(mockDecline).not.toHaveBeenCalled();
  });

  it("offers no Later while nothing can reopen a tucked challenge (AC-S4)", () => {
    // No header chip mounted (a build without it, or a screen with no
    // header): Later would hide the challenge with no way back to it.
    mockIsLive = true;
    mockIncoming = RIVAL;
    const { queryByLabelText, getByLabelText, rerender } = render(<ArenaBootstrap />);
    expect(getByLabelText("Accept challenge")).toBeTruthy();
    expect(queryByLabelText("Later")).toBeNull();

    rerender(
      <>
        <ArenaBootstrap />
        <ReopenSurface />
      </>,
    );
    expect(getByLabelText("Later")).toBeTruthy();
  });

  it("brings a tucked challenge back up when no surface can reopen it", () => {
    jest.useFakeTimers();
    mockIsLive = true;
    mockIncoming = RIVAL;
    mockIncomingTucked = true;
    render(<ArenaBootstrap />);
    act(() => jest.advanceTimersByTime(REOPEN_SURFACE_GRACE_MS - 1));
    expect(mockReopen).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(1));
    expect(mockReopen).toHaveBeenCalledTimes(1);
  });

  it("does not reopen a tucked challenge whose chip registers after the owner mounts", () => {
    // The owner's effects run before a sibling header's, so for one commit
    // nothing is registered yet.
    jest.useFakeTimers();
    mockIsLive = true;
    mockIncoming = RIVAL;
    mockIncomingTucked = true;
    render(
      <>
        <ArenaBootstrap />
        <ReopenSurface />
      </>,
    );
    act(() => jest.advanceTimersByTime(REOPEN_SURFACE_GRACE_MS * 2));
    expect(mockReopen).not.toHaveBeenCalled();
  });

  it("reopens a tucked challenge when a pushed screen blurs the chip's tab (AC-S4)", () => {
    // Tab roots stay mounted under pushed (app) screens; their chip goes
    // inactive on blur, so the pushed screen hides Later and re-raises.
    jest.useFakeTimers();
    mockIsLive = true;
    mockIncoming = RIVAL;
    mockIncomingTucked = true;
    const { rerender } = render(
      <>
        <ArenaBootstrap />
        <ReopenSurface />
      </>,
    );
    act(() => jest.advanceTimersByTime(REOPEN_SURFACE_GRACE_MS * 2));
    expect(mockReopen).not.toHaveBeenCalled();

    rerender(
      <>
        <ArenaBootstrap />
        <ReopenSurface active={false} />
      </>,
    );
    act(() => jest.advanceTimersByTime(REOPEN_SURFACE_GRACE_MS));
    expect(mockReopen).toHaveBeenCalledTimes(1);
  });

  it("offers no Later on a pushed screen whose tab chip is blurred (AC-S4)", () => {
    mockIsLive = true;
    mockIncoming = RIVAL;
    const { queryByLabelText } = render(
      <>
        <ArenaBootstrap />
        <ReopenSurface active={false} />
      </>,
    );
    expect(queryByLabelText("Later")).toBeNull();
  });

  it("reopens a tucked challenge when the last reopen surface unmounts", () => {
    jest.useFakeTimers();
    mockIsLive = true;
    mockIncoming = RIVAL;
    mockIncomingTucked = true;
    const { queryByText, rerender } = render(
      <>
        <ArenaBootstrap />
        <ReopenSurface />
        <ReopenSurface />
      </>,
    );
    expect(queryByText("Rival is live in the Arena")).toBeNull();

    // One of two goes away (a header remounting): still reopenable.
    rerender(
      <>
        <ArenaBootstrap />
        <ReopenSurface />
      </>,
    );
    act(() => jest.advanceTimersByTime(REOPEN_SURFACE_GRACE_MS * 2));
    expect(mockReopen).not.toHaveBeenCalled();
    expect(queryByText("Rival is live in the Arena")).toBeNull();

    rerender(<ArenaBootstrap />);
    act(() => jest.advanceTimersByTime(REOPEN_SURFACE_GRACE_MS));
    expect(mockReopen).toHaveBeenCalledTimes(1);
  });

  it("shows the first challenge plus +N more from the incoming count (AC-S6)", () => {
    mockIsLive = true;
    mockIncoming = RIVAL;
    mockIncomingCount = 3;
    const { getByText, getAllByLabelText, rerender, queryByTestId } = render(<ArenaBootstrap />);
    expect(getByText("+2 more")).toBeTruthy();
    expect(getAllByLabelText("Accept challenge")).toHaveLength(1);

    mockIncomingCount = 1;
    rerender(<ArenaBootstrap />);
    expect(queryByTestId("challenge-prompt-more")).toBeNull();
  });

  it("keeps the sheet down for a challenge tucked away with Later, and publishes it", () => {
    mockIsLive = true;
    mockIncoming = RIVAL;
    mockIncomingTucked = true;
    mockIncomingCount = 3;
    const seen: unknown[] = [];
    const { queryByText } = render(
      <>
        <ArenaBootstrap />
        <ReopenSurface />
        <StoreProbe onState={(s) => seen.push(s)} />
      </>,
    );

    expect(queryByText("Rival is live in the Arena")).toBeNull();
    expect(mockReopen).not.toHaveBeenCalled();
    expect(seen[seen.length - 1]).toMatchObject({
      incoming: RIVAL,
      incomingTucked: true,
      incomingCount: 3,
    });
  });

  it("ignores a live-switch tap while a restore it did not start is in flight, keeping a tucked challenge", async () => {
    // Back from the background: the restore has set the intent to live but
    // nothing has landed, so the switch still reads "Go live". A toggle now
    // would reverse the INTENT and take the athlete offline, dropping the
    // challenge they tucked away.
    mockIsLive = false;
    mockTransition = "going-live";
    mockIncoming = RIVAL;
    mockIncomingTucked = true;
    const seen: unknown[] = [];
    render(
      <>
        <ArenaBootstrap />
        <ReopenSurface />
        <StoreProbe onState={(s) => seen.push(s)} />
      </>,
    );
    expect(seen[seen.length - 1]).toMatchObject({ liveTransition: "going-live" });

    await act(async () => {
      await arenaActions.toggle();
    });
    expect(mockToggle).not.toHaveBeenCalled();
    expect(mockBeginManualOffline).not.toHaveBeenCalled();
    expect(mockSettleManual).not.toHaveBeenCalled();
  });

  it("routes Later and reopen through the store's actions", () => {
    render(<ArenaBootstrap />);
    arenaActions.tuckIncoming();
    arenaActions.reopenIncoming();
    expect(mockTuck).toHaveBeenCalledTimes(1);
    expect(mockReopen).toHaveBeenCalledTimes(1);
  });

  it("a manual go-offline goes through the challenge hook, begin and settle", () => {
    render(<ArenaBootstrap />);
    const { onManualOffline } = mockUseArenaLive.mock.calls[0][0];
    const settle = onManualOffline();
    expect(mockBeginManualOffline).toHaveBeenCalledTimes(1);
    settle(true);
    expect(mockSettleManual).toHaveBeenCalledWith(true);
  });

  it("feeds the lobby to the challenge hook and recovery reads into its count", () => {
    render(<ArenaBootstrap />);
    expect(mockUseArenaChallenge.mock.calls[0][0].lobbyIds).toBe(mockLobbyIds);
    expect(mockRecovery.mock.calls[0][0].onIncomingRead).toBe(mockNoteIncomingRead);
  });

  it("hands the challenge hook an UNKNOWN lobby (null) while presence is unknown (a lost channel)", () => {
    // An empty set would read as "everyone left": prompts cleared, counts
    // dropped, and every challenge refused as "isn't on the mat". Null (not
    // undefined) also makes the hook refuse sends until presence is back.
    mockLobbyKnown = false;
    render(<ArenaBootstrap />);
    expect(mockUseArenaChallenge.mock.calls[0][0].lobbyIds).toBeNull();
    // Recovery still gets the (empty) set: it offers nothing off it.
    expect(mockRecovery.mock.calls[0][0].lobbyIds).toBe(mockLobbyIds);
  });

  it("hands roster corrections through the store", () => {
    render(<ArenaBootstrap />);
    const args = mockUseArenaChallenge.mock.calls[0][0];

    expect(args.onOpponentUnavailable).toBe(notifyOpponentUnavailable);
  });
});

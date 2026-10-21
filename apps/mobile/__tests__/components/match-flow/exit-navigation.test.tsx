/**
 * Exit-navigation contract for the match wizard (jits-3929).
 *
 * `MatchFlowWizard` used to require a `sessionId` whose only job was building
 * four hardcoded `/(app)/session/${sessionId}/lobby` redirects. That made a
 * sessionless match (Arena) impossible to render, and it made an absent
 * session silently produce `/(app)/session/undefined/lobby`.
 *
 * These tests pin the replacement contract:
 *  - the wizard exits to whatever `exitHref` its caller supplies, with the
 *    caller's label, for two different origins (the Arena, which is the only
 *    real caller now that mobile has no gym sessions (jits-gewv), and an
 *    arbitrary second surface, so the href is proven to be threaded rather
 *    than hardcoded);
 *  - the wizard mounts with no session id anywhere in the tree;
 *  - an omitted or blank label falls back to the Arena wording;
 *  - no exit anywhere in the match-flow tree can still build a
 *    `/(app)/session/<something>/lobby` URL, so the `undefined` lobby
 *    regression cannot come back;
 *  - timekeeper mode (slice M4, spec 6.2): every reason-specific exit goes
 *    through `exitMatchTo` once, with its deck toast for the roles that see
 *    it (TK-W2, TK-E1, TK-NC1 to TK-NC7, TK-K17), and the seated
 *    timekeeper's heartbeat stops with the wizard.
 */
import * as React from "react";
import { Alert } from "react-native";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";

// ---- mocks ----

jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  const stub = () => R.createElement(RN.View, { testID: "icon" });
  return new Proxy(
    {},
    {
      get: (_target: Record<string, unknown>, prop: string) => {
        if (prop === "__esModule") return true;
        return stub;
      },
    },
  );
});

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("@/lib/theme/use-theme", () => ({
  useResolvedColorScheme: () => "light",
  useThemedTokens: () => ({
    textPrimary: "#E8EDF2",
    textSecondary: "#9AA3AD",
    statePositive: "#3FB950",
  }),
}));

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
// The Film status read is unavailable here (jits-n2im.25).
jest.mock("@/lib/video/use-film-status", () => require("../../support/film-status-mock").unavailableFilmStatusModule());
// Match-level match_videos realtime (jits-n2im.12): its own tests live in
// packages/shared; here it is inert.
const mockMatchVideosRealtime = jest.fn();
jest.mock("@jits/shared/hooks/use-match-videos-realtime", () => ({
  useMatchVideosRealtime: (...a: unknown[]) => mockMatchVideosRealtime(...a) ?? { subscribed: true },
}));

jest.mock("@/components/ui/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockRouterDismissTo = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ dismissTo: mockRouterDismissTo, push: jest.fn(), back: jest.fn() }),
}));

jest.mock("@/lib/auth/hooks", () => ({
  useAuth: () => ({ athlete: { id: "me-1" } }),
}));

// The queue banner subscribes to the offline mutation queue; irrelevant here.
jest.mock("@/lib/network/mutation-queue", () => ({
  mutationQueue: { size: () => 0, subscribe: () => () => {} },
}));

// The ELO primitives pull in reanimated via the barrel; the exits under test
// do not depend on them, so render them as plain containers.
jest.mock("@/components/ui/elo-system", () => {
  const R = require("react");
  const RN = require("react-native");
  return {
    EloTile: () => R.createElement(RN.View, { testID: "elo-tile" }),
    Plate: ({ children }: { children: React.ReactNode }) =>
      R.createElement(RN.View, null, children),
  };
});

// Reached only because the step renderer imports every step eagerly; the
// live step's recorder chain pulls the untransformed Sentry ESM bundle in.
jest.mock("@/lib/error-tracking/sentry", () => ({
  captureException: jest.fn(),
}));

jest.mock("@jits/shared/api/mutations", () => ({
  startMatch: jest.fn(),
  cancelSessionMatch: jest.fn(),
}));

// The wizard's reconciler reads both on mount; mock both so it never calls
// through to an unmocked export (which throws into its catch and warns).
jest.mock("@jits/shared/api/queries", () => {
  const getMatchDetails = jest.fn();
  return {
    getMatchDetails,
    getMatchConfirmations: jest.fn(() => Promise.resolve([])),
    // A timekeeper's reconciler read (the timekeeper-mode exits below): the
    // same match, with the confirmations the done screen would show.
    getMatchDetailsWithConfirmations: jest.fn(async (...a: unknown[]) => {
      const match = await getMatchDetails(...a);
      return match ? { match, confirmations: [] } : null;
    }),
    // The ranked face-off's stakes strip; null hides it.
    getRatingStakes: jest.fn(() => Promise.resolve(null)),
    // The verdict's opening still.
    getMatchDetailView: jest.fn(() => Promise.resolve({ ok: true, data: { videos: [] } })),
  };
});
// Timekeeper mode (the exits below): the state read and the timekeeper's
// heartbeat. A two-athlete match never calls either.
const mockGetTimekeeperState = jest.fn();
const mockTouchTimekeeper = jest.fn();
jest.mock("@jits/shared/api/timekeeper", () => ({
  ...jest.requireActual("@jits/shared/api/timekeeper"),
  getTimekeeperMatchState: (...a: unknown[]) => mockGetTimekeeperState(...a),
  touchMatchTimekeeper: (...a: unknown[]) => mockTouchTimekeeper(...a),
}));
jest.mock("@jits/shared/api/match-rank-change", () => ({
  getMatchRankChange: jest.fn(() => Promise.resolve({ ok: false, error: { code: "UNKNOWN", message: "n/a" } })),
}));
jest.mock("expo-image", () => {
  const R = require("react");
  const RN = require("react-native");
  return { Image: () => R.createElement(RN.View, { testID: "still-image" }) };
});

interface CapturedSyncParams {
  onReadySignal?: (athleteId: string) => void;
  onTimerStarted?: (startedAt: string) => void;
  onMatchCancelled?: () => void;
}
let mockSyncParams: CapturedSyncParams | null = null;
jest.mock("@jits/shared/hooks/use-session-match-sync", () => ({
  useSessionMatchSync: (params: CapturedSyncParams) => {
    mockSyncParams = params;
    return {
      broadcastTimerStarted: jest.fn(),
      broadcastReady: jest.fn(),
      broadcastMatchCancelled: jest.fn(),
      broadcastWeighedIn: jest.fn(),
      broadcastRecordingOptIn: jest.fn(),
    };
  },
}));

const mockUseMatchDetails = jest.fn();
jest.mock("@/lib/match-flow/use-match-details", () => ({
  useMatchDetails: (matchId: string) => mockUseMatchDetails(matchId),
}));

import { MatchFlowWizard } from "@/components/match-flow/match-flow-wizard";
import { cancelSessionMatch } from "@jits/shared/api/mutations";
import { ARENA_EXIT_LABEL, ARENA_HREF } from "@/lib/arena/constants";

const mockCancelSessionMatch = cancelSessionMatch as jest.Mock;

// ---- fixtures ----

const ARENA_EXIT = ARENA_HREF;
const ARENA_LABEL = ARENA_EXIT_LABEL;
// A second, non-Arena origin. Nothing on mobile passes it today; it exists so
// the tests can tell a threaded exitHref from one hardcoded to the Arena.
const OTHER_EXIT = "/(app)/(home)";
const OTHER_LABEL = "Back to Home";

function participant(id: string, name: string, outcome: string | null) {
  return {
    athlete_id: id,
    display_name: name,
    current_elo: 1200,
    current_weight: 80,
    outcome,
    elo_before: 1190,
    elo_after: 1200,
    elo_delta: 10,
    weight_division_gap: 0,
  };
}

/** A completed match whose wizard mounts straight into the summary step. */
function completedMatchResult() {
  return {
    match: {
      id: "M1",
      status: "completed",
      match_type: "ranked",
      duration_seconds: 300,
      started_at: "2026-06-10T12:00:00.000Z",
      paused_at: null,
      total_paused_duration: 0,
      participants: [
        participant("me-1", "Me", "win"),
        participant("opp-1", "Opponent", "loss"),
      ],
    },
    submissionTypes: [],
    isLoading: false,
    error: null,
    refresh: jest.fn(),
  };
}

/**
 * A FIRST LOAD that failed, exactly as `useMatchDetails` reports one.
 *
 * `getMatchDetails` resolves null on ANY failure, and the hook turns that
 * into `error` set with `match` still null (lib/match-flow/use-match-details.ts
 * :44-48; its catch branch does the same with the thrown message). So this
 * combination is not contrived, it is the only shape a failed first load has.
 */
function firstLoadFailureResult() {
  return {
    match: null,
    submissionTypes: [],
    isLoading: false,
    error: "Match not found",
    refresh: jest.fn(),
  };
}

/** A match the current athlete is not part of: the wizard's error splash. */
function notAParticipantResult() {
  return {
    ...completedMatchResult(),
    match: {
      ...completedMatchResult().match,
      participants: [
        participant("someone-else", "A", "win"),
        participant("another", "B", "loss"),
      ],
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSyncParams = null;
});

describe("MatchFlowWizard exit navigation", () => {
  it("exits to a caller-supplied non-Arena href with the caller's copy", async () => {
    mockUseMatchDetails.mockReturnValue(completedMatchResult());

    const { getByText, queryByText } = render(
      <MatchFlowWizard
        exitHref={OTHER_EXIT}
        exitLabel={OTHER_LABEL}
        matchId="M1"
        currentAthleteId="me-1"
      />,
    );

    expect(queryByText(ARENA_LABEL)).toBeNull();
    fireEvent.press(getByText(OTHER_LABEL));
    expect(mockRouterDismissTo).toHaveBeenCalledWith(OTHER_EXIT);
  });

  it("mounts with no session at all and exits to the supplied href", async () => {
    mockUseMatchDetails.mockReturnValue(completedMatchResult());

    // No sessionId prop exists to pass: the wizard is origin-agnostic.
    const { getByText, queryByText } = render(
      <MatchFlowWizard
        exitHref={ARENA_EXIT}
        exitLabel={ARENA_LABEL}
        matchId="M1"
        currentAthleteId="me-1"
      />,
    );

    expect(queryByText(OTHER_LABEL)).toBeNull();
    fireEvent.press(getByText(ARENA_LABEL));
    expect(mockRouterDismissTo).toHaveBeenCalledWith(ARENA_EXIT);
  });

  it("routes the not-a-participant splash through exitHref for both origins", () => {
    mockUseMatchDetails.mockReturnValue(notAParticipantResult());

    const other = render(
      <MatchFlowWizard
        exitHref={OTHER_EXIT}
        exitLabel={OTHER_LABEL}
        matchId="M1"
        currentAthleteId="me-1"
      />,
    );
    other.getByText("Not a participant");
    fireEvent.press(other.getByText(OTHER_LABEL));
    expect(mockRouterDismissTo).toHaveBeenLastCalledWith(OTHER_EXIT);
    other.unmount();

    const arena = render(
      <MatchFlowWizard
        exitHref={ARENA_EXIT}
        exitLabel={ARENA_LABEL}
        matchId="M1"
        currentAthleteId="me-1"
      />,
    );
    arena.getByText("Not a participant");
    fireEvent.press(arena.getByText(ARENA_LABEL));
    expect(mockRouterDismissTo).toHaveBeenLastCalledWith(ARENA_EXIT);
  });

  it("the reconciler's mount-time reads both hit mocks, never an unmocked export", async () => {
    const { getMatchConfirmations } = jest.requireMock("@jits/shared/api/queries") as {
      getMatchConfirmations: jest.Mock;
    };
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    mockUseMatchDetails.mockReturnValue(completedMatchResult());
    render(
      <MatchFlowWizard exitHref={ARENA_EXIT} exitLabel={ARENA_LABEL} matchId="M1" currentAthleteId="me-1" />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(getMatchConfirmations).toHaveBeenCalledWith(expect.anything(), "M1");
    expect(warn).not.toHaveBeenCalledWith("[match-flow] reconcile failed", expect.anything());
    warn.mockRestore();
  });

  it("routes a FIRST-LOAD failure to the error splash, not a permanent spinner", () => {
    // The loading guard used to run first and include `|| !match`, so on a
    // failed first load the `!match` term won and `WizardError` was
    // unreachable: a permanent "Loading match..." with no exit cta, for a
    // match that had already finished failing to load.
    mockUseMatchDetails.mockReturnValue(firstLoadFailureResult());

    const { getByText, queryByText } = render(
      <MatchFlowWizard
        exitHref={ARENA_EXIT}
        exitLabel={ARENA_LABEL}
        matchId="M1"
        currentAthleteId="me-1"
      />,
    );

    expect(queryByText("Loading match...")).toBeNull();
    getByText("Match unavailable");
    getByText("Match not found");
    fireEvent.press(getByText(ARENA_LABEL));
    expect(mockRouterDismissTo).toHaveBeenLastCalledWith(ARENA_EXIT);
  });

  it("defaults exitLabel to the Arena wording when omitted", () => {
    mockUseMatchDetails.mockReturnValue(notAParticipantResult());

    const { getByText, queryByText } = render(
      <MatchFlowWizard exitHref={OTHER_EXIT} matchId="M1" currentAthleteId="me-1" />,
    );

    // Mobile has no session lobby to go "back" to any more.
    expect(queryByText("Back to Lobby")).toBeNull();
    // The label defaults, the href never does: it is still the caller's.
    fireEvent.press(getByText(ARENA_EXIT_LABEL));
    expect(mockRouterDismissTo).toHaveBeenCalledWith(OTHER_EXIT);
  });

  // A default parameter only fires on `undefined`, so a blank label used to
  // reach the cta and render a full-width tappable Pressable with empty Text:
  // invisible on screen and unlabeled to VoiceOver / TalkBack. Callers that
  // compute the label from data can produce exactly that.
  it.each([
    ["empty string", ""],
    ["whitespace only", "   "],
    ["tab and newline", "\t\n"],
  ])("falls back to the default label when exitLabel is %s", (_name, label) => {
    mockUseMatchDetails.mockReturnValue(notAParticipantResult());

    const { getByText } = render(
      <MatchFlowWizard
        exitHref={ARENA_EXIT}
        exitLabel={label}
        matchId="M1"
        currentAthleteId="me-1"
      />,
    );

    // The cta is visible and reachable by its text, and still exits correctly.
    fireEvent.press(getByText(ARENA_EXIT_LABEL));
    expect(mockRouterDismissTo).toHaveBeenCalledWith(ARENA_EXIT);
  });

  it("falls back to the default label on the summary step too", () => {
    mockUseMatchDetails.mockReturnValue(completedMatchResult());

    const { getByText } = render(
      <MatchFlowWizard
        exitHref={ARENA_EXIT}
        exitLabel="   "
        matchId="M1"
        currentAthleteId="me-1"
      />,
    );

    fireEvent.press(getByText(ARENA_EXIT_LABEL));
    expect(mockRouterDismissTo).toHaveBeenCalledWith(ARENA_EXIT);
  });

  it("resets the scroll to the top on entering the verdict, so its hero and status bar start at y 0", () => {
    mockUseMatchDetails.mockReturnValue(completedMatchResult());
    const scrollTo = (require("react-native").ScrollView.prototype as { scrollTo: jest.Mock }).scrollTo;
    scrollTo.mockClear();
    render(<MatchFlowWizard exitHref={ARENA_EXIT} exitLabel={ARENA_LABEL} matchId="M1" currentAthleteId="me-1" />);
    expect(scrollTo).toHaveBeenCalledWith({ y: 0, animated: false });
  });

  it("offers no Rematch on the verdict; Back to Arena is the way back (jits-02vo.8)", async () => {
    mockUseMatchDetails.mockReturnValue(completedMatchResult());

    const { getByTestId, queryByTestId, queryByText } = render(
      <MatchFlowWizard exitHref={ARENA_EXIT} exitLabel={ARENA_LABEL} matchId="M1" currentAthleteId="me-1" />,
    );

    expect(queryByTestId("summary-rematch")).toBeNull();
    expect(queryByText(/rematch/i)).toBeNull();
    await act(async () => {
      fireEvent.press(getByTestId("summary-exit"));
    });
    await waitFor(() => expect(mockRouterDismissTo).toHaveBeenCalledWith(ARENA_EXIT));
    expect(mockRouterDismissTo.mock.calls.some(([h]: [unknown]) => String(h).includes("rematch"))).toBe(false);
  });

  it("keeps a caller label that merely has surrounding whitespace", () => {
    mockUseMatchDetails.mockReturnValue(completedMatchResult());

    const { getByText } = render(
      <MatchFlowWizard
        exitHref={ARENA_EXIT}
        exitLabel="  Back to Arena  "
        matchId="M1"
        currentAthleteId="me-1"
      />,
    );

    fireEvent.press(getByText(ARENA_LABEL));
    expect(mockRouterDismissTo).toHaveBeenCalledWith(ARENA_EXIT);
  });
});

describe("face-off exit navigation", () => {
  function pendingMatch() {
    return {
      ...completedMatchResult(),
      match: { ...completedMatchResult().match, status: "pending", started_at: null },
    };
  }

  function renderOnReady(exitHref: string) {
    mockUseMatchDetails.mockReturnValue(pendingMatch());
    const screen = render(
      <MatchFlowWizard exitHref={exitHref} exitLabel="Back" matchId="M1" currentAthleteId="me-1" />,
    );
    fireEvent.press(screen.getByTestId("weight-confirm"));
    screen.getByTestId("match-step-ready");
    return screen;
  }

  it("leaves through the wizard's exit (once) when the opponent cancels", () => {
    renderOnReady(ARENA_EXIT);
    act(() => {
      mockSyncParams?.onMatchCancelled?.();
      mockSyncParams?.onMatchCancelled?.();
    });
    expect(mockRouterDismissTo).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["Arena", ARENA_EXIT],
    ["non-Arena", OTHER_EXIT],
  ])("returns to the %s exitHref when the opponent cancels", (_name, exitHref) => {
    renderOnReady(exitHref);
    act(() => {
      mockSyncParams?.onMatchCancelled?.();
    });
    expect(mockRouterDismissTo).toHaveBeenCalledTimes(1);
    expect(mockRouterDismissTo).toHaveBeenCalledWith(exitHref);
  });

  it.each([
    ["Arena", ARENA_EXIT],
    ["non-Arena", OTHER_EXIT],
  ])("Leave (the harness's 'Cancel match') returns to the %s exitHref", async (_name, exitHref) => {
    mockCancelSessionMatch.mockResolvedValue({ ok: true, data: {} });
    const alertSpy = jest
      .spyOn(Alert, "alert")
      .mockImplementation((_title, _message, buttons) => {
        // Index 1 is the destructive "Cancel Match" confirmation.
        buttons?.[1]?.onPress?.();
      });

    const { getByLabelText } = renderOnReady(exitHref);
    fireEvent.press(getByLabelText("Cancel match"));

    await waitFor(() => expect(mockRouterDismissTo).toHaveBeenCalledWith(exitHref));
    expect(alertSpy.mock.calls[0][0]).toBe("Cancel match?");
    alertSpy.mockRestore();
  });

  it("Leave is on the weigh-in too, which used to have no way out but back (jits-bh2v)", async () => {
    mockCancelSessionMatch.mockResolvedValue({ ok: true, data: {} });
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => buttons?.[1]?.onPress?.());
    mockUseMatchDetails.mockReturnValue(pendingMatch());
    const { getByLabelText, getByTestId } = render(
      <MatchFlowWizard exitHref={ARENA_EXIT} exitLabel="Back" matchId="M1" currentAthleteId="me-1" />,
    );
    getByTestId("match-step-weight");
    fireEvent.press(getByLabelText("Cancel match"));
    await waitFor(() => expect(mockCancelSessionMatch).toHaveBeenCalledWith(expect.anything(), "M1"));
    await waitFor(() => expect(mockRouterDismissTo).toHaveBeenCalledWith(ARENA_EXIT));
    alertSpy.mockRestore();
  });
});

describe("timekeeper-mode exits (spec 6.2; slice M4)", () => {
  // Every reason-specific exit through `exitMatchTo` with its deck toast
  // (`noContestExit`, the real one), for the roles that see it: TK-W2, TK-E1,
  // TK-NC1 to TK-NC7 and TK-K17. The real wizard and reconciler: the match in
  // hand is pending with the timekeeper seated, and the reconciler's first
  // read finds it cancelled with its reason.
  const { getMatchDetails } = jest.requireMock("@jits/shared/api/queries") as { getMatchDetails: jest.Mock };
  const { toast } = jest.requireMock("@/components/ui/toast") as { toast: { info: jest.Mock } };
  const TK = "tk-1";

  function tkParticipant(id: string, name: string) {
    return { ...participant(id, name, null), profile_photo_url: null, role: "competitor", elo_before: null, elo_after: null, elo_delta: null };
  }

  function tkMatch(status: string, extra: Record<string, unknown> = {}) {
    return {
      id: "M1",
      status,
      match_type: "ranked",
      challenge_id: null,
      session_id: null,
      duration_seconds: 300,
      started_at: null,
      paused_at: null,
      total_paused_duration: 0,
      participants: [tkParticipant("me-1", "Mina Park"), tkParticipant("opp-1", "Dana Okafor")],
      requires_timekeeper: true,
      tk_weight_check_required: true,
      challenger_id: "me-1",
      timekeeper_id: TK,
      timekeeper: { id: TK, display_name: "Jordan Cruz", profile_photo_url: null },
      ended_at: null,
      cancel_reason: null,
      result_edit_count: 0,
      ...extra,
    };
  }

  const STATE = {
    ready: [],
    athleteChecks: [],
    timekeeperChecks: [],
    openRequest: null,
    lastRequestOutcome: null,
    presence: "online",
    offlineSince: null,
    noContestAt: null,
    reviewPending: false,
    timeoutAt: null,
    weights: [],
    editOpen: false,
    editClosesAt: null,
    startBlockers: [],
  };

  async function flushAll() {
    await act(async () => {
      for (let i = 0; i < 8; i++) await Promise.resolve();
    });
  }

  /** Mount `viewer`'s wizard on `inHand` (default: a seated pending match) whose first read is `snapshot`. */
  async function mountTk(viewer: string, snapshot: unknown, inHand: unknown = tkMatch("pending")) {
    mockUseMatchDetails.mockReturnValue({
      match: inHand,
      submissionTypes: [],
      isLoading: false,
      error: null,
      refresh: jest.fn(),
      applyMatch: jest.fn(),
    });
    getMatchDetails.mockResolvedValue(snapshot);
    const screen = render(<MatchFlowWizard exitHref={ARENA_EXIT} exitLabel={ARENA_LABEL} matchId="M1" currentAthleteId={viewer} />);
    await flushAll();
    await flushAll();
    return screen;
  }

  const cancelled = (reason: string) => tkMatch("cancelled", { cancel_reason: reason });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    mockGetTimekeeperState.mockResolvedValue({ ok: true, data: STATE });
    mockTouchTimekeeper.mockResolvedValue({ ok: true, data: { seenAt: "2026-10-20T12:00:00Z" } });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    // The module mocks keep the implementations set here (restoreAllMocks
    // does not reset a jest.fn), so a later two-athlete test would read this
    // describe's cancelled timekeeper-mode snapshot: put them back as found.
    getMatchDetails.mockReset();
    mockGetTimekeeperState.mockReset();
    mockTouchTimekeeper.mockReset();
  });

  it.each([
    ["no_timekeeper", "Match cancelled", "No timekeeper joined in 10 minutes."],
    ["timekeeper_left", "No contest", "J. Cruz left the match. It won't count."],
    ["timekeeper_offline", "No contest", "J. Cruz went offline. The match won't count."],
    ["admin_void", "No contest", "An admin voided M. Park vs D. Okafor. It won't count."],
    ["faceoff_timeout", "No contest", "The match didn't start within 10 minutes. It won't count."],
    ["pause_timeout", "No contest", "The match was paused for over 10 minutes. It won't count."],
    ["athlete_left", "Match cancelled", "D. Okafor left the match."],
  ])("an athlete, %s: %s / %s, once, through exitMatchTo", async (reason, text1, description) => {
    await mountTk("me-1", cancelled(reason));
    expect(toast.info).toHaveBeenCalledTimes(1);
    expect(toast.info).toHaveBeenCalledWith({ text1, description });
    expect(mockRouterDismissTo).toHaveBeenCalledTimes(1);
    expect(mockRouterDismissTo).toHaveBeenCalledWith(ARENA_EXIT);
  });

  it.each([
    ["timekeeper_left", "No contest", "You left the match. It won't count for M. Park or D. Okafor."],
    ["timekeeper_offline", "No contest", "You were offline too long. M. Park vs D. Okafor won't count."],
    ["admin_void", "No contest", "An admin voided M. Park vs D. Okafor. It won't count."],
    ["faceoff_timeout", "No contest", "The match didn't start within 10 minutes. It won't count."],
    ["pause_timeout", "No contest", "The match was paused for over 10 minutes. It won't count."],
  ])("the timekeeper, %s: %s / %s, once, through exitMatchTo", async (reason, text1, description) => {
    await mountTk(TK, cancelled(reason));
    expect(toast.info).toHaveBeenCalledTimes(1);
    expect(toast.info).toHaveBeenCalledWith({ text1, description });
    expect(mockRouterDismissTo).toHaveBeenCalledTimes(1);
    expect(mockRouterDismissTo).toHaveBeenCalledWith(ARENA_EXIT);
  });

  it("the timekeeper, an athlete's Leave: TK-E1 naming the athlete the cancel broadcast named", async () => {
    await mountTk(TK, cancelled("athlete_left"));
    // Held for the name (`CANCEL_ACTOR_GRACE_MS`) until the broadcast lands.
    expect(mockRouterDismissTo).not.toHaveBeenCalled();
    // Timekeeper mode hands the step channel a cancel handler that takes the actor.
    const onCancel = mockSyncParams?.onMatchCancelled as ((actorId?: string) => void) | undefined;
    act(() => onCancel?.("opp-1"));
    await flushAll();
    expect(toast.info).toHaveBeenCalledWith({ text1: "Match cancelled", description: "D. Okafor left the match." });
    expect(mockRouterDismissTo).toHaveBeenCalledTimes(1);
  });

  it("the timekeeper, an athlete's Leave no broadcast named: the shipped toast after the grace", async () => {
    await mountTk(TK, cancelled("athlete_left"));
    await act(async () => {
      jest.advanceTimersByTime(2_000);
    });
    expect(toast.info).toHaveBeenCalledWith({ text1: "Match cancelled", description: "This match was cancelled." });
    expect(mockRouterDismissTo).toHaveBeenCalledTimes(1);
  });

  it("the timekeeper who lost the seat: TK-K17, one line, through exitMatchTo", async () => {
    mockGetTimekeeperState.mockResolvedValue({ ok: false, error: { code: "NOT_PARTICIPANT", message: "x" } });
    await mountTk(TK, null);
    expect(toast.info).toHaveBeenCalledTimes(1);
    expect(toast.info).toHaveBeenCalledWith({ text1: "You're no longer timekeeping this match.", description: "" });
    expect(mockRouterDismissTo).toHaveBeenCalledWith(ARENA_EXIT);
  });

  it("the seated timekeeper's wizard sends the heartbeat; an athlete's never does", async () => {
    const tk = await mountTk(TK, tkMatch("pending"));
    expect(mockTouchTimekeeper).toHaveBeenCalledWith(expect.anything(), "M1");
    tk.unmount();
    mockTouchTimekeeper.mockClear();
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    // Stopped on exit (the wizard unmounted).
    expect(mockTouchTimekeeper).not.toHaveBeenCalled();
    await mountTk("me-1", tkMatch("pending"));
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    expect(mockTouchTimekeeper).not.toHaveBeenCalled();
  });

  // The wizard's gate (R23; spec 4.3): the seat beats while the match is
  // pending or in progress, the result entry after the clock's end included,
  // and never once the match is completed (the done screen during the edit
  // window) or cancelled.
  const STARTED = new Date(Date.now() - 3_600_000).toISOString();
  it.each([
    ["in progress, the clock running", tkMatch("in_progress", { started_at: STARTED })],
    ["in progress after the clock's end (the result is owed)", tkMatch("in_progress", { started_at: STARTED, ended_at: STARTED })],
  ])("the seated timekeeper's wizard beats while the match is %s", async (_label, m) => {
    await mountTk(TK, m, m);
    expect(mockTouchTimekeeper).toHaveBeenCalledWith(expect.anything(), "M1");
    mockTouchTimekeeper.mockClear();
    await act(async () => {
      jest.advanceTimersByTime(15_000);
    });
    expect(mockTouchTimekeeper).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["completed (the done screen)", tkMatch("completed", { started_at: STARTED, ended_at: STARTED })],
    ["cancelled", tkMatch("cancelled", { cancel_reason: "pause_timeout" })],
  ])("the seated timekeeper's wizard never beats once the match is %s", async (_label, m) => {
    await mountTk(TK, m, m);
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    expect(mockTouchTimekeeper).not.toHaveBeenCalled();
  });
});

// Node's CommonJS globals exist under Jest but the mobile tsconfig carries no
// @types/node (types: expo-router/types + jest), so declare the one we need
// rather than widening the app's type surface for a test helper.
declare const __dirname: string;

describe("no session-lobby URL can be rebuilt in the match-flow tree", () => {
  const fs = require("fs") as {
    readdirSync: (dir: string) => string[];
    statSync: (p: string) => { isDirectory: () => boolean };
    readFileSync: (p: string, enc: string) => string;
  };
  const path = require("path") as { join: (...parts: string[]) => string };

  const MATCH_FLOW_DIRS = [
    path.join(__dirname, "../../../components/match-flow"),
    path.join(__dirname, "../../../lib/match-flow"),
  ];

  function sourceFiles(dir: string): string[] {
    return fs.readdirSync(dir).flatMap((name: string) => {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) return sourceFiles(full);
      return /\.tsx?$/.test(name) ? [full] : [];
    });
  }

  /**
   * Source with comments stripped, for both scans below.
   *
   * Neither a route literal nor a live `sessionId` reference can occur in a
   * comment, so stripping costs no true-positive coverage, and it removes the
   * whole class of false positives from prose that merely QUOTES a path. This
   * repo's house docblock style names the web file a component was ported
   * from, and those paths contain the `(app)` group (the since-deleted mobile
   * session join wizard steps did exactly that). The match-flow components
   * genuinely are native ports of web match-flow files, so someone will write
   * exactly that docblock in a scanned file. Without stripping it would fail
   * the route-literal scan (its `/session/` is preceded by ")", which the
   * lookbehind does not exclude) and a comment naming `sessionId` would fail
   * the identifier scan, in both cases a confusing red unrelated to the
   * regression these guards exist to catch.
   */
  function strippedSource(file: string): string {
    return fs
      .readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
  }

  /**
   * A session-lobby route literal, in EITHER spelling. Expo Router treats the
   * `(app)` group segment as optional, so `/session/<id>/lobby` and
   * `/(app)/session/<id>/lobby` are the same route, and the group-less form is
   * the dominant house style elsewhere in this app (session lobby, join,
   * gym detail, deep-link handler). Matching only the group-prefixed spelling
   * would let the regression back in wearing the other hat.
   *
   * Anchored at a string boundary so a docblock that merely MENTIONS a file
   * path (`components/session/wizard-progress.tsx`) is not a false positive:
   * a route literal has a quote, backtick or `)` before the slash, while a
   * file path has a word character. Comments are stripped before testing
   * (see strippedSource), which is what actually handles prose.
   *
   * KNOWN RESIDUAL FALSE NEGATIVE, deliberately not chased: a URL assembled
   * from a prefix constant that stops before the trailing slash AND uses an
   * identifier not named `sessionId` slips past both scans, e.g.
   *   const LOBBY_PREFIX = "/session";
   *   return `${LOBBY_PREFIX}/${originId}/lobby`;
   * That is evasion-shaped rather than accident-shaped. A natural
   * re-coupling either keeps `/session/` intact or reuses the name
   * `sessionId`, and both of those are caught. Writing the limit down is the
   * point; widening the pattern to chase it would cost false positives.
   */
  const SESSION_ROUTE_LITERAL = /(?<![\w.])\/(?:\(app\)\/)?session\//;

  it("has no session-lobby route literal left in it, in either spelling", () => {
    const files = MATCH_FLOW_DIRS.flatMap(sourceFiles);
    // Guard the guard: if the tree moves, this must fail loudly, not pass empty.
    expect(files.length).toBeGreaterThan(5);

    const offenders = files.filter((file) =>
      SESSION_ROUTE_LITERAL.test(strippedSource(file)),
    );
    expect(offenders).toEqual([]);
  });

  it("has no `sessionId` identifier left in it", () => {
    // Catches a re-coupling that builds the URL some other way (concatenation,
    // a helper, a constant) and so slips past the route-literal scan.
    const files = MATCH_FLOW_DIRS.flatMap(sourceFiles);
    expect(files.length).toBeGreaterThan(5);

    const offenders = files.filter((file) => /\bsessionId\b/.test(strippedSource(file)));
    expect(offenders).toEqual([]);
  });

  it("never navigates to a URL containing 'undefined' on a sessionless mount", () => {
    mockUseMatchDetails.mockReturnValue(completedMatchResult());

    const { getByText } = render(
      <MatchFlowWizard
        exitHref={ARENA_EXIT}
        exitLabel={ARENA_LABEL}
        matchId="M1"
        currentAthleteId="me-1"
      />,
    );
    fireEvent.press(getByText(ARENA_LABEL));
    fireEvent.press(getByText("Open match"));

    expect(mockRouterDismissTo.mock.calls.length).toBeGreaterThan(0);
    for (const [href] of mockRouterDismissTo.mock.calls) {
      expect(String(href)).not.toContain("undefined");
      expect(String(href)).not.toMatch(SESSION_ROUTE_LITERAL);
    }
  });
});

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
 *    regression cannot come back.
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
  useThemedTokens: () => ({
    textPrimary: "#E8EDF2",
    textSecondary: "#9AA3AD",
    statePositive: "#3FB950",
  }),
}));

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));

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
jest.mock("@jits/shared/api/queries", () => ({
  getMatchDetails: jest.fn(),
  getMatchConfirmations: jest.fn(() => Promise.resolve([])),
  // The ranked weight step's "At stake" preview; null hides the row.
  getEloStakes: jest.fn(() => Promise.resolve(null)),
}));

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
    };
  },
}));

const mockUseMatchDetails = jest.fn();
jest.mock("@/lib/match-flow/use-match-details", () => ({
  useMatchDetails: (matchId: string) => mockUseMatchDetails(matchId),
}));

import { MatchFlowWizard } from "@/components/match-flow/match-flow-wizard";
import { ReadyStep } from "@/components/match-flow/steps/ready-step";
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

  it("offers a Rematch of the opponent that dismisses the match to the Arena (jits-00fr)", () => {
    mockUseMatchDetails.mockReturnValue(completedMatchResult());

    const { getByTestId, getByText } = render(
      <MatchFlowWizard exitHref={ARENA_EXIT} exitLabel={ARENA_LABEL} matchId="M1" currentAthleteId="me-1" />,
    );

    const rematch = getByTestId("summary-rematch");
    expect(rematch.props.accessibilityLabel).toBe("Rematch Opponent");
    fireEvent.press(rematch);
    expect(mockRouterDismissTo).toHaveBeenCalledWith(`${ARENA_HREF}?rematch=opp-1`);
    // Done and the exit cta are still there.
    getByText("Done");
    getByText(ARENA_LABEL);
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

describe("ReadyStep exit navigation", () => {
  function renderReady(exitHref: string, onCancelledRemotely: jest.Mock = jest.fn()) {
    return render(
      <ReadyStep
        exitHref={exitHref}
        onCancelledRemotely={onCancelledRemotely}
        matchId="M1"
        currentAthleteId="me-1"
        opponentId="opp-1"
        onStarted={jest.fn()}
      />,
    );
  }

  it("leaves through the wizard's exit (once) when the opponent cancels", () => {
    // The wizard's exitCancelled does the toast + navigation to exitHref and
    // marks the wizard exiting, so the reconciler cannot exit a second time.
    // The step itself must not navigate or toast on its own.
    const onCancelledRemotely = jest.fn();
    renderReady(ARENA_EXIT, onCancelledRemotely);

    act(() => {
      mockSyncParams?.onMatchCancelled?.();
      mockSyncParams?.onMatchCancelled?.();
    });

    expect(onCancelledRemotely).toHaveBeenCalledTimes(1);
    expect(onCancelledRemotely).toHaveBeenCalledWith("Your opponent left the ready check.");
    expect(mockRouterDismissTo).not.toHaveBeenCalled();
  });

  it.each([
    ["Arena", ARENA_EXIT],
    ["non-Arena", OTHER_EXIT],
  ])("returns to the %s exitHref when the opponent cancels", (_name, exitHref) => {
    mockUseMatchDetails.mockReturnValue({
      ...completedMatchResult(),
      match: { ...completedMatchResult().match, status: "pending", started_at: null },
    });
    const { getByTestId } = render(
      <MatchFlowWizard exitHref={exitHref} exitLabel="Back" matchId="M1" currentAthleteId="me-1" />,
    );
    fireEvent.press(getByTestId("weight-confirm"));
    getByTestId("match-step-ready");

    act(() => {
      mockSyncParams?.onMatchCancelled?.();
    });

    expect(mockRouterDismissTo).toHaveBeenCalledTimes(1);
    expect(mockRouterDismissTo).toHaveBeenCalledWith(exitHref);
  });

  it.each([
    ["Arena", ARENA_EXIT],
    ["non-Arena", OTHER_EXIT],
  ])("returns to the %s exitHref when this athlete cancels", async (_name, exitHref) => {
    mockCancelSessionMatch.mockResolvedValue({ ok: true, data: {} });
    const alertSpy = jest
      .spyOn(Alert, "alert")
      .mockImplementation((_title, _message, buttons) => {
        // Index 1 is the destructive "Cancel Match" confirmation.
        buttons?.[1]?.onPress?.();
      });

    const { getByLabelText } = renderReady(exitHref);
    fireEvent.press(getByLabelText("Cancel match"));

    await waitFor(() => expect(mockRouterDismissTo).toHaveBeenCalledWith(exitHref));
    alertSpy.mockRestore();
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
    fireEvent.press(getByText("Done"));

    expect(mockRouterDismissTo.mock.calls.length).toBeGreaterThan(0);
    for (const [href] of mockRouterDismissTo.mock.calls) {
      expect(String(href)).not.toContain("undefined");
      expect(String(href)).not.toMatch(SESSION_ROUTE_LITERAL);
    }
  });
});

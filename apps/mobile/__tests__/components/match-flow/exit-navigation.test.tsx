/**
 * Exit-navigation contract for the match wizard (jits-3929).
 *
 * `MatchFlowWizard` used to require a `sessionId` whose only job was building
 * four hardcoded `/(app)/session/${sessionId}/lobby` redirects. That made a
 * sessionless match (Arena) impossible to render, and it made an absent
 * session silently produce `/(app)/session/undefined/lobby`.
 *
 * These tests pin the replacement contract:
 *  - the wizard mounts and exits correctly with a session-style `exitHref`,
 *    preserving today's session behaviour ("Back to Lobby" -> the lobby);
 *  - the wizard mounts and exits correctly with a non-session `exitHref`,
 *    with no session id anywhere in the tree;
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

const mockRouterReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockRouterReplace, push: jest.fn(), back: jest.fn() }),
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

jest.mock("@jits/shared/api/queries", () => ({
  getMatchDetails: jest.fn(),
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

const mockCancelSessionMatch = cancelSessionMatch as jest.Mock;

// ---- fixtures ----

const SESSION_EXIT = "/(app)/session/S1/lobby";
const SESSION_LABEL = "Back to Lobby";
const ARENA_EXIT = "/(app)/arena";
const ARENA_LABEL = "Back to Arena";

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
  it("exits a session match to its lobby with today's copy", async () => {
    mockUseMatchDetails.mockReturnValue(completedMatchResult());

    const { getByText } = render(
      <MatchFlowWizard
        exitHref={SESSION_EXIT}
        exitLabel={SESSION_LABEL}
        matchId="M1"
        currentAthleteId="me-1"
      />,
    );

    fireEvent.press(getByText(SESSION_LABEL));
    expect(mockRouterReplace).toHaveBeenCalledWith(SESSION_EXIT);
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

    expect(queryByText(SESSION_LABEL)).toBeNull();
    fireEvent.press(getByText(ARENA_LABEL));
    expect(mockRouterReplace).toHaveBeenCalledWith(ARENA_EXIT);
  });

  it("routes the not-a-participant splash through exitHref for both origins", () => {
    mockUseMatchDetails.mockReturnValue(notAParticipantResult());

    const session = render(
      <MatchFlowWizard
        exitHref={SESSION_EXIT}
        exitLabel={SESSION_LABEL}
        matchId="M1"
        currentAthleteId="me-1"
      />,
    );
    session.getByText("Not a participant");
    fireEvent.press(session.getByText(SESSION_LABEL));
    expect(mockRouterReplace).toHaveBeenLastCalledWith(SESSION_EXIT);
    session.unmount();

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
    expect(mockRouterReplace).toHaveBeenLastCalledWith(ARENA_EXIT);
  });

  it("defaults exitLabel to the session lobby wording when omitted", () => {
    mockUseMatchDetails.mockReturnValue(notAParticipantResult());

    const { getByText } = render(
      <MatchFlowWizard exitHref={SESSION_EXIT} matchId="M1" currentAthleteId="me-1" />,
    );

    fireEvent.press(getByText(SESSION_LABEL));
    expect(mockRouterReplace).toHaveBeenCalledWith(SESSION_EXIT);
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
    fireEvent.press(getByText(SESSION_LABEL));
    expect(mockRouterReplace).toHaveBeenCalledWith(ARENA_EXIT);
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

    fireEvent.press(getByText(SESSION_LABEL));
    expect(mockRouterReplace).toHaveBeenCalledWith(ARENA_EXIT);
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
    expect(mockRouterReplace).toHaveBeenCalledWith(ARENA_EXIT);
  });
});

describe("ReadyStep exit navigation", () => {
  function renderReady(exitHref: string) {
    return render(
      <ReadyStep
        exitHref={exitHref}
        matchId="M1"
        currentAthleteId="me-1"
        opponentId="opp-1"
        onStarted={jest.fn()}
      />,
    );
  }

  it.each([
    ["session", SESSION_EXIT],
    ["non-session", ARENA_EXIT],
  ])("returns to the %s exitHref when the opponent cancels", (_name, exitHref) => {
    renderReady(exitHref);

    act(() => {
      mockSyncParams?.onMatchCancelled?.();
    });

    expect(mockRouterReplace).toHaveBeenCalledWith(exitHref);
  });

  it.each([
    ["session", SESSION_EXIT],
    ["non-session", ARENA_EXIT],
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

    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledWith(exitHref));
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
   * file path has a word character.
   */
  const SESSION_ROUTE_LITERAL = /(?<![\w.])\/(?:\(app\)\/)?session\//;

  it("has no session-lobby route literal left in it, in either spelling", () => {
    const files = MATCH_FLOW_DIRS.flatMap(sourceFiles);
    // Guard the guard: if the tree moves, this must fail loudly, not pass empty.
    expect(files.length).toBeGreaterThan(5);

    const offenders = files.filter((file) =>
      SESSION_ROUTE_LITERAL.test(fs.readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("has no `sessionId` identifier left in it", () => {
    // Catches a re-coupling that builds the URL some other way (concatenation,
    // a helper, a constant) and so slips past the route-literal scan.
    const files = MATCH_FLOW_DIRS.flatMap(sourceFiles);
    expect(files.length).toBeGreaterThan(5);

    const offenders = files.filter((file) =>
      /\bsessionId\b/.test(fs.readFileSync(file, "utf8")),
    );
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

    expect(mockRouterReplace.mock.calls.length).toBeGreaterThan(0);
    for (const [href] of mockRouterReplace.mock.calls) {
      expect(String(href)).not.toContain("undefined");
      expect(String(href)).not.toMatch(SESSION_ROUTE_LITERAL);
    }
  });
});

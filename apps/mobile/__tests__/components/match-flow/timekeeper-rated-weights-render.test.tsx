/**
 * The seated timekeeper sees the athletes' RATED weights on every screen that
 * shows a weight (timekeeper mode PM26, BE-G3): the countdown chip, the live
 * screen's athlete bars after GO and the result form. Rated means the
 * challenge weights after any re-weigh, read from `get_timekeeper_match_state`
 * (`weights`), never the profile `current_weight`.
 *
 * The real wizard, step renderer and steps render a timekeeper-mode match with
 * the timekeeper as the viewer (the renderer-golden harness, trimmed). The
 * fixture's profile weights (171.4, 172.5) differ from its rated weights
 * (168, 170.2) on purpose, so a screen that shows a profile weight fails here.
 * Only the data layer, the realtime hook, the recorder and the native modules
 * are stubbed, as in `renderer-golden.test.tsx`.
 */
import * as React from "react";
import { AppState } from "react-native";
import { render, act } from "@testing-library/react-native";

// ---- environment ----

jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  const stub = () => R.createElement(RN.View, { testID: "icon" });
  return new Proxy({}, { get: (_t: Record<string, unknown>, prop: string) => (prop === "__esModule" ? true : stub) });
});
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ textPrimary: "#fff", textSecondary: "#aaa", statePositive: "#0f0" }),
  useResolvedColorScheme: () => "dark",
}));
jest.mock("@/lib/supabase/client", () => ({
  supabase: {
    channel: () => {
      const chan: Record<string, unknown> = {};
      chan.on = () => chan;
      chan.subscribe = () => chan;
      return chan;
    },
    removeChannel: async () => undefined,
  },
}));
jest.mock("@/lib/video/use-film-status", () => require("../../support/film-status-mock").unavailableFilmStatusModule());
jest.mock("@jits/shared/hooks/use-match-videos-realtime", () => ({
  useMatchVideosRealtime: () => ({ subscribed: true }),
}));
jest.mock("@/components/ui/toast", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock("expo-router", () => ({ useRouter: () => ({ dismissTo: jest.fn(), push: jest.fn(), back: jest.fn() }) }));
jest.mock("@/lib/auth/hooks", () => ({ useAuth: () => ({ athlete: { id: "tk-1" } }) }));
jest.mock("@/lib/network/mutation-queue", () => ({
  mutationQueue: { size: () => 0, subscribe: () => () => {}, enqueue: (_key: string, fn: () => unknown) => fn() },
  isQueuedResult: () => false,
}));
jest.mock("@/components/ui/elo-system", () => {
  const R = require("react");
  const RN = require("react-native");
  const stub = (props: { children?: React.ReactNode }) => R.createElement(RN.View, null, props?.children ?? null);
  return new Proxy({}, { get: (_t: Record<string, unknown>, prop: string) => (prop === "__esModule" ? true : stub) });
});
jest.mock("@/lib/error-tracking/sentry", () => ({ captureException: jest.fn() }));
jest.mock("@/lib/match-flow/use-keep-awake", () => ({ useMatchKeepAwake: () => undefined }));
jest.mock("@/lib/match-flow/use-haptics", () => ({
  matchHaptics: {
    matchStart: () => Promise.resolve(),
    countdownTick: () => Promise.resolve(),
    countdownGo: () => Promise.resolve(),
    matchEnd: () => Promise.resolve(),
    timeWarning: () => Promise.resolve(),
    resultRecorded: () => Promise.resolve(),
    error: () => Promise.resolve(),
  },
}));
jest.mock("@jits/shared/hooks/use-session-match-timer", () => ({
  useSessionMatchTimer: () => ({
    formatted: "05:00",
    remaining: 300,
    paused: false,
    running: true,
    syncFromBroadcast: () => undefined,
  }),
}));
const mockRecorder = { permission: { granted: false }, state: "idle", error: null, start: jest.fn(), stop: jest.fn(() => Promise.resolve()) };
jest.mock("@/components/match-flow/match-recorder-context", () => ({
  MatchRecorderProvider: ({ children }: { children: React.ReactNode }) => children,
  useMatchRecorder: () => mockRecorder,
}));
jest.mock("@/components/match-flow/match-recorder-surface", () => ({
  MatchRecorderCamera: () => null,
  MatchRecorderStatus: () => null,
}));

// ---- data layer ----

const mockGetMatchDetails = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({
  getMatchDetails: (...a: unknown[]) => mockGetMatchDetails(...a),
  getMatchConfirmations: async () => [],
  // The timekeeper's reconciler read (its confirmations come with the match).
  getMatchDetailsWithConfirmations: async (...a: unknown[]) => {
    const match = await mockGetMatchDetails(...a);
    return match ? { match, confirmations: [] } : null;
  },
  getSubmissionTypes: async () => [],
  getRatingStakes: async () => null,
  getMatchDetailView: async () => ({ ok: true, data: { videos: [] } }),
}));
jest.mock("@jits/shared/api/match-rank-change", () => ({
  getMatchRankChange: async () => ({ ok: false, error: { code: "UNKNOWN", message: "n/a" } }),
}));
jest.mock("expo-image", () => ({ Image: () => null }));
// The athletes' own weight reads: the timekeeper must make neither (RLS,
// participants only), so a call here fails the read rule below.
const mockGetMatchChallengeWeights = jest.fn();
jest.mock("@jits/shared/api/match-weights", () => ({
  ...jest.requireActual("@jits/shared/api/match-weights"),
  getMatchChallengeWeights: (...a: unknown[]) => mockGetMatchChallengeWeights(...a),
}));
const mockGetMatchWeightChecks = jest.fn();
jest.mock("@jits/shared/api/match-weight-checks", () => ({
  ...jest.requireActual("@jits/shared/api/match-weight-checks"),
  getMatchWeightChecks: (...a: unknown[]) => mockGetMatchWeightChecks(...a),
}));
jest.mock("@jits/shared/api/mutations", () => ({
  confirmMatchResult: async () => ({ ok: true, data: {} }),
  disputeMatchResult: async () => ({ ok: true, data: {} }),
  recordMatchResult: async () => ({ ok: true, data: {} }),
  startMatch: jest.fn(),
  cancelSessionMatch: jest.fn(),
  pauseMatch: jest.fn(),
  resumeMatch: jest.fn(),
}));
// The timekeeper-mode state read; the parser stays real.
const mockGetTkState = jest.fn();
jest.mock("@jits/shared/api/timekeeper", () => ({
  ...jest.requireActual("@jits/shared/api/timekeeper"),
  getTimekeeperMatchState: (...a: unknown[]) => mockGetTkState(...a),
}));

// ---- realtime: capture each step's handlers ----

type Handlers = Record<string, ((...a: unknown[]) => void) | undefined>;
const mockSyncCalls: Handlers[] = [];
const mockBroadcast = new Proxy({}, { get: () => () => Promise.resolve("ok") });
jest.mock("@jits/shared/hooks/use-session-match-sync", () => ({
  useSessionMatchSync: (params: Handlers) => {
    mockSyncCalls.push(params);
    return mockBroadcast;
  },
}));

function handlerOf(name: string) {
  for (let i = mockSyncCalls.length - 1; i >= 0; i--) {
    const h = mockSyncCalls[i][name];
    if (h) return h;
  }
  throw new Error(`no step bound ${name}`);
}

import { MatchFlowWizard } from "@/components/match-flow/match-flow-wizard";
import { OPPONENT_ENDED_INTERSTITIAL_MS } from "@/lib/match-flow/live-view-state";
import { parseTimekeeperMatchState } from "@jits/shared/api/timekeeper";
import { __resetFreshForTests, __resetPlayedMomentsForTests } from "@/components/ui/elo-system/play-once";
import { __resetHeaderEloForTests } from "@/lib/rating/header-elo";
import { __resetStripSuppressionsForTests } from "@/lib/video/upload-strip-visibility";

// ---- fixtures ----

const NOW = new Date("2026-09-25T12:12:00.000Z");
/** A `started_at` one second before NOW: the 3-2-1 is still on "2". */
const ONE_SECOND_AGO = "2026-09-25T12:11:59.000Z";

function participant(id: string, name: string, elo: number, weight: number) {
  return {
    athlete_id: id,
    display_name: name,
    current_elo: elo,
    current_weight: weight,
    profile_photo_url: null,
    role: "competitor",
    outcome: null,
    elo_before: null,
    elo_after: null,
    elo_delta: 0,
    weight_division_gap: 0,
  };
}

/**
 * A timekeeper-mode match, challenge-backed (opp-1 challenged me-1), the
 * timekeeper tk-1 seated. Profile weights: me-1 172.5, opp-1 171.4.
 */
function tkMatch(startedAt: string) {
  return {
    id: "M1",
    challenge_id: "C1",
    session_id: null,
    match_type: "ranked",
    duration_seconds: 300,
    status: "in_progress",
    result: null,
    started_at: startedAt,
    completed_at: null,
    paused_at: null,
    total_paused_duration: 0,
    participants: [participant("me-1", "Mina Park", 1512, 172.5), participant("opp-1", "Demo Okafor", 1487, 171.4)],
    requires_timekeeper: true,
    tk_weight_check_required: true,
    challenger_id: "opp-1",
    timekeeper_id: "tk-1",
    timekeeper: { id: "tk-1", display_name: "Jo Cruz", profile_photo_url: null },
    viewer_role: "timekeeper",
    ended_at: null,
    final_elapsed_s: null,
    result_edit_count: 0,
  };
}

/** One `weights` row of `get_timekeeper_match_state` (BE-G3). */
type RatedRow = { athlete_id: string; weight: number | null };

/** `get_timekeeper_match_state`'s payload (BE-G3): the rated weights, challenger first. */
function tkStatePayload(weights: RatedRow[]) {
  return {
    ok: true,
    ready: [],
    athlete_checks: [],
    timekeeper_checks: [],
    open_request: null,
    last_request_outcome: null,
    presence: "online",
    offline_since: null,
    no_contest_at: null,
    review_pending: false,
    timeout_at: null,
    weights,
    edit_open: false,
    edit_closes_at: null,
    start_blockers: [],
  };
}

const RATED: RatedRow[] = [
  { athlete_id: "opp-1", weight: 168 },
  { athlete_id: "me-1", weight: 170.2 },
];

// ---- driving ----

async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

async function tick(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
  await flush();
}

async function mountTimekeeper(startedAt: string, weights: RatedRow[] = RATED) {
  mockGetTkState.mockResolvedValue({ ok: true, data: parseTimekeeperMatchState(tkStatePayload(weights)) });
  mockGetMatchDetails.mockResolvedValue(tkMatch(startedAt));
  const screen = render(
    <MatchFlowWizard exitHref="/(app)/(tabs)/arena" exitLabel="Back to Arena" matchId="M1" currentAthleteId="tk-1" />,
  );
  for (let i = 0; i < 6; i++) await flush();
  return screen;
}

/**
 * The live clock ends: the server has `ended_at`, and a `match_ended`
 * broadcast only re-reads it (timekeeper mode, M-R8; slice M4), which moves
 * the timekeeper to the result.
 */
async function toResult() {
  const row = await mockGetMatchDetails();
  mockGetMatchDetails.mockResolvedValue({ ...row, ended_at: NOW.toISOString(), final_elapsed_s: 48 });
  act(() => handlerOf("onMatchEnded")());
  await tick(OPPONENT_ENDED_INTERSTITIAL_MS);
  await tick(800);
  for (let i = 0; i < 4; i++) await flush();
}

type Screen = ReturnType<typeof render>;
const lbsTexts = (s: Screen) => (JSON.stringify(s.toJSON()).match(/"[^"]*LBS[^"]*"/g) ?? []).map((t) => JSON.parse(t) as string);

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  jest.clearAllMocks();
  mockSyncCalls.length = 0;
  mockGetMatchChallengeWeights.mockResolvedValue({ challengerId: "opp-1", opponentId: "me-1", challengerWeight: 160, opponentWeight: 160 });
  mockGetMatchWeightChecks.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "n/a" } });
  __resetPlayedMomentsForTests();
  __resetFreshForTests();
  __resetHeaderEloForTests();
  __resetStripSuppressionsForTests();
  jest.spyOn(AppState, "addEventListener").mockImplementation((() => ({ remove: jest.fn() })) as never);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("the timekeeper sees the rated weights, never the profile ones (PM26)", () => {
  it("countdown chip", async () => {
    const s = await mountTimekeeper(ONE_SECOND_AGO);
    s.getByTestId("match-countdown");
    expect(lbsTexts(s)).toEqual(["1487 · 168 LBS", "1512 · 170.2 LBS"]);
    s.unmount();
  });

  it("live screen after GO: both athlete bars, challenger on the left", async () => {
    const s = await mountTimekeeper("2026-09-25T12:00:00.000Z");
    s.getByTestId("match-step-live");
    expect(s.queryByTestId("match-countdown")).toBeNull();
    expect(s.getByTestId("live-me-meta")).toHaveTextContent("1487 · 168 LBS");
    expect(s.getByTestId("live-opponent-meta")).toHaveTextContent("1512 · 170.2 LBS");
    expect(lbsTexts(s).join(" ")).not.toMatch(/171\.4|172\.5/);
    s.unmount();
  });

  it("result form: both winner tiles", async () => {
    const s = await mountTimekeeper("2026-09-25T12:00:00.000Z");
    await toResult();
    s.getByTestId("match-step-result");
    expect(s.getByTestId("result-winner-opp-1")).toHaveTextContent(/1487 · 168 LBS/);
    expect(s.getByTestId("result-winner-me-1")).toHaveTextContent(/1512 · 170\.2 LBS/);
    expect(lbsTexts(s).join(" ")).not.toMatch(/171\.4|172\.5/);
    s.unmount();
  });

  it("a side with no rated weight shows no weight, never the profile's", async () => {
    const s = await mountTimekeeper("2026-09-25T12:00:00.000Z", [
      { athlete_id: "opp-1", weight: null },
      { athlete_id: "me-1", weight: 170.2 },
    ]);
    expect(s.getByTestId("live-me-meta")).toHaveTextContent("1487");
    expect(s.getByTestId("live-opponent-meta")).toHaveTextContent("1512 · 170.2 LBS");
    expect(lbsTexts(s).join(" ")).not.toMatch(/171\.4|172\.5/);
    s.unmount();
  });

  it("makes none of the athletes' weight reads (the challenge row, the weight checks)", async () => {
    const s = await mountTimekeeper(ONE_SECOND_AGO);
    expect(mockGetTkState).toHaveBeenCalledWith(expect.anything(), "M1");
    expect(mockGetMatchChallengeWeights).not.toHaveBeenCalled();
    expect(mockGetMatchWeightChecks).not.toHaveBeenCalled();
    s.unmount();
  });
});

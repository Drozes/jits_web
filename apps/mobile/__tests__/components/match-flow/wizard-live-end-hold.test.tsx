/**
 * The athletes' ended plate at the end of a timekeeper-mode match (spec 4.2
 * End, PM1; board P-TK-B7 frame 5; slice M4), through the real wizard, the
 * real reconciler, the real step renderer and the real live step. Only the
 * data layer, the realtime hooks, the match timer and the recorder are
 * stubbed, as in `wizard-timekeeper-routing.test.tsx`.
 *
 * An athlete's phone shows `{NAME} ENDED THE MATCH` with the server's
 * `FINAL CLOCK` for OPPONENT_ENDED_INTERSTITIAL_MS, then the result waiting
 * view, whichever arrives first: the timekeeper's `match_ended` broadcast
 * (then the read it asks for) or the DB change (the `match-row:` event or
 * the poll; a lost broadcast, the server's own end at full time). The
 * timekeeper's phone and a two-athlete match are not held.
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

// The reconciler's `matches` row listener, captured so a test can deliver an UPDATE.
const mockRow: { handler: (() => void) | null } = { handler: null };
jest.mock("@/lib/supabase/client", () => ({
  supabase: {
    channel: (topic: string) => {
      const chan: Record<string, unknown> = {};
      chan.on = (_e: string, _f: unknown, h: () => void) => {
        if (topic.startsWith("match-row:")) mockRow.handler = h;
        return chan;
      };
      chan.subscribe = () => chan;
      return chan;
    },
    getChannels: () => [],
    removeChannel: async () => undefined,
  },
}));
jest.mock("@/lib/video/use-film-status", () => require("../../support/film-status-mock").unavailableFilmStatusModule());
jest.mock("@jits/shared/hooks/use-match-videos-realtime", () => ({
  useMatchVideosRealtime: () => ({ subscribed: true }),
}));
jest.mock("@/components/ui/toast", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock("expo-router", () => ({
  useRouter: () => ({ dismissTo: jest.fn(), push: jest.fn(), back: jest.fn() }),
}));
jest.mock("@/lib/auth/hooks", () => ({ useAuth: () => ({ athlete: { id: "me-1" } }) }));
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
// This phone's clock reads 03:20 left; the server's final clock is another.
jest.mock("@jits/shared/hooks/use-session-match-timer", () => ({
  useSessionMatchTimer: () => ({
    elapsed: 100,
    formatted: "03:20",
    remaining: 200,
    paused: false,
    running: true,
    syncFromBroadcast: () => undefined,
  }),
}));

const mockRecorder = {
  permission: { granted: false },
  state: "idle",
  start: jest.fn(),
  stop: jest.fn(() => Promise.resolve()),
};
jest.mock("@/components/match-flow/match-recorder-context", () => ({
  MatchRecorderProvider: ({ children }: { children: React.ReactNode }) => children,
  useMatchRecorder: () => mockRecorder,
}));
jest.mock("@/components/match-flow/match-recorder-surface", () => ({
  MatchRecorderCamera: () => null,
  MatchRecorderStatus: () => null,
}));
jest.mock("@jits/shared/api/match-video-upload", () => ({
  setMatchRecordingIntent: async () => ({ ok: true, data: null }),
}));
jest.mock("expo-image", () => ({ Image: () => null }));

// ---- data layer ----

const mockGetMatchDetails = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({
  getMatchDetails: (...a: unknown[]) => mockGetMatchDetails(...a),
  getMatchConfirmations: async () => [],
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
const mockGetTimekeeperState = jest.fn();
jest.mock("@jits/shared/api/timekeeper", () => ({
  ...jest.requireActual("@jits/shared/api/timekeeper"),
  getTimekeeperMatchState: (...a: unknown[]) => mockGetTimekeeperState(...a),
  touchMatchTimekeeper: async () => ({ ok: true, data: { seenAt: "2026-09-25T12:00:00.000Z" } }),
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
jest.mock("@jits/shared/api/match-weights", () => ({
  ...jest.requireActual("@jits/shared/api/match-weights"),
  getMatchChallengeWeights: async () => null,
}));
jest.mock("@jits/shared/api/match-weight-checks", () => ({
  ...jest.requireActual("@jits/shared/api/match-weight-checks"),
  getMatchWeightChecks: async () => ({ ok: false, error: { code: "UNKNOWN", message: "n/a" } }),
}));

const mockBroadcast = Object.fromEntries(
  [
    "broadcastTimerStarted",
    "broadcastTimerPaused",
    "broadcastTimerResumed",
    "broadcastMatchEnded",
    "broadcastReady",
    "broadcastResultSubmitted",
    "broadcastResultConfirmed",
    "broadcastMatchCancelled",
    "broadcastMatchDisputed",
    "broadcastWeighedIn",
    "broadcastRecordingOptIn",
    "broadcastResultClaimed",
  ].map((name) => [name, jest.fn((..._a: unknown[]) => Promise.resolve("ok"))]),
);
// Every step channel's params, newest last, so a test can deliver a broadcast.
type ChannelParams = { enabled?: boolean; onMatchEnded?: (actorId?: string) => void };
const mockChannels: ChannelParams[] = [];
jest.mock("@jits/shared/hooks/use-session-match-sync", () => ({
  useSessionMatchSync: (p: ChannelParams) => {
    mockChannels.push(p);
    return mockBroadcast;
  },
}));

import { MatchFlowWizard } from "@/components/match-flow/match-flow-wizard";
import { OPPONENT_ENDED_INTERSTITIAL_MS } from "@/lib/match-flow/live-view-state";
import { __resetRecordingOptInForTests } from "@/lib/match-flow/recording-optin";
import { __resetAiConsentForTests } from "@/lib/moderation/ai-consent";

// ---- fixtures ----

const ME = "me-1";
const OPP = "opp-1";
const TK = "tk-1";
const ENDED_AT = "2026-09-25T12:05:00.000Z";
/** The server's clock at the end: 300 - 228 = 72 s left. */
const SERVER_FINAL = "FINAL CLOCK 01:12 OF 05:00";

function participant(id: string, name: string, outcome: string | null) {
  return {
    athlete_id: id,
    display_name: name,
    current_elo: 1200,
    current_weight: 170,
    profile_photo_url: null,
    role: "competitor",
    outcome,
    elo_before: outcome ? 1200 : null,
    elo_after: null,
    elo_delta: 0,
    weight_division_gap: 0,
  };
}

interface Row {
  ended?: boolean;
  outcome?: "win" | "loss" | null;
  requiresTimekeeper?: boolean;
}

/** A match ME challenged, in progress unless `status` says otherwise; timekeeper mode unless told not. */
function row(status: string, o: Row = {}) {
  const tk = o.requiresTimekeeper ?? true;
  const mine = o.outcome ?? null;
  const theirs = mine === "win" ? "loss" : mine === "loss" ? "win" : null;
  return {
    id: "M1",
    challenge_id: null,
    session_id: null,
    match_type: "ranked",
    duration_seconds: 300,
    status,
    result: mine ? "submission" : null,
    started_at: "2026-09-25T12:00:00.000Z",
    completed_at: mine ? "2026-09-25T12:06:00.000Z" : null,
    paused_at: null,
    total_paused_duration: 0,
    timekeeper_id: tk ? TK : null,
    participants: [participant(ME, "Mina Park", mine), participant(OPP, "Demo Okafor", theirs)],
    requires_timekeeper: tk,
    tk_weight_check_required: true,
    challenger_id: ME,
    ended_at: o.ended ? ENDED_AT : null,
    final_elapsed_s: o.ended ? 228 : null,
    timekeeper_deadline_at: null,
    cancel_reason: null,
    result_edit_count: 0,
    result_edited_at: null,
    result_recorded_by_admin: false,
    timekeeper: tk ? { id: TK, display_name: "Jo Cruz", profile_photo_url: null } : null,
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

async function flush() {
  await act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });
}

async function tick(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
  await flush();
}

async function mountLive(viewerId: string, o: Row = {}) {
  mockGetMatchDetails.mockResolvedValue(row("in_progress", o));
  const screen = render(
    <MatchFlowWizard exitHref="/(app)/(tabs)/arena" exitLabel="Back to Arena" matchId="M1" currentAthleteId={viewerId} />,
  );
  await flush();
  await flush();
  screen.getByTestId("match-step-live");
  return screen;
}

/** The live step's channel (the newest open one that takes `match_ended`). */
function liveChannel(): ChannelParams {
  const open = mockChannels.filter((c) => c.enabled !== false && typeof c.onMatchEnded === "function");
  expect(open.length).toBeGreaterThan(0);
  return open[open.length - 1];
}

type Screen = Awaited<ReturnType<typeof mountLive>>;

/** The plate on the live step, with the step marker still on live and no waiting view. */
function expectPlate(screen: Screen) {
  screen.getByTestId("match-step-live");
  expect(screen.queryByTestId("match-step-result")).toBeNull();
  screen.getByText("J. CRUZ ENDED THE MATCH");
  screen.getByText(SERVER_FINAL);
}

/** The plate holds for the interstitial, then the result waiting view. */
async function expectHoldThenResult(screen: Screen) {
  await tick(OPPONENT_ENDED_INTERSTITIAL_MS - 100);
  expectPlate(screen);
  await tick(100);
  screen.getByTestId("match-step-result");
  expect(screen.queryByTestId("match-step-live")).toBeNull();
  expect(screen.queryByText(/ENDED THE MATCH/)).toBeNull();
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockRow.handler = null;
  mockChannels.length = 0;
  jest.spyOn(AppState, "addEventListener").mockImplementation((() => ({ remove: jest.fn() })) as never);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  mockGetTimekeeperState.mockResolvedValue({ ok: true, data: STATE });
  __resetRecordingOptInForTests(false);
  __resetAiConsentForTests();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("a timekeeper-mode athlete's phone at the end (spec 4.2 End, board P-TK-B7 frame 5)", () => {
  it("the timekeeper's match_ended first: the plate, then the read moves the wizard and the plate holds", async () => {
    const screen = await mountLive(ME);
    mockGetMatchDetails.mockResolvedValue(row("in_progress", { ended: true }));
    act(() => liveChannel().onMatchEnded?.(TK));
    // The broadcast froze the plate (this phone's clock) and asked for a read.
    screen.getByText("J. CRUZ ENDED THE MATCH");
    await flush();
    // The read moved the wizard (the recorder stopped in the same tick); the
    // screen still shows the plate, now on the server's clock.
    expect(mockRecorder.stop).toHaveBeenCalled();
    expectPlate(screen);
    await expectHoldThenResult(screen);
  });

  it("the DB change first (a lost broadcast, the server's own end): the plate still shows and holds", async () => {
    const screen = await mountLive(ME);
    expect(screen.queryByText(/ENDED THE MATCH/)).toBeNull();
    mockGetMatchDetails.mockResolvedValue(row("in_progress", { ended: true }));
    await act(async () => mockRow.handler?.());
    await flush();
    expectPlate(screen);
    await expectHoldThenResult(screen);
  });

  it("the live poll finds the end (no broadcast, no row event): the same plate and hold", async () => {
    const screen = await mountLive(ME);
    mockGetMatchDetails.mockResolvedValue(row("in_progress", { ended: true }));
    await tick(10_000);
    expectPlate(screen);
    await expectHoldThenResult(screen);
  });

  it("a broadcast the DB never confirms holds nothing: the live screen comes back", async () => {
    const screen = await mountLive(ME);
    act(() => liveChannel().onMatchEnded?.(TK));
    screen.getByText("J. CRUZ ENDED THE MATCH");
    // Two reads that still show the clock running undo the freeze (RUNNING_READS_TO_UNFREEZE).
    await flush();
    await flush();
    await tick(0);
    expect(screen.queryByText(/ENDED THE MATCH/)).toBeNull();
    screen.getByTestId("match-step-live");
    screen.getByTestId("live-clock-runner");
  });
});

describe("no hold anywhere else", () => {
  it("the timekeeper's phone goes straight to the result form on the read that shows the end", async () => {
    const screen = await mountLive(TK);
    mockGetMatchDetails.mockResolvedValue(row("in_progress", { ended: true }));
    await act(async () => mockRow.handler?.());
    await flush();
    screen.getByTestId("match-step-result");
    expect(screen.queryByText(/ENDED THE MATCH/)).toBeNull();
  });

  it("a two-athlete match the DB moves off live (the opponent recorded, our match_ended lost) goes straight on", async () => {
    const screen = await mountLive(ME, { requiresTimekeeper: false });
    mockGetMatchDetails.mockResolvedValue(row("completed", { requiresTimekeeper: false, outcome: "win" }));
    await tick(10_000);
    screen.getByTestId("match-step-confirm");
    expect(screen.queryByText(/ENDED THE MATCH/)).toBeNull();
  });
});

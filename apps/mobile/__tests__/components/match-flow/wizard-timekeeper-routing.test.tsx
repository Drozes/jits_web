/**
 * The wizard routes a timekeeper-mode match (M1, spec 6.2): the real wizard,
 * the real reconciler and the real step renderer, with the timekeeper-mode
 * screens still the M1 stubs (crew, the timekeeper's face-off, the done
 * screen). Only the data layer, the realtime hook and the recorder are
 * stubbed, as in `wizard-reconcile.test.tsx`.
 *
 *  - the athletes pick on `crew` while nobody is seated, and go back to it
 *    after a pre-start drop-out (the TK-only poll on the face-off);
 *  - the timekeeper is in the match (never "Not a participant"): their own
 *    face-off with the camera held, the result form, the done screen;
 *  - the timekeeper's phone records whatever its "Record from my phone"
 *    toggle says (D12, `caps.recordingRequired`), still only with AI
 *    consent (5.1.2(i)); the athletes' recording is their own choice, as
 *    before, in both modes;
 *  - the timekeeper's camera stays up across ready -> live even when the
 *    match in hand turns in_progress a render before the step turns live;
 *  - a result edit sends a confirmed athlete back to confirm, even when the
 *    first read after it cannot prove the reset (A8);
 *  - a cancel or a lost seat exits through `exitMatchTo`, and the exit is
 *    told who cancelled when a broadcast named them (TK-E1): the
 *    timekeeper's face-off holds the match channel, a received cancel only
 *    re-reads (M-R8) on every phone, and the timekeeper's exit for an
 *    athlete's Leave waits briefly for that name; a void keeps the
 *    timekeeper on the done screen;
 *  - the timekeeper never makes the athletes' weight reads (the challenge
 *    row, the weight checks); the athletes still do (PM26);
 *  - the timekeeper's done screen gets the athletes' confirmations from
 *    `get_match_details`, since the `match_confirmations` RLS (participants
 *    only) hides them from the timekeeper; every athlete reads the table as
 *    before;
 *  - a two-athlete match never reads the timekeeper-mode state, and a
 *    two-athlete match's record-only timekeeper stays "Not a participant".
 */
import * as React from "react";
import { Alert, AppState } from "react-native";
import { render, act, fireEvent } from "@testing-library/react-native";

// ---- environment ----

jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  const stub = () => R.createElement(RN.View, { testID: "icon" });
  return new Proxy(
    {},
    {
      get: (_t: Record<string, unknown>, prop: string) => (prop === "__esModule" ? true : stub),
    },
  );
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

jest.mock("@/components/ui/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockRouterDismissTo = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ dismissTo: mockRouterDismissTo, push: jest.fn(), back: jest.fn() }),
}));

jest.mock("@/lib/auth/hooks", () => ({ useAuth: () => ({ athlete: { id: "me-1" } }) }));

jest.mock("@/lib/network/mutation-queue", () => ({
  mutationQueue: {
    size: () => 0,
    subscribe: () => () => {},
    enqueue: (_key: string, fn: () => unknown) => fn(),
  },
  isQueuedResult: () => false,
}));

jest.mock("@/components/ui/elo-system", () => {
  const R = require("react");
  const RN = require("react-native");
  const stub = (props: { children?: React.ReactNode }) =>
    R.createElement(RN.View, null, props?.children ?? null);
  return new Proxy(
    {},
    { get: (_t: Record<string, unknown>, prop: string) => (prop === "__esModule" ? true : stub) },
  );
});

jest.mock("@/lib/error-tracking/sentry", () => ({ captureException: jest.fn() }));
const mockKeepAwake = jest.fn();
jest.mock("@/lib/match-flow/use-keep-awake", () => ({
  useMatchKeepAwake: (active: boolean) => mockKeepAwake(active),
}));
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
const mockCameraStep = jest.fn();
const mockCameraOptedIn = jest.fn();
jest.mock("@/components/match-flow/match-recorder-surface", () => ({
  MatchRecorderCamera: ({ step, optedIn }: { step: string | null; optedIn?: boolean }) => {
    mockCameraStep(step);
    mockCameraOptedIn(optedIn);
    return null;
  },
  MatchRecorderStatus: () => null,
}));

// The reconciler's plan, held on demand: the snapshot is still applied to the
// match in hand, but the step does not move with it (a render where the
// match is ahead of the step).
const mockPlan = { hold: false };
jest.mock("@/lib/match-flow/reconcile", () => {
  const actual = jest.requireActual("@/lib/match-flow/reconcile");
  return {
    ...actual,
    planReconcile: (p: unknown) => (mockPlan.hold ? { type: "none" } : actual.planReconcile(p)),
  };
});
// The athletes' face-off persists their recording intent; not under test here.
jest.mock("@jits/shared/api/match-video-upload", () => ({
  setMatchRecordingIntent: async () => ({ ok: true, data: null }),
}));

// ---- data layer ----

const mockGetMatchDetails = jest.fn();
/** The `match_confirmations` table read, as RLS shows it to the caller. */
const mockGetMatchConfirmations = jest.fn();
/** The top-level `confirmations` of `get_match_details` (SECURITY DEFINER: every viewer sees them). */
const mockDetailsConfirmations = jest.fn();
const mockGetMatchDetailsWithConfirmations = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({
  getMatchDetails: (...a: unknown[]) => mockGetMatchDetails(...a),
  getMatchConfirmations: (...a: unknown[]) => mockGetMatchConfirmations(...a),
  getMatchDetailsWithConfirmations: (...a: unknown[]) => mockGetMatchDetailsWithConfirmations(...a),
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
}));

// The done screen is M5's; the M1 stub's props are what the wizard hands it.
const mockDoneProps: { confirmedAthleteIds: string[] }[] = [];
jest.mock("@/components/match-flow/steps/timekeeper-done", () => {
  const R = jest.requireActual("react");
  const RN = jest.requireActual("react-native");
  return {
    TimekeeperDone: (props: { confirmedAthleteIds: string[] }) => {
      mockDoneProps.push(props);
      return R.createElement(RN.View, { testID: "timekeeper-done" });
    },
  };
});
/** The athletes the done screen was last told have confirmed. */
function doneConfirmed(): string[] | undefined {
  return mockDoneProps[mockDoneProps.length - 1]?.confirmedAthleteIds;
}

// M4 owns the toast body; here only what the wizard hands it.
const mockNoContestExit = jest.fn();
jest.mock("@/lib/match-flow/no-contest-exit", () => ({
  noContestExit: (...a: unknown[]) => mockNoContestExit(...a),
}));

// The value the wizard provides to its steps, captured to report a broadcast's actor.
const mockSync: { value: { noteCancelActor?: (id: string) => void } | null } = { value: null };
jest.mock("@/lib/match-flow/match-sync-context", () => {
  const actual = jest.requireActual("@/lib/match-flow/match-sync-context");
  const R = jest.requireActual("react");
  return {
    ...actual,
    MatchSyncProvider: (props: { value: { noteCancelActor?: (id: string) => void }; children: React.ReactNode }) => {
      mockSync.value = props.value;
      return R.createElement(actual.MatchSyncProvider, props);
    },
  };
});
jest.mock("expo-image", () => ({ Image: () => null }));

jest.mock("@jits/shared/api/mutations", () => ({
  confirmMatchResult: async () => ({ ok: true, data: {} }),
  disputeMatchResult: async () => ({ ok: true, data: {} }),
  recordMatchResult: async () => ({ ok: true, data: {} }),
  startMatch: jest.fn(),
  cancelSessionMatch: jest.fn(),
  pauseMatch: jest.fn(),
  resumeMatch: jest.fn(),
}));

// A plain object, like the hook's own return (timekeeper mode spreads it to
// name the sender on a cancel, `useStepMatchSync`).
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
type ChannelParams = { enabled?: boolean; onMatchCancelled?: (actorId?: string) => void };
const mockChannels: ChannelParams[] = [];
jest.mock("@jits/shared/hooks/use-session-match-sync", () => ({
  useSessionMatchSync: (p: ChannelParams) => {
    mockChannels.push(p);
    return mockBroadcast;
  },
}));

// The athletes' weight reads (PM26: never the timekeeper's).
const mockGetChallengeWeights = jest.fn();
jest.mock("@jits/shared/api/match-weights", () => ({
  ...jest.requireActual("@jits/shared/api/match-weights"),
  getMatchChallengeWeights: (...a: unknown[]) => mockGetChallengeWeights(...a),
}));
const mockGetWeightChecks = jest.fn();
jest.mock("@jits/shared/api/match-weight-checks", () => ({
  ...jest.requireActual("@jits/shared/api/match-weight-checks"),
  getMatchWeightChecks: (...a: unknown[]) => mockGetWeightChecks(...a),
}));

/** The newest open channel that handles a cancel (the face-off's). */
function cancelChannel(): ChannelParams {
  const open = mockChannels.filter((c) => c.enabled !== false && typeof c.onMatchCancelled === "function");
  expect(open.length).toBeGreaterThan(0);
  return open[open.length - 1];
}

import { MatchFlowWizard } from "@/components/match-flow/match-flow-wizard";
import { toast } from "@/components/ui/toast";
import { cancelSessionMatch } from "@jits/shared/api/mutations";
import { __resetRecordingOptInForTests } from "@/lib/match-flow/recording-optin";
import { __resetAiConsentForTests } from "@/lib/moderation/ai-consent";

// ---- fixtures ----

const ME = "me-1";
const OPP = "opp-1";
const TK = "tk-1";
const EXIT = "/(app)/(tabs)/arena";

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

interface TkRow {
  timekeeperId?: string | null;
  endedAt?: string | null;
  cancelReason?: string | null;
  outcome?: "win" | "loss" | null;
  requiresTimekeeper?: boolean;
  /** A challenge-backed match (the athletes' weight reads). */
  challengeId?: string | null;
}

/** A timekeeper-mode match ME challenged, as BE-G reports it. */
function tkRow(status: string, o: TkRow = {}) {
  const tkId = o.timekeeperId === undefined ? TK : o.timekeeperId;
  const mine = o.outcome ?? null;
  const theirs = mine === "win" ? "loss" : mine === "loss" ? "win" : null;
  return {
    id: "M1",
    challenge_id: o.challengeId ?? null,
    session_id: null,
    match_type: "ranked",
    duration_seconds: 300,
    status,
    result: mine ? "submission" : null,
    started_at: status === "pending" ? null : "2026-09-25T12:00:00.000Z",
    completed_at: mine ? "2026-09-25T12:06:00.000Z" : null,
    paused_at: null,
    total_paused_duration: 0,
    timekeeper_id: tkId,
    participants: [participant(ME, "Mina Park", mine), participant(OPP, "Demo Okafor", theirs)],
    requires_timekeeper: o.requiresTimekeeper ?? true,
    tk_weight_check_required: true,
    challenger_id: ME,
    ended_at: o.endedAt ?? null,
    final_elapsed_s: null,
    timekeeper_deadline_at: tkId ? null : "2026-09-25T12:20:00.000Z",
    cancel_reason: o.cancelReason ?? null,
    result_edit_count: 0,
    result_edited_at: null,
    result_recorded_by_admin: false,
    timekeeper: tkId ? { id: tkId, display_name: "Jo Cruz", profile_photo_url: null } : null,
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

async function mount(viewerId: string, row: ReturnType<typeof tkRow>) {
  mockGetMatchDetails.mockResolvedValue(row);
  const screen = render(
    <MatchFlowWizard exitHref={EXIT} exitLabel="Back to Arena" matchId="M1" currentAthleteId={viewerId} />,
  );
  await flush();
  await flush();
  return screen;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockRow.handler = null;
  jest.spyOn(AppState, "addEventListener").mockImplementation((() => ({ remove: jest.fn() })) as never);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  mockGetMatchConfirmations.mockResolvedValue([]);
  mockDetailsConfirmations.mockReturnValue([]);
  mockGetMatchDetailsWithConfirmations.mockImplementation(async (...a: unknown[]) => {
    const match = await mockGetMatchDetails(...a);
    return match ? { match, confirmations: mockDetailsConfirmations() } : null;
  });
  mockDoneProps.length = 0;
  mockGetTimekeeperState.mockResolvedValue({ ok: true, data: STATE });
  mockNoContestExit.mockReturnValue(null);
  mockSync.value = null;
  mockPlan.hold = false;
  mockChannels.length = 0;
  mockGetChallengeWeights.mockResolvedValue(null);
  mockGetWeightChecks.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "n/a" } });
  // First use: "Record from my phone" OFF, no AI consent known.
  __resetRecordingOptInForTests(false);
  __resetAiConsentForTests();
});

/** AI processing consent given by `athleteId` (5.1.2(i)). */
function consentFor(athleteId: string) {
  __resetAiConsentForTests({ athleteId, consentAt: "2026-10-14T12:00:00Z", known: true });
}

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("timekeeper mode: the athletes", () => {
  it("pick on crew while nobody is seated", async () => {
    const screen = await mount(ME, tkRow("pending", { timekeeperId: null }));
    screen.getByTestId("match-step-crew");
    screen.getByTestId("crew-step");
    expect(screen.queryByTestId("faceoff-top-label")).toBeNull();
    expect(mockGetTimekeeperState).toHaveBeenCalledWith(expect.anything(), "M1");
  });

  it("move to the face-off once someone is seated (the crew poll)", async () => {
    const screen = await mount(ME, tkRow("pending", { timekeeperId: null }));
    screen.getByTestId("match-step-crew");
    mockGetMatchDetails.mockResolvedValue(tkRow("pending"));
    await tick(4_000);
    screen.getByTestId("match-step-weight");
    // The athletes' face-off, with its header.
    screen.getByTestId("faceoff-top-label");
  });

  it("reopen on ready when the server already has them ready", async () => {
    mockGetTimekeeperState.mockResolvedValue({ ok: true, data: { ...STATE, ready: [{ athleteId: ME, readyAt: "R" }] } });
    const screen = await mount(ME, tkRow("pending"));
    screen.getByTestId("match-step-ready");
  });

  it("stay on the weigh-in while the server has only the other athlete ready", async () => {
    mockGetTimekeeperState.mockResolvedValue({ ok: true, data: { ...STATE, ready: [{ athleteId: OPP, readyAt: "R" }] } });
    const screen = await mount(ME, tkRow("pending"));
    screen.getByTestId("match-step-weight");
  });

  it("go back to crew after a pre-start drop-out (A5)", async () => {
    const screen = await mount(ME, tkRow("pending"));
    screen.getByTestId("match-step-weight");
    mockGetMatchDetails.mockResolvedValue(tkRow("pending", { timekeeperId: null }));
    await tick(4_000);
    screen.getByTestId("match-step-crew");
  });

  it("wait on the result step once the timekeeper ended the clock", async () => {
    const screen = await mount(ME, tkRow("in_progress", { endedAt: "2026-09-25T12:05:00.000Z" }));
    screen.getByTestId("match-step-result");
  });

  it("go back to confirm from the verdict when the timekeeper edits the result (A8)", async () => {
    mockGetMatchConfirmations.mockResolvedValue([ME]);
    const screen = await mount(ME, tkRow("completed", { outcome: "win" }));
    screen.getByTestId("match-step-summary");
    mockGetMatchConfirmations.mockResolvedValue([]);
    mockGetMatchDetails.mockResolvedValue({ ...tkRow("completed", { outcome: "loss" }), result_edit_count: 1 });
    await act(async () => mockRow.handler?.());
    await flush();
    screen.getByTestId("match-step-confirm");
  });

  it("go back to confirm when the first read after the edit straddles it (A8)", async () => {
    mockGetMatchConfirmations.mockResolvedValue([ME]);
    const screen = await mount(ME, tkRow("completed", { outcome: "win" }));
    screen.getByTestId("match-step-summary");
    // The match read sees the edit; the confirmations read, a moment older, still lists me.
    mockGetMatchConfirmations.mockResolvedValueOnce([ME]);
    mockGetMatchDetails.mockResolvedValue({ ...tkRow("completed", { outcome: "loss" }), result_edit_count: 1 });
    await act(async () => mockRow.handler?.());
    await flush();
    screen.getByTestId("match-step-summary");
    // The next read is consistent: the edit, and my confirmation gone.
    mockGetMatchConfirmations.mockResolvedValue([]);
    await act(async () => mockRow.handler?.());
    await flush();
    screen.getByTestId("match-step-confirm");
  });

  it("go back to confirm when the confirmations read failed at the edit (A8)", async () => {
    mockGetMatchConfirmations.mockResolvedValue([ME]);
    const screen = await mount(ME, tkRow("completed", { outcome: "win" }));
    screen.getByTestId("match-step-summary");
    mockGetMatchConfirmations.mockResolvedValueOnce(null);
    mockGetMatchDetails.mockResolvedValue({ ...tkRow("completed", { outcome: "loss" }), result_edit_count: 1 });
    await act(async () => mockRow.handler?.());
    await flush();
    screen.getByTestId("match-step-summary");
    mockGetMatchConfirmations.mockResolvedValue([]);
    await act(async () => mockRow.handler?.());
    await flush();
    screen.getByTestId("match-step-confirm");
  });

  it("read the confirmations from the table, as before, never through get_match_details", async () => {
    mockGetMatchConfirmations.mockResolvedValue([ME]);
    const screen = await mount(ME, tkRow("completed", { outcome: "win" }));
    screen.getByTestId("match-step-summary");
    expect(mockGetMatchConfirmations).toHaveBeenCalledWith(expect.anything(), "M1");
    expect(mockGetMatchDetailsWithConfirmations).not.toHaveBeenCalled();
  });

  it("stay on the verdict when a re-read shows no edit, even without their confirmation listed", async () => {
    mockGetMatchConfirmations.mockResolvedValue([ME]);
    const screen = await mount(ME, tkRow("completed", { outcome: "win" }));
    screen.getByTestId("match-step-summary");
    // A stale read (taken before their confirmation landed) at the same count.
    mockGetMatchConfirmations.mockResolvedValue([]);
    await act(async () => mockRow.handler?.());
    await flush();
    screen.getByTestId("match-step-summary");
  });

  it("take a cancel broadcast on the face-off as a re-read, never the shipped exit (M-R8), naming who left (TK-E1)", async () => {
    await mount(ME, tkRow("pending"));
    const channel = cancelChannel();
    mockGetMatchDetails.mockResolvedValue(tkRow("cancelled", { cancelReason: "athlete_left" }));
    await act(async () => channel.onMatchCancelled?.(OPP));
    await flush();
    expect(toast.info).not.toHaveBeenCalledWith(expect.objectContaining({ description: "Your opponent cancelled the match." }));
    expect(mockNoContestExit).toHaveBeenCalledTimes(1);
    expect(mockNoContestExit).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "athlete_left", actorId: OPP, roles: expect.objectContaining({ viewer: "challenger" }) }),
    );
    expect(mockRouterDismissTo).toHaveBeenCalledWith(EXIT);
  });

  it("name themselves on the cancel their Leave sends (TK-E1)", async () => {
    (cancelSessionMatch as jest.Mock).mockResolvedValue({ ok: true, data: {} });
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => buttons?.[1]?.onPress?.());
    const screen = await mount(ME, tkRow("pending"));
    fireEvent.press(screen.getByLabelText("Cancel match"));
    await flush();
    expect(cancelSessionMatch).toHaveBeenCalledWith(expect.anything(), "M1");
    expect(mockBroadcast.broadcastMatchCancelled).toHaveBeenCalledWith(ME);
    expect(mockRouterDismissTo).toHaveBeenCalledWith(EXIT);
    alert.mockRestore();
  });

  it("a cancel broadcast while the match is still pending (the cancel failed) only re-reads", async () => {
    const screen = await mount(ME, tkRow("pending"));
    const channel = cancelChannel();
    await act(async () => channel.onMatchCancelled?.(OPP));
    await flush();
    screen.getByTestId("match-step-weight");
    expect(mockRouterDismissTo).not.toHaveBeenCalled();
  });

  it("exit an athlete's Leave at once: the only other athlete left (no wait for a name)", async () => {
    await mount(ME, tkRow("pending"));
    mockGetMatchDetails.mockResolvedValue(tkRow("cancelled", { cancelReason: "athlete_left" }));
    await tick(4_000);
    expect(mockNoContestExit).toHaveBeenCalledWith(expect.objectContaining({ reason: "athlete_left", actorId: null }));
    expect(mockRouterDismissTo).toHaveBeenCalledWith(EXIT);
  });

  it("still make their own weight reads on the face-off (the challenge row, the weight checks)", async () => {
    await mount(ME, tkRow("pending", { challengeId: "C1" }));
    expect(mockGetChallengeWeights).toHaveBeenCalledWith(expect.anything(), "C1");
    expect(mockGetWeightChecks).toHaveBeenCalledWith(expect.anything(), "M1");
  });

  it("exit a cancelled match through exitMatchTo", async () => {
    const screen = await mount(ME, tkRow("pending"));
    screen.getByTestId("match-step-weight");
    mockGetMatchDetails.mockResolvedValue(tkRow("cancelled", { timekeeperId: null, cancelReason: "faceoff_timeout" }));
    await tick(4_000);
    expect(mockRouterDismissTo).toHaveBeenCalledWith(EXIT);
    expect(toast.info).toHaveBeenCalledTimes(1);
  });
});

describe("timekeeper mode: the timekeeper", () => {
  it("is in the match: their own face-off, the camera warm and the screen held awake", async () => {
    consentFor(TK);
    const screen = await mount(TK, tkRow("pending"));
    expect(screen.queryByText("Not a participant")).toBeNull();
    screen.getByTestId("match-step-weight");
    screen.getByTestId("faceoff-timekeeper");
    // The athletes' face-off header (and its Leave) is not theirs.
    expect(screen.queryByTestId("faceoff-top-label")).toBeNull();
    expect(screen.queryByTestId("faceoff-leave")).toBeNull();
    expect(mockCameraStep).toHaveBeenLastCalledWith("ready");
    // Their device toggle is off (first use), and they record anyway (D12).
    expect(mockCameraOptedIn).toHaveBeenLastCalledWith(true);
    expect(mockKeepAwake).toHaveBeenLastCalledWith(true);
  });

  it("records only with AI consent, even though they must record (5.1.2(i))", async () => {
    __resetRecordingOptInForTests(true);
    // Consent known and not given: the camera gate asks first (M3).
    __resetAiConsentForTests({ athleteId: TK, consentAt: null, known: true });
    await mount(TK, tkRow("pending"));
    expect(mockCameraStep).toHaveBeenLastCalledWith("ready");
    expect(mockCameraOptedIn).toHaveBeenLastCalledWith(false);
  });

  it("records under another athlete's consent never (an account switch on the phone)", async () => {
    consentFor(ME);
    await mount(TK, tkRow("pending"));
    expect(mockCameraOptedIn).toHaveBeenLastCalledWith(false);
  });

  it("keeps the camera up when the match turns in_progress a render before the step turns live", async () => {
    consentFor(TK);
    const screen = await mount(TK, tkRow("pending"));
    expect(mockCameraStep).toHaveBeenLastCalledWith("ready");
    const fromReady = mockCameraStep.mock.calls.length - 1;
    const awakeFrom = mockKeepAwake.mock.calls.length - 1;
    // The started match lands, but the step stays on the face-off for a render.
    mockPlan.hold = true;
    mockGetMatchDetails.mockResolvedValue(tkRow("in_progress"));
    await tick(4_000);
    screen.getByTestId("match-step-weight");
    // Then the step follows.
    mockPlan.hold = false;
    await tick(4_000);
    screen.getByTestId("match-step-live");
    const steps = mockCameraStep.mock.calls.slice(fromReady).map(([s]) => s);
    expect(steps[steps.length - 1]).toBe("live");
    // Only ready then live: the recorder camera is mounted on both, so the
    // capture session is never torn down between them.
    expect(steps.every((s) => s === "ready" || s === "live")).toBe(true);
    // And the wake-lock is held throughout.
    expect(mockKeepAwake.mock.calls.slice(awakeFrom).every(([held]) => held === true)).toBe(true);
  });

  it("records on the result step once the clock ended", async () => {
    const screen = await mount(TK, tkRow("in_progress", { endedAt: "2026-09-25T12:05:00.000Z" }));
    screen.getByTestId("match-step-result");
  });

  it("lands on the done screen for a recorded result", async () => {
    const screen = await mount(TK, tkRow("completed", { outcome: "win" }));
    screen.getByTestId("match-step-summary");
    screen.getByTestId("timekeeper-done");
  });

  /** One athlete's positive confirmation, as `get_match_details` lists it. */
  const confirmed = (athleteId: string) => ({ athlete_id: athleteId, confirmed_at: "2026-09-25T12:07:00.000Z" });

  it("sees the athletes' confirmations on the done screen, though the table's RLS hides them from the timekeeper", async () => {
    // RLS: the timekeeper is never a participant, so the table reads [] for
    // them with no error; get_match_details still lists the confirmation.
    mockGetMatchConfirmations.mockResolvedValue([]);
    mockDetailsConfirmations.mockReturnValue([confirmed(OPP)]);
    const screen = await mount(TK, tkRow("completed", { outcome: "win" }));
    screen.getByTestId("timekeeper-done");
    expect(doneConfirmed()).toEqual([OPP]);
    expect(mockGetMatchDetailsWithConfirmations).toHaveBeenCalledWith(expect.anything(), "M1");
    expect(mockGetMatchConfirmations).not.toHaveBeenCalled();
  });

  it("the done screen's 4 s poll brings a later confirmation, and an edit's reset", async () => {
    mockDetailsConfirmations.mockReturnValue([confirmed(OPP)]);
    await mount(TK, tkRow("completed", { outcome: "win" }));
    expect(doneConfirmed()).toEqual([OPP]);
    // The other athlete confirms; no row event or broadcast reaches this phone.
    mockDetailsConfirmations.mockReturnValue([confirmed(OPP), confirmed(ME)]);
    await tick(4_000);
    expect(doneConfirmed()).toEqual([OPP, ME]);
    // A result edit resets both (A8): the next poll shows nobody.
    mockDetailsConfirmations.mockReturnValue([]);
    mockGetMatchDetails.mockResolvedValue({ ...tkRow("completed", { outcome: "loss" }), result_edit_count: 1 });
    await tick(4_000);
    expect(doneConfirmed()).toEqual([]);
    expect(mockGetMatchConfirmations).not.toHaveBeenCalled();
  });

  it("keeps the last confirmations it knew when a read carries none (unknown, not nobody)", async () => {
    mockDetailsConfirmations.mockReturnValue([confirmed(OPP)]);
    await mount(TK, tkRow("completed", { outcome: "win" }));
    mockGetMatchDetailsWithConfirmations.mockImplementation(async () => ({
      match: tkRow("completed", { outcome: "win" }),
      confirmations: null,
    }));
    await tick(4_000);
    expect(doneConfirmed()).toEqual([OPP]);
  });

  it("exits an athlete's Leave with the athlete a broadcast named (TK-E1)", async () => {
    await mount(TK, tkRow("pending"));
    act(() => mockSync.value?.noteCancelActor?.(OPP));
    mockGetMatchDetails.mockResolvedValue(tkRow("cancelled", { cancelReason: "athlete_left" }));
    await tick(4_000);
    expect(mockNoContestExit).toHaveBeenCalledTimes(1);
    expect(mockNoContestExit).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "athlete_left", actorId: OPP, roles: expect.objectContaining({ viewer: "timekeeper" }) }),
    );
    expect(mockRouterDismissTo).toHaveBeenCalledWith(EXIT);
  });

  it("exits a cancel no broadcast named with no actor, once the grace for the name has passed", async () => {
    await mount(TK, tkRow("pending"));
    mockGetMatchDetails.mockResolvedValue(tkRow("cancelled", { cancelReason: "athlete_left" }));
    await tick(4_000);
    // The cancel shows before any broadcast: the exit waits for the name.
    expect(mockNoContestExit).not.toHaveBeenCalled();
    expect(mockRouterDismissTo).not.toHaveBeenCalled();
    await tick(1_500);
    expect(mockNoContestExit).toHaveBeenCalledTimes(1);
    expect(mockNoContestExit).toHaveBeenCalledWith(expect.objectContaining({ reason: "athlete_left", actorId: null }));
    expect(mockRouterDismissTo).toHaveBeenCalledWith(EXIT);
  });

  it("holds the match channel on their face-off: an athlete's cancel broadcast names them and re-reads (TK-E1)", async () => {
    await mount(TK, tkRow("pending"));
    const channel = cancelChannel();
    mockGetMatchDetails.mockResolvedValue(tkRow("cancelled", { cancelReason: "athlete_left" }));
    await act(async () => channel.onMatchCancelled?.(OPP));
    await flush();
    // No poll needed: the broadcast re-read, and the exit knew the name at once.
    expect(mockNoContestExit).toHaveBeenCalledTimes(1);
    expect(mockNoContestExit).toHaveBeenCalledWith(expect.objectContaining({ reason: "athlete_left", actorId: OPP }));
    expect(mockRouterDismissTo).toHaveBeenCalledWith(EXIT);
  });

  it("an exit held for the name goes the moment the broadcast arrives", async () => {
    await mount(TK, tkRow("pending"));
    const channel = cancelChannel();
    mockGetMatchDetails.mockResolvedValue(tkRow("cancelled", { cancelReason: "athlete_left" }));
    await tick(4_000);
    expect(mockNoContestExit).not.toHaveBeenCalled();
    await act(async () => channel.onMatchCancelled?.(ME));
    await flush();
    expect(mockNoContestExit).toHaveBeenCalledTimes(1);
    expect(mockNoContestExit).toHaveBeenCalledWith(expect.objectContaining({ actorId: ME }));
    expect(mockRouterDismissTo).toHaveBeenCalledTimes(1);
    // The grace timer finds nothing left to run.
    await tick(1_500);
    expect(mockNoContestExit).toHaveBeenCalledTimes(1);
    expect(mockRouterDismissTo).toHaveBeenCalledTimes(1);
  });

  it("never waits for a name on any other no contest", async () => {
    await mount(TK, tkRow("pending"));
    mockGetMatchDetails.mockResolvedValue(tkRow("cancelled", { cancelReason: "faceoff_timeout" }));
    await tick(4_000);
    expect(mockNoContestExit).toHaveBeenCalledWith(expect.objectContaining({ reason: "faceoff_timeout", actorId: null }));
  });

  it("never makes the athletes' weight reads (RLS and participants only); its weights come from the state (PM26)", async () => {
    await mount(TK, tkRow("pending", { challengeId: "C1" }));
    await tick(4_000);
    expect(mockGetChallengeWeights).not.toHaveBeenCalled();
    expect(mockGetWeightChecks).not.toHaveBeenCalled();
  });

  it("stays on the done screen for a voided match (spec 6.2)", async () => {
    const screen = await mount(TK, tkRow("voided", { outcome: "win" }));
    screen.getByTestId("match-step-summary");
    screen.getByTestId("timekeeper-done");
    await tick(4_000);
    screen.getByTestId("timekeeper-done");
    expect(mockRouterDismissTo).not.toHaveBeenCalled();
  });

  it("never warms the camera for a cancelled match it opens (a stale push)", async () => {
    await mount(TK, tkRow("cancelled", { cancelReason: "faceoff_timeout" }));
    expect(mockCameraStep).not.toHaveBeenCalledWith("ready");
    expect(mockKeepAwake).not.toHaveBeenCalledWith(true);
    expect(mockRouterDismissTo).toHaveBeenCalledWith(EXIT);
  });

  it("exits when the seat is gone (the state read refuses them, TK-K17)", async () => {
    mockGetTimekeeperState.mockResolvedValue({ ok: false, error: { code: "NOT_PARTICIPANT", message: "x" } });
    await mount(TK, tkRow("pending"));
    expect(mockRouterDismissTo).toHaveBeenCalledWith(EXIT);
    expect(toast.info).toHaveBeenCalledTimes(1);
  });
});

describe("the athletes record by their own choice, in both modes", () => {
  it.each([true, false])("requires_timekeeper %s: toggle off means no recording, even with consent", async (tk) => {
    consentFor(ME);
    await mount(ME, tkRow("pending", { requiresTimekeeper: tk, timekeeperId: tk ? TK : null }));
    expect(mockCameraOptedIn).toHaveBeenLastCalledWith(false);
  });

  it.each([true, false])("requires_timekeeper %s: toggle on and consent means recording", async (tk) => {
    __resetRecordingOptInForTests(true);
    consentFor(ME);
    await mount(ME, tkRow("pending", { requiresTimekeeper: tk, timekeeperId: tk ? TK : null }));
    expect(mockCameraOptedIn).toHaveBeenLastCalledWith(true);
  });

  it.each([true, false])("requires_timekeeper %s: toggle on without consent means no recording", async (tk) => {
    __resetRecordingOptInForTests(true);
    await mount(ME, tkRow("pending", { requiresTimekeeper: tk, timekeeperId: tk ? TK : null }));
    expect(mockCameraOptedIn).toHaveBeenLastCalledWith(false);
  });
});

describe("the two-athlete flow", () => {
  it("keeps the face-off's own cancel exit (the shipped toast, no re-read wait)", async () => {
    await mount(ME, tkRow("pending", { requiresTimekeeper: false, timekeeperId: null }));
    const channel = cancelChannel();
    act(() => channel.onMatchCancelled?.());
    expect(toast.info).toHaveBeenCalledWith(expect.objectContaining({ description: "Your opponent cancelled the match." }));
    expect(mockRouterDismissTo).toHaveBeenCalledWith(EXIT);
    expect(mockNoContestExit).not.toHaveBeenCalled();
  });

  it("sends the face-off's cancel without an actor, as before", async () => {
    (cancelSessionMatch as jest.Mock).mockResolvedValue({ ok: true, data: {} });
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => buttons?.[1]?.onPress?.());
    const screen = await mount(ME, tkRow("pending", { requiresTimekeeper: false, timekeeperId: null }));
    fireEvent.press(screen.getByLabelText("Cancel match"));
    await flush();
    expect(mockBroadcast.broadcastMatchCancelled).toHaveBeenCalledWith();
    expect(mockRouterDismissTo).toHaveBeenCalledWith(EXIT);
    alert.mockRestore();
  });

  it("makes the same weight reads as before", async () => {
    await mount(ME, tkRow("pending", { requiresTimekeeper: false, timekeeperId: null, challengeId: "C1" }));
    expect(mockGetChallengeWeights).toHaveBeenCalledWith(expect.anything(), "C1");
    expect(mockGetWeightChecks).toHaveBeenCalledWith(expect.anything(), "M1");
  });

  it("reads the confirmations from the table, never through get_match_details", async () => {
    mockGetMatchConfirmations.mockResolvedValue([ME, OPP]);
    const screen = await mount(ME, tkRow("completed", { outcome: "win", requiresTimekeeper: false, timekeeperId: null }));
    screen.getByTestId("match-step-summary");
    expect(mockGetMatchConfirmations).toHaveBeenCalledWith(expect.anything(), "M1");
    expect(mockGetMatchDetailsWithConfirmations).not.toHaveBeenCalled();
  });

  it("never reads the timekeeper-mode state", async () => {
    const screen = await mount(ME, tkRow("pending", { requiresTimekeeper: false, timekeeperId: null }));
    screen.getByTestId("match-step-weight");
    await tick(20_000);
    expect(mockGetTimekeeperState).not.toHaveBeenCalled();
  });

  it("keeps a record-only timekeeper (the code join) out: Not a participant", async () => {
    const screen = await mount(TK, tkRow("pending", { requiresTimekeeper: false }));
    screen.getByText("Not a participant");
    expect(mockGetTimekeeperState).not.toHaveBeenCalled();
  });
});

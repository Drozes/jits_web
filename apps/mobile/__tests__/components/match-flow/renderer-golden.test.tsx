/**
 * Flag-OFF golden test (timekeeper mode, TEST-PLAN 3.1 item 3, spec 14.7 P4).
 *
 * The real wizard, the real step renderer and the real steps render every
 * screen of a two-athlete (self-run) match three times: with the match
 * payload as an older backend sends it (no `requires_timekeeper`), with
 * `requires_timekeeper: false`, and with every timekeeper-mode key present at
 * its flag-OFF value (the backend after BE-G, for a flag-OFF match, with
 * `challenger_id` naming the OTHER athlete). All three trees must be
 * identical, and equal to the committed snapshot. The third variant proves
 * the extra keys change nothing; it does not prove that athlete order cannot
 * leak: `deriveMatchRoles` does not read `challenger_id` yet (the first
 * participant stands in until M1), and no variant reverses the participant
 * order.
 *
 * Two match shapes are pinned. The challenge-free one (`challenge_id: null`)
 * is the original seven steps. The challenge-backed one is what production
 * renders, since every mobile Arena match has a challenge: the wizard then
 * reads the challenge's rated weights (useMatchWeights) and, on the
 * face-off, the weight checks (useMatchWeightChecks), so its cases pin the
 * rated weights on the fight card, the chip and the countdown, the gap line,
 * the stakes strip (a null get_rating_stakes response, and one case with
 * stakes), the weight check plate and panel, and the ready step's weight
 * hold. The countdown (started_at one second before NOW) and the confirm and
 * verdict screens for a win, a loss and a draw are pinned too.
 *
 * The snapshot is the baseline (PLAN.md section 5, "Golden baseline", R3-6).
 * Every entry was captured by running this file, unchanged, in a clean
 * worktree of f88a9920 (before PR1 touched any source), then copied here.
 * Only the slices that change flag-OFF output by owner decision may
 * re-capture it (M5 for A25, M6 for A11 and O1, M9 for A21; ARCHITECTURE
 * M-R5), each reviewed as exactly that change.
 *
 * One owner-approved re-capture so far: the Rating V9 client merge (PR #81,
 * jits-76le.1, merged into this branch before Wave 2) changed exactly two
 * copy lines, nothing else: the face-off weight-gap note ("The heavier
 * athlete is favoured, so they win fewer points.", entry "challenge: weight,
 * stakes") and the verdict weight-class line ("1 weight class apart. The
 * heavier athlete was favoured, so they win fewer points.", entries
 * "challenge: summary, win / loss / draw"). Its stakes now come from
 * `get_rating_stakes` (opponent id and match id) with the same numbers, so
 * the strip itself is unchanged.
 *
 * Only the data layer, the realtime hook, the recorder and the native
 * modules are stubbed (the same set `wizard-reconcile.test.tsx` uses, plus
 * the challenge weight, weight check and stakes reads). Exactly two raw
 * differences between f88a9920 and the refactor are accepted, and each is
 * normalized narrowly in `serialize` / `normalize` below:
 *  - the dev-only step marker's "Step N of T" index (PR1 deleted the dead
 *    `wait` step: "of 8" became "of 7"). It is a harness hook hidden in
 *    release builds; the marker's step name stays in the tree.
 *  - the countdown caption's text children (PR3 made the caption a prop:
 *    JSX's three adjacent children "SYNCED TO SERVER CLOCK ", "·",
 *    " BOTH PHONES" became one string). The rendered text is the same.
 */
import * as React from "react";
import { AppState } from "react-native";
import { render, fireEvent, act } from "@testing-library/react-native";

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

jest.mock("@/components/ui/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

jest.mock("expo-router", () => ({
  useRouter: () => ({ dismissTo: jest.fn(), push: jest.fn(), back: jest.fn() }),
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

const mockRecorder = {
  permission: { granted: false },
  state: "idle",
  error: null,
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

// ---- data layer ----

const mockGetMatchDetails = jest.fn();
const mockGetMatchConfirmations = jest.fn();
const mockGetRatingStakes = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({
  getMatchDetails: (...a: unknown[]) => mockGetMatchDetails(...a),
  getMatchConfirmations: (...a: unknown[]) => mockGetMatchConfirmations(...a),
  getSubmissionTypes: async () => [],
  getRatingStakes: (...a: unknown[]) => mockGetRatingStakes(...a),
  getMatchDetailView: async () => ({ ok: true, data: { videos: [] } }),
}));
jest.mock("@jits/shared/api/match-rank-change", () => ({
  getMatchRankChange: async () => ({ ok: false, error: { code: "UNKNOWN", message: "n/a" } }),
}));
jest.mock("expo-image", () => ({ Image: () => null }));

// The challenge's rated weights (useMatchWeights) and the face-off weight
// checks (useMatchWeightChecks, and the check RPC behind its Confirm). Only
// the reads and that RPC are stubbed: `weightsFor`, the payload parser and
// every check helper stay real, so the replies below go through the same
// shaping the app applies to the backend's.
const mockGetMatchChallengeWeights = jest.fn();
jest.mock("@jits/shared/api/match-weights", () => ({
  ...jest.requireActual("@jits/shared/api/match-weights"),
  getMatchChallengeWeights: (...a: unknown[]) => mockGetMatchChallengeWeights(...a),
}));
const mockGetMatchWeightChecks = jest.fn();
const mockCheckOpponentWeight = jest.fn();
jest.mock("@jits/shared/api/match-weight-checks", () => ({
  ...jest.requireActual("@jits/shared/api/match-weight-checks"),
  getMatchWeightChecks: (...a: unknown[]) => mockGetMatchWeightChecks(...a),
  checkOpponentWeight: (...a: unknown[]) => mockCheckOpponentWeight(...a),
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

// ---- realtime: capture each step's handlers ----

type Handlers = Record<string, ((...a: unknown[]) => void) | undefined>;
const mockSyncCalls: Handlers[] = [];
const mockBroadcast = new Proxy(
  {},
  { get: () => () => Promise.resolve("ok") },
);
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
import { __resetFreshForTests, __resetPlayedMomentsForTests } from "@/components/ui/elo-system/play-once";
import { __resetHeaderEloForTests } from "@/lib/rating/header-elo";
import { __resetStripSuppressionsForTests } from "@/lib/video/upload-strip-visibility";
import { parseMatchWeightChecks } from "@jits/shared/api/match-weight-checks";
import { ratingStakes } from "../../support/rating-stakes";

// ---- fixtures ----

/** A fixed clock, so every time-derived line (dispute window, freshness) is stable. */
const NOW = new Date("2026-09-25T12:12:00.000Z");
/** A `started_at` one second before NOW: the 3-2-1 is still on "2". */
const ONE_SECOND_AGO = "2026-09-25T12:11:59.000Z";

type Outcome = "win" | "loss" | "draw";

/**
 * Draw deltas, kept from the pre-V9 baseline (both negative). The viewer's is
 * negative (the favourite gives up points), which Rating V9's sign-based draw
 * colour still renders amber, so the draw entries are unchanged.
 */
const DRAW_DELTA: Record<string, number> = { "me-1": -6, "opp-1": -2 };

function participant(id: string, name: string, outcome: Outcome | null, elo: number, weight: number, gap: number) {
  const delta = outcome === "win" ? 16 : outcome === "loss" ? -16 : outcome === "draw" ? DRAW_DELTA[id] : 0;
  return {
    athlete_id: id,
    display_name: name,
    current_elo: elo,
    current_weight: weight,
    profile_photo_url: null,
    role: "competitor",
    outcome,
    elo_before: outcome ? elo : null,
    elo_after: outcome ? elo + delta : null,
    elo_delta: delta,
    weight_division_gap: gap,
  };
}

/**
 * The challenge (sent by opp-1, accepted by me-1) and its stamped weights,
 * lbs. They differ from both profile weights (172.5 and 171.4) on purpose,
 * so a screen that shows the profile pair instead of the rated one shows up
 * in the snapshot. 168 and 170.2 sit one IBJJF division apart.
 */
const CHALLENGE_WEIGHTS = {
  challengerId: "opp-1",
  opponentId: "me-1",
  challengerWeight: 168,
  opponentWeight: 170.2,
};

type CheckStatus = "pending" | "confirmed" | "flagged" | "recheck";

interface ChecksSpec {
  /** feature flag opponent_weight_check_required. */
  required?: boolean;
  /** My check of the opponent. */
  mine?: CheckStatus;
  /** The opponent's check of me. */
  theirs?: CheckStatus;
}

/**
 * `get_match_weight_checks`'s raw payload (jr_be 20260930201044): the
 * challenger's check first, the rated weights as {athlete_id, weight} rows.
 * `check_opponent_weight` returns the same payload.
 */
function checksPayload({ required = false, mine = "pending", theirs = "pending" }: ChecksSpec = {}) {
  const blocked = [mine, theirs].some((s) => s === "flagged" || s === "recheck");
  const confirmed = [mine, theirs].filter((s) => s === "confirmed").length;
  const check = (checker: string, subject: string, status: CheckStatus, seen: number) => ({
    checker_id: checker,
    subject_id: subject,
    status,
    weight_seen: status === "pending" ? null : seen,
    flag_count: status === "flagged" ? 1 : 0,
    flagged_at: status === "flagged" ? "2026-09-25T12:10:00.000Z" : null,
    reweighed_at: null,
    updated_at: status === "pending" ? null : "2026-09-25T12:10:00.000Z",
  });
  return {
    match_id: "M1",
    required,
    blocked,
    can_start: !blocked && (!required || confirmed === 2),
    weights: [
      { athlete_id: CHALLENGE_WEIGHTS.challengerId, weight: CHALLENGE_WEIGHTS.challengerWeight },
      { athlete_id: CHALLENGE_WEIGHTS.opponentId, weight: CHALLENGE_WEIGHTS.opponentWeight },
    ],
    checks: [
      check("opp-1", "me-1", theirs, CHALLENGE_WEIGHTS.opponentWeight),
      check("me-1", "opp-1", mine, CHALLENGE_WEIGHTS.challengerWeight),
    ],
  };
}

/** What the weight-check reads resolve to: the app's own parse of the raw payload. */
function checksReply(spec: ChecksSpec = {}) {
  return { ok: true, data: parseMatchWeightChecks(checksPayload(spec)) };
}

/** `get_rating_stakes` from the viewer's side, one division apart. */
const STAKES = ratingStakes({
  win: 14,
  draw: -3,
  loss: -18,
  opponent_win: 18,
  opponent_draw: 3,
  opponent_loss: -14,
  win_probability: 0.54,
  expected: 0.54,
  weight_division_gap: 1,
});

/** The three shapes a flag-OFF match can arrive in (spec 14.7 P4). */
const VARIANTS: Record<string, Record<string, unknown>> = {
  missing: {},
  false: { requires_timekeeper: false },
  "present-false": {
    requires_timekeeper: false,
    tk_weight_check_required: false,
    result_recorded_by_admin: false,
    challenger_id: "opp-1",
    ended_at: null,
    final_elapsed_s: null,
    timekeeper_deadline_at: null,
    cancel_reason: null,
    result_edit_count: 0,
    result_edited_at: null,
    viewer_role: "opponent",
    timekeeper: null,
  },
};

interface Fixture {
  status: "pending" | "in_progress" | "completed";
  outcome?: Outcome;
  /**
   * Challenge-backed, as every mobile Arena match is. A completed one also
   * carries the stamped division gap on both participants.
   */
  challenge?: boolean;
  /** The server's `started_at`. Default 12 minutes before NOW: past the countdown. */
  startedAt?: string;
}

function row(fx: Fixture, extra: Record<string, unknown>) {
  const outcome = fx.outcome ?? null;
  const theirs = outcome === "win" ? "loss" : outcome === "loss" ? "win" : outcome;
  const gap = fx.challenge && outcome ? 1 : 0;
  return {
    id: "M1",
    challenge_id: fx.challenge ? "C1" : null,
    session_id: null,
    match_type: "ranked",
    duration_seconds: 300,
    status: fx.status,
    result: outcome === "draw" ? "draw" : outcome ? "submission" : null,
    started_at: fx.status === "pending" ? null : (fx.startedAt ?? "2026-09-25T12:00:00.000Z"),
    completed_at: outcome ? "2026-09-25T12:06:00.000Z" : null,
    paused_at: null,
    total_paused_duration: 0,
    timekeeper_id: null,
    participants: [
      participant("me-1", "Mina Park", outcome, 1512, 172.5, gap),
      participant("opp-1", "Demo Okafor", theirs, 1487, 171.4, gap),
    ],
    ...extra,
  };
}

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

type Screen = ReturnType<typeof render>;

async function mount(fx: Fixture, extra: Record<string, unknown>) {
  mockGetMatchDetails.mockResolvedValue(row(fx, extra));
  const screen = render(
    <MatchFlowWizard exitHref="/(app)/(tabs)/arena" exitLabel="Back to Arena" matchId="M1" currentAthleteId="me-1" />,
  );
  await flush();
  await flush();
  // A challenge-backed match settles in more hops: the rated weights, then
  // the weight checks, then the stakes priced on them.
  if (fx.challenge) {
    await flush();
    await flush();
  }
  return screen;
}

async function press(screen: Screen, testID: string) {
  await act(async () => {
    fireEvent.press(screen.getByTestId(testID));
  });
  await flush();
}

/** "Confirm N lbs" on the weigh-in. */
const weighIn = (screen: Screen) => press(screen, "weight-confirm");

/** Weigh in, then Confirm the opponent's weigh-in (the check RPC replies `after`). */
function weighInAndConfirm(after: ChecksSpec) {
  return async (screen: Screen) => {
    mockCheckOpponentWeight.mockResolvedValue(checksReply(after));
    await weighIn(screen);
    await press(screen, "weight-check-confirm");
    await flush();
  };
}

async function endMatch() {
  act(() => handlerOf("onMatchEnded")());
  await tick(OPPONENT_ENDED_INTERSTITIAL_MS);
}

async function toResult() {
  await endMatch();
  await tick(800);
}

function bothConfirmed() {
  mockGetMatchConfirmations.mockResolvedValue(["me-1", "opp-1"]);
}

interface Case {
  fixture: Fixture;
  /** The step the screen is on. */
  step: string;
  /** Data-layer replies for this case, set before every capture. */
  setup?: () => void;
  /** From the mounted wizard to the screen, the way the athlete (or the DB) gets there. */
  drive?: (screen: Screen) => Promise<void>;
  /** What must be on screen, so a capture cannot pass on a half-settled tree. */
  shows?: (screen: Screen) => void;
}

const RATED_PAIR = (s: Screen) => {
  // The fight card (weigh-in) or the chip (ready, countdown) shows the
  // challenge's weights, not the profile ones.
  expect(s.queryAllByText(/170\.2/).length).toBeGreaterThan(0);
  expect(s.queryAllByText(/172\.5/)).toHaveLength(0);
};

const CASES: Record<string, Case> = {
  // Challenge-free (`challenge_id: null`): the original seven.
  weight: { fixture: { status: "pending" }, step: "weight" },
  ready: { fixture: { status: "pending" }, step: "ready", drive: weighIn },
  live: { fixture: { status: "in_progress" }, step: "live" },
  end: { fixture: { status: "in_progress" }, step: "end", drive: endMatch },
  result: { fixture: { status: "in_progress" }, step: "result", drive: toResult },
  confirm: { fixture: { status: "completed", outcome: "win" }, step: "confirm" },
  summary: { fixture: { status: "completed", outcome: "win" }, step: "summary", setup: bothConfirmed },
  // The 3-2-1 on profile weights (no challenge to rate on).
  countdown: {
    fixture: { status: "in_progress", startedAt: ONE_SECOND_AGO },
    step: "live",
    shows: (s) => {
      s.getByTestId("match-countdown");
      expect(s.getByTestId("countdown-numeral")).toHaveTextContent("2");
    },
  },

  // Challenge-backed: what every mobile Arena match renders.
  "challenge: weight, no stakes (V9)": {
    fixture: { status: "pending", challenge: true },
    step: "weight",
    shows: (s) => {
      RATED_PAIR(s);
      expect(s.getByTestId("faceoff-my-weight")).toHaveTextContent("170.2 LBS");
      expect(s.getByTestId("faceoff-opponent-weight")).toHaveTextContent("168 LBS");
      expect(s.queryByTestId("weight-stakes")).toBeNull();
      s.getByTestId("weight-confirm");
    },
  },
  "challenge: weight, stakes": {
    fixture: { status: "pending", challenge: true },
    step: "weight",
    setup: () => mockGetRatingStakes.mockResolvedValue(STAKES),
    shows: (s) => {
      RATED_PAIR(s);
      s.getByTestId("weight-stakes");
      s.getByTestId("weight-gap-note");
    },
  },
  "challenge: weight, my check pending": {
    fixture: { status: "pending", challenge: true },
    step: "weight",
    drive: weighIn,
    shows: (s) => {
      s.getByTestId("faceoff-weight-check-plate");
      s.getByTestId("weight-check-confirm");
      expect(s.queryByTestId("weight-confirm")).toBeNull();
    },
  },
  "challenge: ready": {
    fixture: { status: "pending", challenge: true },
    step: "ready",
    drive: weighInAndConfirm({ mine: "confirmed" }),
    shows: (s) => {
      RATED_PAIR(s);
      expect(s.queryByTestId("ready-weight-hold")).toBeNull();
      expect(s.getByTestId("ready-button").props.accessibilityState?.disabled).toBeFalsy();
    },
  },
  "challenge: ready, waiting for their check": {
    fixture: { status: "pending", challenge: true },
    step: "ready",
    setup: () => mockGetMatchWeightChecks.mockResolvedValue(checksReply({ required: true })),
    drive: weighInAndConfirm({ required: true, mine: "confirmed" }),
    shows: (s) => {
      s.getByTestId("ready-weight-hold");
      s.getByText("WAITING FOR WEIGHT CHECKS");
    },
  },
  "challenge: ready, on hold (they flagged me)": {
    fixture: { status: "pending", challenge: true },
    step: "ready",
    setup: () => mockGetMatchWeightChecks.mockResolvedValue(checksReply({ theirs: "flagged" })),
    drive: weighInAndConfirm({ mine: "confirmed", theirs: "flagged" }),
    shows: (s) => {
      s.getByTestId("ready-weight-hold");
      s.getByText("MATCH ON HOLD · WEIGHT CHECK");
      s.getByTestId("weight-reweigh");
    },
  },
  "challenge: countdown": {
    fixture: { status: "in_progress", challenge: true, startedAt: ONE_SECOND_AGO },
    step: "live",
    shows: (s) => {
      s.getByTestId("match-countdown");
      expect(s.getByTestId("countdown-numeral")).toHaveTextContent("2");
      RATED_PAIR(s);
    },
  },
  "challenge: live": { fixture: { status: "in_progress", challenge: true }, step: "live" },
  "challenge: end": { fixture: { status: "in_progress", challenge: true }, step: "end", drive: endMatch },
  "challenge: result": { fixture: { status: "in_progress", challenge: true }, step: "result", drive: toResult },
  "challenge: confirm, win": { fixture: { status: "completed", outcome: "win", challenge: true }, step: "confirm" },
  "challenge: confirm, loss": { fixture: { status: "completed", outcome: "loss", challenge: true }, step: "confirm" },
  "challenge: confirm, draw": { fixture: { status: "completed", outcome: "draw", challenge: true }, step: "confirm" },
  "challenge: summary, win": {
    fixture: { status: "completed", outcome: "win", challenge: true },
    step: "summary",
    setup: bothConfirmed,
    shows: (s) => s.getByText("YOU WON"),
  },
  "challenge: summary, loss": {
    fixture: { status: "completed", outcome: "loss", challenge: true },
    step: "summary",
    setup: bothConfirmed,
    shows: (s) => s.getByText("YOU LOST"),
  },
  "challenge: summary, draw": {
    fixture: { status: "completed", outcome: "draw", challenge: true },
    step: "summary",
    setup: bothConfirmed,
    shows: (s) => s.getByText("DRAW"),
  },
};

// ---- serializing ----

/**
 * Accepted diff (b), PR3: the countdown caption became one prop string, so
 * its Mono holds one text child where f88a9920's JSX held these three
 * adjacent ones. Only this exact triple is joined; any other split text
 * stays as it is.
 */
const SPLIT_COUNTDOWN_CAPTION = ["SYNCED TO SERVER CLOCK ", "·", " BOTH PHONES"];

function isSplitCountdownCaption(node: unknown[]): boolean {
  return node.length === SPLIT_COUNTDOWN_CAPTION.length && node.every((c, i) => c === SPLIT_COUNTDOWN_CAPTION[i]);
}

/** Sorted keys and no function identities, so only rendered output counts. */
function normalize(node: unknown): unknown {
  if (typeof node === "function") return "[Function]";
  if (Array.isArray(node)) {
    if (isSplitCountdownCaption(node)) return [SPLIT_COUNTDOWN_CAPTION.join("")];
    return node.map(normalize);
  }
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(node).sort()) out[key] = normalize((node as Record<string, unknown>)[key]);
    return out;
  }
  return node;
}

function serialize(screen: Screen): string {
  return (
    JSON.stringify(normalize(screen.toJSON()), null, 1)
      // Accepted diff (a), PR1: the dev-only marker's index ("of 8" to "of 7").
      .replace(/Step \d+ of \d+, /g, "Step N of T, ")
      // NativeWind's interop numbers its pressables with one global counter.
      .replace(/"nativeID": "\d+"/g, '"nativeID": "#"')
  );
}

function resetModuleState() {
  mockSyncCalls.length = 0;
  mockGetMatchConfirmations.mockResolvedValue([]);
  // A null get_rating_stakes response: the face-off shows no stakes strip.
  mockGetRatingStakes.mockResolvedValue(null);
  mockGetMatchChallengeWeights.mockResolvedValue(CHALLENGE_WEIGHTS);
  mockGetMatchWeightChecks.mockResolvedValue(checksReply());
  mockCheckOpponentWeight.mockResolvedValue(checksReply());
  __resetPlayedMomentsForTests();
  __resetFreshForTests();
  __resetHeaderEloForTests();
  __resetStripSuppressionsForTests();
}

async function capture(name: string, extra: Record<string, unknown>): Promise<string> {
  const c = CASES[name];
  resetModuleState();
  c.setup?.();
  const screen = await mount(c.fixture, extra);
  if (c.drive) await c.drive(screen);
  screen.getByTestId(`match-step-${c.step}`);
  c.shows?.(screen);
  const out = serialize(screen);
  screen.unmount();
  return out;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  jest.clearAllMocks();
  jest.spyOn(AppState, "addEventListener").mockImplementation((() => ({ remove: jest.fn() })) as never);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("flag-OFF golden output: identical whatever the timekeeper keys say", () => {
  it.each(Object.keys(CASES))("%s", async (name) => {
    const [missing, falseOnly, presentFalse] = [
      await capture(name, VARIANTS.missing),
      await capture(name, VARIANTS.false),
      await capture(name, VARIANTS["present-false"]),
    ];
    expect(falseOnly).toBe(missing);
    expect(presentFalse).toBe(missing);
    expect(missing).toMatchSnapshot();
  });

  it("the challenge-backed cases read the challenge, the checks and the stakes", async () => {
    // Guards the fixture itself: without these reads the challenge cases
    // would silently pin the challenge-free screens again.
    await capture("challenge: weight, stakes", VARIANTS.missing);
    expect(mockGetMatchChallengeWeights).toHaveBeenCalledWith(expect.anything(), "C1");
    expect(mockGetMatchWeightChecks).toHaveBeenCalledWith(expect.anything(), "M1");
    // Rating V9: against the opponent's id, priced on this match's challenge weights.
    expect(mockGetRatingStakes).toHaveBeenCalledWith(expect.anything(), "opp-1", "M1");
  });
});

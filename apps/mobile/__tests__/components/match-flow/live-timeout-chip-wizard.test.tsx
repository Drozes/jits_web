/**
 * TK-D9 on the live screen, through the real wizard (jits-o47s.29 item 1;
 * spec 4.3 "while paused, all three see TK-D9", 14.8 M4 "TK-D9 countdown for
 * athletes"; TEST-PLAN faceoff-timeout-chip "and during a pause"): the step
 * renderer passes no `renderTimeoutChip`, so `LiveStep`'s default (M3's chip,
 * `liveTimeoutChip`) draws `NO CONTEST IN {m:ss}` to the state's `timeout_at`:
 *  - a paused timekeeper-mode match: the timekeeper and both athletes;
 *  - an athlete whose timekeeper is offline, clock running: TK-D7 with the
 *    chip inside it;
 *  - a running match with the timekeeper online, and a two-athlete match:
 *    no countdown.
 * The chip sits over the camera on the on-media ground in both app themes.
 *
 * The real wizard, reconciler, step renderer and live step (the
 * `timekeeper-rated-weights-render.test.tsx` harness); only the data layer,
 * the realtime hook, the recorder, the timer and the native modules are
 * stubbed.
 */
import * as React from "react";
import { AppState } from "react-native";
import { act, render, within } from "@testing-library/react-native";

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
let mockScheme: "light" | "dark" = "dark";
jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ textPrimary: "#fff", textSecondary: "#aaa", statePositive: "#0f0" }),
  useResolvedColorScheme: () => mockScheme,
}));
jest.mock("@/lib/supabase/client", () => ({
  supabase: {
    channel: () => {
      const chan: Record<string, unknown> = {};
      chan.on = () => chan;
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
jest.mock("expo-router", () => ({ useRouter: () => ({ dismissTo: jest.fn(), push: jest.fn(), back: jest.fn() }) }));
let mockViewer = "tk-1";
jest.mock("@/lib/auth/hooks", () => ({ useAuth: () => ({ athlete: { id: mockViewer } }) }));
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
// The clock as the match row has it: paused while `paused_at` is set.
jest.mock("@jits/shared/hooks/use-session-match-timer", () => ({
  useSessionMatchTimer: (p: { pausedAt: string | null }) => ({
    formatted: "03:00",
    remaining: 180,
    paused: p.pausedAt != null,
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
jest.mock("@jits/shared/api/match-weights", () => ({
  ...jest.requireActual("@jits/shared/api/match-weights"),
  getMatchChallengeWeights: async () => ({ challengerId: "opp-1", opponentId: "me-1", challengerWeight: 168, opponentWeight: 170.2 }),
}));
jest.mock("@jits/shared/api/match-weight-checks", () => ({
  ...jest.requireActual("@jits/shared/api/match-weight-checks"),
  getMatchWeightChecks: async () => ({ ok: false, error: { code: "UNKNOWN", message: "n/a" } }),
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
const mockGetTkState = jest.fn();
jest.mock("@jits/shared/api/timekeeper", () => ({
  ...jest.requireActual("@jits/shared/api/timekeeper"),
  getTimekeeperMatchState: (...a: unknown[]) => mockGetTkState(...a),
}));
const mockBroadcast = new Proxy({}, { get: () => () => Promise.resolve("ok") });
jest.mock("@jits/shared/hooks/use-session-match-sync", () => ({ useSessionMatchSync: () => mockBroadcast }));

import { MatchFlowWizard } from "@/components/match-flow/match-flow-wizard";
import { parseTimekeeperMatchState } from "@jits/shared/api/timekeeper";
import { ON_MEDIA } from "@/lib/theme/palette";
import { __resetFreshForTests, __resetPlayedMomentsForTests } from "@/components/ui/elo-system/play-once";
import { __resetHeaderEloForTests } from "@/lib/rating/header-elo";
import { __resetStripSuppressionsForTests } from "@/lib/video/upload-strip-visibility";
import { __resetAiConsentForTests } from "@/lib/moderation/ai-consent";

// ---- fixtures ----

const NOW = new Date("2026-09-25T12:12:00.000Z");
/** 8:30 from NOW: the pause (or offline) timeout the state names. */
const TIMEOUT_AT = "2026-09-25T12:20:30.000Z";

function participant(id: string, name: string) {
  return {
    athlete_id: id,
    display_name: name,
    current_elo: 1500,
    current_weight: 170,
    profile_photo_url: null,
    role: "competitor",
    outcome: null,
    elo_before: null,
    elo_after: null,
    elo_delta: 0,
    weight_division_gap: 0,
  };
}

/** A running (or paused) match, started well before NOW (past the 3-2-1). */
function liveMatch({ timekeeperMode = true, pausedAt = null as string | null } = {}) {
  return {
    id: "M1",
    challenge_id: "C1",
    session_id: null,
    match_type: "ranked",
    duration_seconds: 600,
    status: "in_progress",
    result: null,
    started_at: "2026-09-25T12:00:00.000Z",
    completed_at: null,
    paused_at: pausedAt,
    total_paused_duration: 0,
    participants: [participant("me-1", "Mina Park"), participant("opp-1", "Demo Okafor")],
    challenger_id: "opp-1",
    ended_at: null,
    final_elapsed_s: null,
    result_edit_count: 0,
    ...(timekeeperMode
      ? {
          requires_timekeeper: true,
          tk_weight_check_required: true,
          timekeeper_id: "tk-1",
          timekeeper: { id: "tk-1", display_name: "Jo Cruz", profile_photo_url: null },
        }
      : {}),
  };
}

function statePayload({ presence = "online", timeoutAt = TIMEOUT_AT }: { presence?: "online" | "offline"; timeoutAt?: string | null } = {}) {
  return {
    ok: true,
    ready: [],
    athlete_checks: [],
    timekeeper_checks: [],
    open_request: null,
    last_request_outcome: null,
    presence,
    offline_since: presence === "offline" ? "2026-09-25T12:10:00.000Z" : null,
    no_contest_at: presence === "offline" ? timeoutAt : null,
    review_pending: false,
    timeout_at: timeoutAt,
    weights: [
      { athlete_id: "opp-1", weight: 168 },
      { athlete_id: "me-1", weight: 170.2 },
    ],
    edit_open: false,
    edit_closes_at: null,
    start_blockers: [],
  };
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

async function mount(viewer: string, match: object, payload = statePayload()) {
  mockViewer = viewer;
  __resetAiConsentForTests({ athleteId: viewer, consentAt: "2026-09-20T12:00:00Z", known: true });
  mockGetTkState.mockResolvedValue({ ok: true, data: parseTimekeeperMatchState(payload) });
  mockGetMatchDetails.mockResolvedValue(match);
  const screen = render(
    <MatchFlowWizard exitHref="/(app)/(tabs)/arena" exitLabel="Back to Arena" matchId="M1" currentAthleteId={viewer} />,
  );
  for (let i = 0; i < 6; i++) await flush();
  screen.getByTestId("match-step-live");
  return screen;
}

const chipText = (s: ReturnType<typeof render>) => s.getByTestId("timeout-chip-text").props.children;

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  jest.clearAllMocks();
  mockScheme = "dark";
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

describe("a paused timekeeper-mode match: all three phones count down to the no contest (TK-D9)", () => {
  for (const viewer of ["tk-1", "me-1", "opp-1"]) {
    it(`${viewer === "tk-1" ? "the timekeeper" : `athlete ${viewer}`}`, async () => {
      const s = await mount(viewer, liveMatch({ pausedAt: "2026-09-25T12:11:00.000Z" }));
      expect(s.getAllByTestId("timeout-chip")).toHaveLength(1);
      expect(chipText(s)).toBe("NO CONTEST IN 8:30");
      expect(s.getByTestId("timeout-chip").props.accessibilityLabel).toBe("Match ends as no contest in 8 minutes 30 seconds");
      // It counts down, read-only, from the server's instant.
      await act(async () => {
        jest.advanceTimersByTime(1_000);
      });
      expect(chipText(s)).toBe("NO CONTEST IN 8:29");
      // Paused with the timekeeper online: no offline banner.
      expect(s.queryByTestId("live-timekeeper-offline")).toBeNull();
      s.unmount();
    });
  }
});

describe("an athlete whose timekeeper is offline, clock running (TK-D7 with TK-D9)", () => {
  it("shows the countdown inside the offline banner", async () => {
    const s = await mount("me-1", liveMatch(), statePayload({ presence: "offline" }));
    const banner = s.getByTestId("live-timekeeper-offline");
    within(banner).getByText("J. CRUZ IS OFFLINE");
    expect(within(banner).getByTestId("timeout-chip-text").props.children).toBe("NO CONTEST IN 8:30");
    expect(s.getAllByTestId("timeout-chip")).toHaveLength(1);
    s.unmount();
  });

  it("the timekeeper's own phone never shows them offline, and a running clock shows no countdown", async () => {
    const s = await mount("tk-1", liveMatch(), statePayload({ presence: "offline" }));
    expect(s.queryByTestId("live-timekeeper-offline")).toBeNull();
    expect(s.queryByTestId("timeout-chip")).toBeNull();
    s.unmount();
  });
});

describe("no countdown", () => {
  it("while the clock runs and the timekeeper is online", async () => {
    for (const viewer of ["tk-1", "me-1"]) {
      const s = await mount(viewer, liveMatch());
      expect(s.queryByTestId("timeout-chip")).toBeNull();
      s.unmount();
    }
  });

  it("in a two-athlete match, paused", async () => {
    const s = await mount("me-1", liveMatch({ timekeeperMode: false, pausedAt: "2026-09-25T12:11:00.000Z" }));
    expect(s.queryByTestId("timeout-chip")).toBeNull();
    expect(mockGetTkState).not.toHaveBeenCalled();
    s.unmount();
  });
});

describe("over the camera in both app themes", () => {
  it("the on-media amber on the on-media badge ground, light theme included", async () => {
    for (const scheme of ["dark", "light"] as const) {
      mockScheme = scheme;
      const s = await mount("me-1", liveMatch({ pausedAt: "2026-09-25T12:11:00.000Z" }));
      const chip = s.getByTestId("timeout-chip");
      expect([scheme, chip.props.style.backgroundColor, chip.props.style.borderColor]).toEqual([scheme, ON_MEDIA.badge, ON_MEDIA.amberRule]);
      const text = s.getByTestId("timeout-chip-text");
      expect(JSON.stringify(text.props.style)).toContain(ON_MEDIA.amber);
      s.unmount();
    }
  });
});

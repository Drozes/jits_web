/**
 * Flag-OFF golden test (timekeeper mode, TEST-PLAN 3.1 item 3, spec 14.7 P4).
 *
 * The real wizard, the real step renderer and the real steps render every
 * step of a two-athlete (self-run) match three times: with the match payload
 * as an older backend sends it (no `requires_timekeeper`), with
 * `requires_timekeeper: false`, and with every timekeeper-mode key present at
 * its flag-OFF value (the backend after BE-G, for a flag-OFF match; the
 * challenger is the OTHER athlete there, so athlete order cannot leak into
 * the output either). All three trees must be identical, and equal to the
 * committed snapshot.
 *
 * The snapshot is the baseline. It was captured from a clean tree before the
 * roles refactor (PR2) touched any source, and the same test passes,
 * unchanged, against a clean export of origin/development f88a9920: the only
 * raw difference there is the step marker's index, which PR1 changed by
 * deleting the dead `wait` step. Only the slices that change flag-OFF output
 * by owner decision may re-capture it (M5 for A25, M6 for A11 and O1, M9 for
 * A21; ARCHITECTURE M-R5), each reviewed as exactly that change.
 *
 * Only the data layer, the realtime hook, the recorder and the native
 * modules are stubbed (the same set `wizard-reconcile.test.tsx` uses). The
 * dev-only step marker's "Step N of T" index is normalized: it is a harness
 * hook hidden in release builds, and the step count is not flag-OFF output
 * (the marker's step name stays in the tree).
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
jest.mock("@jits/shared/api/queries", () => ({
  getMatchDetails: (...a: unknown[]) => mockGetMatchDetails(...a),
  getMatchConfirmations: (...a: unknown[]) => mockGetMatchConfirmations(...a),
  getSubmissionTypes: async () => [],
  getEloStakes: async () => null,
  getMatchDetailView: async () => ({ ok: true, data: { videos: [] } }),
}));
jest.mock("@jits/shared/api/match-rank-change", () => ({
  getMatchRankChange: async () => ({ ok: false, error: { code: "UNKNOWN", message: "n/a" } }),
}));
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

// ---- fixtures ----

/** A fixed clock, so every time-derived line (dispute window, freshness) is stable. */
const NOW = new Date("2026-09-25T12:12:00.000Z");

function participant(id: string, name: string, outcome: string | null, elo: number, weight: number) {
  return {
    athlete_id: id,
    display_name: name,
    current_elo: elo,
    current_weight: weight,
    profile_photo_url: null,
    role: "competitor",
    outcome,
    elo_before: outcome ? elo : null,
    elo_after: outcome === "win" ? elo + 16 : outcome === "loss" ? elo - 16 : null,
    elo_delta: outcome === "win" ? 16 : outcome === "loss" ? -16 : 0,
    weight_division_gap: 0,
  };
}

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

function row(status: string, extra: Record<string, unknown>, outcome: "win" | "loss" | null = null) {
  const theirs = outcome === "win" ? "loss" : outcome === "loss" ? "win" : null;
  return {
    id: "M1",
    challenge_id: null,
    session_id: null,
    match_type: "ranked",
    duration_seconds: 300,
    status,
    result: outcome ? "submission" : null,
    started_at: status === "pending" ? null : "2026-09-25T12:00:00.000Z",
    completed_at: outcome ? "2026-09-25T12:06:00.000Z" : null,
    paused_at: null,
    total_paused_duration: 0,
    timekeeper_id: null,
    participants: [
      participant("me-1", "Mina Park", outcome, 1512, 172.5),
      participant("opp-1", "Demo Okafor", theirs, 1487, 171.4),
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

async function mount(status: string, extra: Record<string, unknown>, outcome: "win" | "loss" | null = null) {
  mockGetMatchDetails.mockResolvedValue(row(status, extra, outcome));
  const screen = render(
    <MatchFlowWizard exitHref="/(app)/(tabs)/arena" exitLabel="Back to Arena" matchId="M1" currentAthleteId="me-1" />,
  );
  await flush();
  await flush();
  return screen;
}

/** How to reach each step, the same way the athlete (or the DB) gets there. */
const STEPS: Record<string, (extra: Record<string, unknown>) => Promise<Screen>> = {
  weight: (extra) => mount("pending", extra),
  ready: async (extra) => {
    const screen = await mount("pending", extra);
    await act(async () => {
      fireEvent.press(screen.getByTestId("weight-confirm"));
    });
    await flush();
    return screen;
  },
  live: (extra) => mount("in_progress", extra),
  end: async (extra) => {
    const screen = await mount("in_progress", extra);
    act(() => handlerOf("onMatchEnded")());
    await tick(OPPONENT_ENDED_INTERSTITIAL_MS);
    return screen;
  },
  result: async (extra) => {
    const screen = await mount("in_progress", extra);
    act(() => handlerOf("onMatchEnded")());
    await tick(OPPONENT_ENDED_INTERSTITIAL_MS);
    await tick(800);
    return screen;
  },
  confirm: (extra) => mount("completed", extra, "win"),
  summary: async (extra) => {
    mockGetMatchConfirmations.mockResolvedValue(["me-1", "opp-1"]);
    return mount("completed", extra, "win");
  },
};

/** Sorted keys and no function identities, so only rendered output counts. */
function normalize(node: unknown): unknown {
  if (typeof node === "function") return "[Function]";
  if (Array.isArray(node)) return node.map(normalize);
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
      .replace(/Step \d+ of \d+, /g, "Step N of T, ")
      // NativeWind's interop numbers its pressables with one global counter.
      .replace(/"nativeID": "\d+"/g, '"nativeID": "#"')
  );
}

function resetModuleState() {
  mockSyncCalls.length = 0;
  mockGetMatchConfirmations.mockResolvedValue([]);
  __resetPlayedMomentsForTests();
  __resetFreshForTests();
  __resetHeaderEloForTests();
  __resetStripSuppressionsForTests();
}

async function capture(step: string, extra: Record<string, unknown>): Promise<string> {
  resetModuleState();
  const screen = await STEPS[step](extra);
  screen.getByTestId(`match-step-${step}`);
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
  it.each(Object.keys(STEPS))("%s", async (step) => {
    const [missing, falseOnly, presentFalse] = [
      await capture(step, VARIANTS.missing),
      await capture(step, VARIANTS.false),
      await capture(step, VARIANTS["present-false"]),
    ];
    expect(falseOnly).toBe(missing);
    expect(presentFalse).toBe(missing);
    expect(missing).toMatchSnapshot();
  });
});

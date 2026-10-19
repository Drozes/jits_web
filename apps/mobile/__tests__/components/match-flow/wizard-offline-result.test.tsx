/**
 * Wizard-level offline-queued result (timekeeper mode PR3 gap test; the
 * queued branch of `use-record-result.ts`). The real wizard, steps and
 * mutation queue; only the data layer, the realtime hook, the recorder and
 * NetInfo are stubbed. Offline, recording the result does not reach the
 * server: the queue keeps it, the athlete gets "Saved locally", the queued
 * banner shows, and the wizard moves on to confirm (a queued write is never
 * auto-confirmed). Back online, the queue replays the same write once and
 * the banner clears.
 */
import * as React from "react";
import { AppState } from "react-native";
import { act, fireEvent, render } from "@testing-library/react-native";

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
jest.mock("@/components/ui/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
jest.mock("expo-router", () => ({
  useRouter: () => ({ dismissTo: jest.fn(), push: jest.fn(), back: jest.fn() }),
}));
jest.mock("@/lib/auth/hooks", () => ({ useAuth: () => ({ athlete: { id: "me-1" } }) }));
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
const mockImpact = jest.fn((_s: unknown) => Promise.resolve());
jest.mock("expo-haptics", () => ({
  impactAsync: (s: unknown) => mockImpact(s),
  notificationAsync: () => Promise.resolve(),
  selectionAsync: () => Promise.resolve(),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
}));
jest.mock("@jits/shared/hooks/use-session-match-timer", () => ({
  useSessionMatchTimer: () => ({
    formatted: "05:00",
    remaining: 300,
    elapsed: 300,
    paused: false,
    running: true,
    syncFromBroadcast: jest.fn(),
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

// NetInfo, driven by the test: the real mutation queue listens to it.
let mockNetListener: ((s: { isConnected: boolean | null }) => void) | null = null;
jest.mock("@react-native-community/netinfo", () => {
  const NetInfo = {
    fetch: jest.fn(() => Promise.resolve({ type: "wifi", isConnected: true, isInternetReachable: true, details: null })),
    addEventListener: jest.fn((listener: (s: { isConnected: boolean | null }) => void) => {
      mockNetListener = listener;
      return () => undefined;
    }),
    useNetInfo: jest.fn(() => ({ type: "wifi", isConnected: true, isInternetReachable: true, details: null })),
  };
  return { __esModule: true, default: NetInfo, ...NetInfo };
});

// ---- data layer ----

const mockGetMatchDetails = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({
  getMatchDetails: (...a: unknown[]) => mockGetMatchDetails(...a),
  getMatchConfirmations: async () => [],
  getSubmissionTypes: async () => [],
  getEloStakes: async () => null,
  getMatchResultLockSeconds: async () => 86_400,
  getMatchDetailView: async () => ({ ok: true, data: { videos: [] } }),
}));
jest.mock("@jits/shared/api/match-rank-change", () => ({
  getMatchRankChange: async () => ({ ok: false, error: { code: "UNKNOWN", message: "n/a" } }),
}));
jest.mock("expo-image", () => ({ Image: () => null }));

const mockRecord = jest.fn();
jest.mock("@jits/shared/api/mutations", () => ({
  confirmMatchResult: async () => ({ ok: true, data: {} }),
  disputeMatchResult: jest.fn(),
  recordMatchResult: (...a: unknown[]) => mockRecord(...a),
  startMatch: jest.fn(),
  cancelSessionMatch: jest.fn(),
  pauseMatch: jest.fn(),
  resumeMatch: jest.fn(),
}));

// ---- realtime: capture each step's handlers ----

type Handlers = Record<string, ((...a: unknown[]) => void) | undefined>;
const mockSyncCalls: Handlers[] = [];
const mockBroadcast = {
  broadcastTimerStarted: jest.fn(() => Promise.resolve("ok")),
  broadcastReady: jest.fn(() => Promise.resolve("ok")),
  broadcastMatchCancelled: jest.fn(() => Promise.resolve("ok")),
  broadcastMatchEnded: jest.fn(() => Promise.resolve("ok")),
  broadcastTimerPaused: jest.fn(() => Promise.resolve("ok")),
  broadcastTimerResumed: jest.fn(() => Promise.resolve("ok")),
  broadcastResultSubmitted: jest.fn((_r: unknown) => Promise.resolve("ok")),
  broadcastResultConfirmed: jest.fn((_id: string) => Promise.resolve("ok")),
  broadcastMatchDisputed: jest.fn(() => Promise.resolve("ok")),
  broadcastWeighedIn: jest.fn(() => Promise.resolve("ok")),
  broadcastRecordingOptIn: jest.fn(() => Promise.resolve("ok")),
  broadcastResultClaimed: jest.fn(() => Promise.resolve("ok")),
};
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
import { toast } from "@/components/ui/toast";
import { mutationQueue } from "@/lib/network/mutation-queue";
import { OPPONENT_ENDED_INTERSTITIAL_MS } from "@/lib/match-flow/live-view-state";

// ---- fixtures ----

function participant(id: string, name: string) {
  return {
    athlete_id: id,
    display_name: name,
    current_elo: 1200,
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

const IN_PROGRESS = {
  id: "M1",
  challenge_id: null,
  session_id: null,
  match_type: "ranked",
  duration_seconds: 600,
  status: "in_progress",
  result: null,
  started_at: "2026-10-19T12:00:00.000Z",
  completed_at: null,
  paused_at: null,
  total_paused_duration: 0,
  timekeeper_id: null,
  participants: [participant("me-1", "Kai Reyes"), participant("opp-1", "Mina Park")],
};

const QUEUED_BANNER = "Saved locally. Will sync when you're back online.";

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

function setConnected(isConnected: boolean) {
  act(() => mockNetListener?.({ isConnected }));
}

beforeAll(async () => {
  // The queue subscribes to NetInfo on its first write; make that write now
  // (online, so it runs at once) so the test can take the phone offline.
  await mutationQueue.enqueue("test:subscribe", async () => ({ ok: true as const, data: null }));
});

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockSyncCalls.length = 0;
  jest.spyOn(AppState, "addEventListener").mockImplementation((() => ({ remove: jest.fn() })) as never);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  mockGetMatchDetails.mockResolvedValue(IN_PROGRESS);
  mockRecord.mockResolvedValue({ ok: true, data: { recorder_confirmed: true } });
});

afterEach(() => {
  setConnected(true);
  mutationQueue.clear();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

/** Mount live, let the opponent end it, and land on the result step. */
async function onResultStep() {
  const screen = render(
    <MatchFlowWizard exitHref="/(app)/(tabs)/arena" exitLabel="Back to Arena" matchId="M1" currentAthleteId="me-1" />,
  );
  await flush();
  await flush();
  screen.getByTestId("live-broadcast");
  act(() => handlerOf("onMatchEnded")());
  await tick(OPPONENT_ENDED_INTERSTITIAL_MS); // the ended plate
  await tick(800); // the END step's beat
  screen.getByTestId("match-step-result");
  return screen;
}

it("offline: Saved locally, the queued banner, and on to confirm without reaching the server", async () => {
  const screen = await onResultStep();
  setConnected(false);

  fireEvent.press(screen.getByTestId("result-outcome-draw"));
  await act(async () => {
    fireEvent.press(screen.getByTestId("result-record"));
  });
  await flush();

  expect(mockRecord).not.toHaveBeenCalled();
  expect(toast.success).toHaveBeenCalledWith({
    text1: "Saved locally",
    description: "Result will sync when you're back online.",
  });
  // A queued write gets the light acknowledgement, never the recorded one.
  expect(mockImpact).toHaveBeenCalledWith("light");
  // Not recorded yet, so never auto-confirmed: the athlete confirms next.
  screen.getByTestId("match-step-confirm");
  screen.getByText(QUEUED_BANNER);
  expect(mutationQueue.size()).toBe(1);
  // The opponent still hears the result; nothing claims this side confirmed.
  expect(mockBroadcast.broadcastResultSubmitted).toHaveBeenCalledWith(expect.objectContaining({ result: "draw" }));
  expect(mockBroadcast.broadcastResultConfirmed).not.toHaveBeenCalled();
});

it("back online: the queue replays the same write once and the banner clears", async () => {
  const screen = await onResultStep();
  setConnected(false);
  fireEvent.press(screen.getByTestId("result-outcome-draw"));
  await act(async () => {
    fireEvent.press(screen.getByTestId("result-record"));
  });
  await flush();
  screen.getByText(QUEUED_BANNER);

  setConnected(true);
  await flush();

  expect(mockRecord).toHaveBeenCalledTimes(1);
  expect(mockRecord).toHaveBeenCalledWith(expect.anything(), {
    matchId: "M1",
    result: "draw",
    winnerId: undefined,
    submissionTypeCode: undefined,
    finishTimeSeconds: undefined,
  });
  expect(mutationQueue.size()).toBe(0);
  expect(screen.queryByText(QUEUED_BANNER)).toBeNull();
  // The wizard does not move back for the replay.
  screen.getByTestId("match-step-confirm");
});

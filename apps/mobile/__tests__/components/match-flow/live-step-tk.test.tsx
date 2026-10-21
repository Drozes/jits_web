/**
 * The live step in timekeeper mode (slice M4, TEST-PLAN 3.2; spec 4.2 Live
 * and End, 4.3), on the real step with the real match timer: controls per
 * role, TK-L1 and TK-L2, the end via `end_match_clock` and then the
 * `match_ended` broadcast with `actor_id`, the ended-by name, every received
 * clock event only re-reading (M-R8; an athlete freezes on the ended plate
 * only for the seated timekeeper's end, and the timekeeper never freezes on a
 * received one), the timekeeper's Leave while the clock
 * runs (TK-K16) and no Leave after the end, the camera banner (TK-L3, TK-L4)
 * in place of the shipped no-video plate, the athletes' offline banner
 * (TK-D7) and the TK-D9 countdown placed while paused or offline (also
 * through `LiveStage`, as the renderer mounts it), a broadcast freeze the DB
 * confirms or undoes, an athlete's ended plate on the read that shows the end
 * (with or without a broadcast first) on the server's final clock, and the
 * end haptic only on a confirmed end.
 *
 * The seams come in as `stepSeams` builds them; the wizard's sync context is
 * the timekeeper-mode one (`timekeeperModeSelfId`), so the step channel
 * names this phone on its sends.
 */
import * as React from "react";
import { Alert, Text } from "react-native";
import { act, fireEvent, render, within } from "@testing-library/react-native";
import { completeHold } from "../../support/complete-hold";

jest.mock("@/lib/supabase/client", () => ({ supabase: { tag: "client" } }));
const mockPauseMatch = jest.fn();
const mockResumeMatch = jest.fn();
jest.mock("@jits/shared/api/mutations", () => ({
  pauseMatch: (...a: unknown[]) => mockPauseMatch(...a),
  resumeMatch: (...a: unknown[]) => mockResumeMatch(...a),
}));
jest.mock("@jits/shared/api/queries", () => ({ getMatchDetails: jest.fn() }));
const mockEndMatchClock = jest.fn();
const mockLeave = jest.fn();
jest.mock("@jits/shared/api/timekeeper", () => ({
  endMatchClock: (...a: unknown[]) => mockEndMatchClock(...a),
  leaveMatchAsTimekeeper: (...a: unknown[]) => mockLeave(...a),
}));

/** Every RPC and send, in order, to prove the end goes to the server before the broadcast. */
const mockLog: string[] = [];
interface Handlers {
  onTimerPaused?: (pausedAt: string, actorId?: string) => void;
  onTimerResumed?: (total: number, actorId?: string) => void;
  onMatchEnded?: (actorId?: string) => void;
  onMatchCancelled?: (actorId?: string) => void;
}
const mockSyncParams: { current: Handlers | null } = { current: null };
const send = (name: string) =>
  jest.fn((...a: unknown[]) => {
    mockLog.push(`${name}(${a.map((x) => JSON.stringify(x)).join(",")})`);
    return Promise.resolve("ok");
  });
const mockSends = {
  broadcastMatchEnded: send("broadcastMatchEnded"),
  broadcastTimerPaused: send("broadcastTimerPaused"),
  broadcastTimerResumed: send("broadcastTimerResumed"),
  broadcastMatchCancelled: send("broadcastMatchCancelled"),
};
jest.mock("@jits/shared/hooks/use-session-match-sync", () => ({
  useSessionMatchSync: (params: Handlers) => {
    mockSyncParams.current = params;
    return mockSends;
  },
}));
const mockMatchEnd = jest.fn(() => Promise.resolve());
jest.mock("@/lib/match-flow/use-haptics", () => ({
  matchHaptics: {
    matchStart: () => Promise.resolve(),
    matchEnd: () => mockMatchEnd(),
    timeWarning: () => Promise.resolve(),
  },
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/components/ui/toast", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ textPrimary: "#E8EDF2", textOnAccent: "#0D0F14", accentCta: "#E63946" }),
  useResolvedColorScheme: () => "dark",
}));
jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  const stub = () => R.createElement(RN.View, { testID: "icon" });
  return new Proxy({}, { get: (_t: Record<string, unknown>, prop: string) => (prop === "__esModule" ? true : stub) });
});

import { LiveStep, type LiveStepProps } from "@/components/match-flow/steps/live-step";
import { LiveStage } from "@/components/match-flow/countdown/live-stage";
import { COUNTDOWN_MS } from "@/components/match-flow/countdown/countdown";
import { MAX_AUTO_END_ATTEMPTS } from "@/lib/match-flow/use-live-controls";
import { MatchSyncProvider } from "@/lib/match-flow/match-sync-context";
import { OPPONENT_ENDED_INTERSTITIAL_MS } from "@/lib/match-flow/live-view-state";
import { AUTO_END_DELAY_MS } from "@/lib/video/recording-limits";
import type { LiveTimekeeperSeam } from "@/lib/match-flow/step-seams";
import type { UseVideoRecorderReturn } from "@/lib/video/use-video-recorder";
import type { MatchDetails } from "@jits/shared/api/queries";

const NOW = Date.parse("2026-10-20T12:00:00.000Z");
const DURATION = 300;
const TIMEOUT_AT = new Date(NOW + 9 * 60_000).toISOString();
const ENDED_AT = new Date(NOW).toISOString();
const mockReconcile = jest.fn();
/** The wizard's reconciler snapshots, as `subscribeSnapshot` hands them to the step (before the wizard acts on them). */
const snapshotListeners = new Set<(m: MatchDetails) => void>();
function emitSnapshot(m: Partial<MatchDetails>) {
  const match = { paused_at: null, total_paused_duration: 0, ...m } as MatchDetails;
  act(() => {
    for (const l of [...snapshotListeners]) l(match);
  });
}

/** The timekeeper's seam (`stepSeams` for the timekeeper). */
const TK_SEAM: LiveTimekeeperSeam = { id: "tk-1", name: "J. Cruz", canLeave: true, offline: false, timeoutAt: null };
/** An athlete's seam (`stepSeams` for either athlete). */
const ATHLETE_SEAM: LiveTimekeeperSeam = { id: "tk-1", name: "J. Cruz", canLeave: false, offline: false, timeoutAt: null };

function makeRecorder(state = "idle", permission = { granted: true, canAskAgain: true }) {
  return {
    state,
    error: null,
    requestPermission: jest.fn(() => Promise.resolve()),
    permission,
    start: jest.fn(() => Promise.resolve()),
    stop: jest.fn(() => Promise.resolve()),
  } as unknown as UseVideoRecorderReturn & { start: jest.Mock; stop: jest.Mock };
}

interface Opts {
  remaining?: number;
  paused?: boolean;
  /** The sync context's `timekeeperModeSelfId`; null for a two-athlete match. */
  selfId?: string | null;
  recorderState?: string;
  permission?: { granted: boolean; canAskAgain: boolean };
  props?: Partial<LiveStepProps>;
}

/** The wizard's sync context; `selfId` null for a two-athlete match. */
function syncValue(selfId: string | null | undefined) {
  return {
    onChannelStatus: jest.fn(),
    reconcileNow: mockReconcile,
    markExiting: jest.fn(),
    subscribeSnapshot: (l: (m: MatchDetails) => void) => {
      snapshotListeners.add(l);
      return () => {
        snapshotListeners.delete(l);
      };
    },
    noteCancelActor: jest.fn(),
    ...(selfId === null ? {} : { timekeeperModeSelfId: selfId ?? "tk-1" }),
  };
}

function renderLive(o: Opts = {}) {
  const remaining = o.remaining ?? 200;
  const recorder = makeRecorder(o.recorderState, o.permission);
  const onEnded = jest.fn();
  const startedAt = new Date(NOW - (DURATION - remaining) * 1000).toISOString();
  const value = syncValue(o.selfId);
  const element = (extra: Partial<LiveStepProps> = {}) => (
    <MatchSyncProvider value={value}>
      <LiveStep
        matchId="M1"
        me={{ displayName: "Marcus Reyes", currentElo: 1512, weightLbs: 170 }}
        opponent={{ displayName: "Dana Okafor", currentElo: 1487, weightLbs: 168 }}
        durationSeconds={DURATION}
        startedAt={startedAt}
        pausedAt={o.paused ? new Date(NOW).toISOString() : null}
        totalPausedDuration={0}
        recorder={recorder}
        onEnded={(s: number) => onEnded(s)}
        {...o.props}
        {...extra}
      />
    </MatchSyncProvider>
  );
  const utils = render(element());
  return { ...utils, recorder, onEnded, rerenderWith: (extra: Partial<LiveStepProps>) => utils.rerender(element(extra)) };
}

/** The timekeeper's live screen, as the renderer mounts it. */
const asTimekeeper = (o: Opts = {}) =>
  renderLive({ ...o, props: { controls: "full", endVia: "end_match_clock", timekeeper: TK_SEAM, ...o.props } });

/** An athlete's live screen in timekeeper mode, as the renderer mounts it. */
const asAthlete = (o: Opts = {}) =>
  renderLive({
    selfId: "a-1",
    ...o,
    props: { controls: "none", endVia: null, endedByName: "J. Cruz", timekeeper: ATHLETE_SEAM, ...o.props },
  });

async function flush() {
  await act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });
}

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
  await flush();
}

const chip = (timeoutAt: string) => <Text testID="tk-d9">{`chip ${timeoutAt}`}</Text>;

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  jest.clearAllMocks();
  mockLog.length = 0;
  mockSyncParams.current = null;
  snapshotListeners.clear();
  mockEndMatchClock.mockImplementation(async (...a: unknown[]) => {
    mockLog.push(`end_match_clock(${JSON.stringify(a[1])},${JSON.stringify(a[2])})`);
    return { ok: true, data: { endedAt: new Date(NOW).toISOString(), finalElapsedS: a[2] } };
  });
  mockLeave.mockResolvedValue({ ok: true, data: { status: "cancelled" } });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("the timekeeper runs the clock", () => {
  it("has the controls, the TK-L1 kicker and Leave; no TK-L2 strip", () => {
    const s = asTimekeeper();
    s.getByTestId("live-pause-toggle");
    s.getByTestId("live-end");
    expect(s.getByTestId("live-timekeeper-kicker")).toHaveTextContent("YOU RUN THE CLOCK");
    expect(s.getByTestId("live-timekeeper-leave").props.accessibilityLabel).toBe("Leave");
    expect(s.queryByTestId("live-clock-runner")).toBeNull();
  });

  it("ends with end_match_clock first, then match_ended naming the timekeeper, then the result", async () => {
    const s = asTimekeeper({ remaining: 200 });
    await act(async () => completeHold(s.getByTestId("live-end")));
    await flush();
    expect(mockEndMatchClock).toHaveBeenCalledWith({ tag: "client" }, "M1", 100);
    expect(mockLog).toEqual(['end_match_clock("M1",100)', 'broadcastMatchEnded("tk-1")']);
    expect(s.onEnded).toHaveBeenCalledWith(100);
    expect(s.recorder.stop).toHaveBeenCalledTimes(1);
  });

  it("a refusal that the clock is not running (the server's auto-end, a no contest) re-reads and never broadcasts", async () => {
    mockEndMatchClock.mockResolvedValue({ ok: false, error: { code: "MATCH_NOT_LIVE", message: "x" } });
    const s = asTimekeeper();
    await act(async () => completeHold(s.getByTestId("live-end")));
    await flush();
    expect(mockSends.broadcastMatchEnded).not.toHaveBeenCalled();
    expect(s.onEnded).not.toHaveBeenCalled();
    expect(mockReconcile).toHaveBeenCalled();
    // The DB moves the screen; the controls stay ended meanwhile.
    expect(s.getByTestId("live-end")).toHaveTextContent("ENDING");
  });

  it("a failure that changed nothing offers the hold again", async () => {
    mockEndMatchClock.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "offline" } });
    const s = asTimekeeper();
    await act(async () => completeHold(s.getByTestId("live-end")));
    await flush();
    expect(mockSends.broadcastMatchEnded).not.toHaveBeenCalled();
    expect(s.onEnded).not.toHaveBeenCalled();
    expect(mockReconcile).toHaveBeenCalled();
    expect(s.getByTestId("live-end").props.accessibilityState).toEqual(expect.objectContaining({ disabled: false }));
    mockEndMatchClock.mockImplementation(async () => ({ ok: true, data: { endedAt: "x", finalElapsedS: 100 } }));
    await act(async () => completeHold(s.getByTestId("live-end")));
    await flush();
    expect(s.onEnded).toHaveBeenCalledTimes(1);
  });

  it("auto-ends at 00:00 through end_match_clock", async () => {
    const s = asTimekeeper({ remaining: 0 });
    await advance(AUTO_END_DELAY_MS + 100);
    expect(mockEndMatchClock).toHaveBeenCalledWith({ tag: "client" }, "M1", DURATION);
    expect(mockSends.broadcastMatchEnded).toHaveBeenCalledWith("tk-1");
    expect(s.onEnded).toHaveBeenCalledWith(DURATION);
  });

  it("the hold buzzes only once the server has ended the clock, never at the hold's completion", async () => {
    let answer!: (v: unknown) => void;
    mockEndMatchClock.mockImplementationOnce(() => new Promise((r) => (answer = r)));
    const s = asTimekeeper({ remaining: 200 });
    await act(async () => completeHold(s.getByTestId("live-end")));
    await flush();
    expect(mockEndMatchClock).toHaveBeenCalledTimes(1);
    expect(mockMatchEnd).not.toHaveBeenCalled();
    await act(async () => answer({ ok: true, data: { endedAt: ENDED_AT, finalElapsedS: 100 } }));
    await flush();
    expect(mockMatchEnd).toHaveBeenCalledTimes(1);
    expect(s.onEnded).toHaveBeenCalledWith(100);
  });

  it("a failed server end never buzzed; the retry that ends it buzzes once", async () => {
    mockEndMatchClock.mockResolvedValueOnce({ ok: false, error: { code: "UNKNOWN", message: "offline" } });
    const s = asTimekeeper();
    await act(async () => completeHold(s.getByTestId("live-end")));
    await flush();
    expect(mockMatchEnd).not.toHaveBeenCalled();
    await act(async () => completeHold(s.getByTestId("live-end")));
    await flush();
    expect(s.onEnded).toHaveBeenCalledTimes(1);
    expect(mockMatchEnd).toHaveBeenCalledTimes(1);
  });

  it("the server's own end at full time (a refused end): buzzes once, on the read that shows it", async () => {
    mockEndMatchClock.mockResolvedValue({ ok: false, error: { code: "MATCH_NOT_LIVE", message: "x" } });
    asTimekeeper({ remaining: 0 });
    await advance(AUTO_END_DELAY_MS + 100);
    expect(mockEndMatchClock).toHaveBeenCalledTimes(1);
    expect(mockMatchEnd).not.toHaveBeenCalled();
    emitSnapshot({ status: "in_progress", ended_at: ENDED_AT });
    expect(mockMatchEnd).toHaveBeenCalledTimes(1);
    emitSnapshot({ status: "in_progress", ended_at: ENDED_AT });
    expect(mockMatchEnd).toHaveBeenCalledTimes(1);
  });

  it("never shows the ended plate itself, even on the read that shows the server's end", () => {
    const s = asTimekeeper();
    emitSnapshot({ status: "in_progress", ended_at: ENDED_AT, final_elapsed_s: 228 });
    expect(s.queryByText(/ENDED THE MATCH/)).toBeNull();
    s.getByTestId("live-timekeeper-kicker");
  });

  it("stops auto-retrying a failing server end after a bounded number of attempts", async () => {
    mockEndMatchClock.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "offline" } });
    const s = asTimekeeper({ remaining: 0 });
    for (let i = 0; i < 10; i++) await advance(AUTO_END_DELAY_MS + 100);
    expect(mockEndMatchClock).toHaveBeenCalledTimes(MAX_AUTO_END_ATTEMPTS);
    expect(s.onEnded).not.toHaveBeenCalled();
  });

  it("pauses and resumes on the server and names itself on the broadcasts", async () => {
    const PAUSED_AT = new Date(NOW).toISOString();
    mockPauseMatch.mockResolvedValue({ ok: true, data: { paused_at: PAUSED_AT } });
    mockResumeMatch.mockResolvedValue({ ok: true, data: { total_paused_duration: 4 } });
    const s = asTimekeeper();
    await act(async () => fireEvent.press(s.getByTestId("live-pause-toggle")));
    await flush();
    expect(mockSends.broadcastTimerPaused).toHaveBeenCalledWith(PAUSED_AT, "tk-1");
    await act(async () => fireEvent.press(s.getByTestId("live-pause-toggle")));
    await flush();
    expect(mockSends.broadcastTimerResumed).toHaveBeenCalledWith(4, "tk-1");
  });

  it("shows TK-D9 counting to the pause timeout while paused", () => {
    const s = asTimekeeper({ paused: true, props: { timekeeper: { ...TK_SEAM, timeoutAt: TIMEOUT_AT }, renderTimeoutChip: chip } });
    expect(s.getByTestId("tk-d9")).toHaveTextContent(`chip ${TIMEOUT_AT}`);
    expect(s.queryByTestId("live-timekeeper-offline")).toBeNull();
  });

  it("a received clock event only re-reads; it never moves this screen (M-R8)", () => {
    const s = asTimekeeper();
    act(() => mockSyncParams.current?.onTimerPaused?.(new Date(NOW).toISOString(), "x"));
    expect(mockReconcile).toHaveBeenCalledTimes(1);
    expect(s.queryByTestId("live-strip-paused")).toBeNull();
    act(() => mockSyncParams.current?.onTimerResumed?.(3, "x"));
    expect(mockReconcile).toHaveBeenCalledTimes(2);
  });
});

describe("a stray match_ended on the timekeeper's phone while the DB clock still runs (M-R8)", () => {
  // Nobody else ends the timekeeper's clock, but the match channel is public: an
  // athlete's second device on an older build, or the web live page, may send one.
  it.each([
    ["an athlete's id", "a-2"],
    ["no actor", undefined],
    ["the timekeeper's own id", "tk-1"],
  ])("from %s: only re-reads; no ended plate, no haptic, the controls stay", async (_name, actor) => {
    const PAUSED_AT = new Date(NOW).toISOString();
    mockPauseMatch.mockResolvedValue({ ok: true, data: { paused_at: PAUSED_AT } });
    const s = asTimekeeper();
    act(() => mockSyncParams.current?.onMatchEnded?.(actor));
    expect(mockReconcile).toHaveBeenCalledTimes(1);
    expect(s.queryByText(/ENDED THE MATCH/)).toBeNull();
    expect(mockMatchEnd).not.toHaveBeenCalled();
    expect(s.getByTestId("live-end")).not.toHaveTextContent("ENDING");
    // Pause still reaches the server.
    await act(async () => fireEvent.press(s.getByTestId("live-pause-toggle")));
    await flush();
    expect(mockPauseMatch).toHaveBeenCalledTimes(1);
    expect(mockSends.broadcastTimerPaused).toHaveBeenCalledWith(PAUSED_AT, "tk-1");
  });

  it("Leave still asks with TK-K16 and leaves the seat", async () => {
    jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
      buttons?.[1]?.onPress?.();
    });
    const s = asTimekeeper();
    act(() => mockSyncParams.current?.onMatchEnded?.("a-2"));
    await act(async () => fireEvent.press(s.getByTestId("live-timekeeper-leave")));
    await flush();
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(mockLeave).toHaveBeenCalledWith({ tag: "client" }, "M1");
  });

  it("the hold still ends the clock on the server", async () => {
    const s = asTimekeeper({ remaining: 200 });
    act(() => mockSyncParams.current?.onMatchEnded?.("a-2"));
    await act(async () => completeHold(s.getByTestId("live-end")));
    await flush();
    expect(mockEndMatchClock).toHaveBeenCalledWith({ tag: "client" }, "M1", 100);
    expect(s.onEnded).toHaveBeenCalledWith(100);
  });

  it("the 00:00 auto-end still fires", async () => {
    const s = asTimekeeper({ remaining: 0 });
    act(() => mockSyncParams.current?.onMatchEnded?.());
    await advance(AUTO_END_DELAY_MS + 100);
    expect(mockEndMatchClock).toHaveBeenCalledWith({ tag: "client" }, "M1", DURATION);
    expect(s.onEnded).toHaveBeenCalledWith(DURATION);
  });
});

describe("the timekeeper's Leave while the clock runs (A4, TK-K16)", () => {
  function confirmLeave() {
    return jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
      buttons?.[1]?.onPress?.();
    });
  }

  it("asks with TK-K16 first; Keep timekeeping does nothing", () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const s = asTimekeeper();
    fireEvent.press(s.getByTestId("live-timekeeper-leave"));
    expect(alert).toHaveBeenCalledWith(
      "Stop timekeeping?",
      "The clock is running. If you leave now, the match won't count for either athlete.",
      [
        expect.objectContaining({ text: "Keep timekeeping", style: "cancel" }),
        expect.objectContaining({ text: "Leave", style: "destructive" }),
      ],
    );
    expect(mockLeave).not.toHaveBeenCalled();
  });

  it("a no contest: stops the recorder, tells the athletes naming itself, re-reads for the wizard's exit (TK-NC3)", async () => {
    confirmLeave();
    const s = asTimekeeper();
    await act(async () => fireEvent.press(s.getByTestId("live-timekeeper-leave")));
    await flush();
    expect(mockLeave).toHaveBeenCalledWith({ tag: "client" }, "M1");
    expect(s.recorder.stop).toHaveBeenCalledTimes(1);
    expect(mockSends.broadcastMatchCancelled).toHaveBeenCalledWith("tk-1");
    expect(mockReconcile).toHaveBeenCalled();
    expect(s.onEnded).not.toHaveBeenCalled();
    expect(mockEndMatchClock).not.toHaveBeenCalled();
    expect(s.getByTestId("live-pause-toggle").props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
  });

  it("refused once the clock ended (the result is owed): re-reads and keeps the controls", async () => {
    confirmLeave();
    mockLeave.mockResolvedValue({ ok: false, error: { code: "RESULT_OWED", message: "x" } });
    const s = asTimekeeper();
    await act(async () => fireEvent.press(s.getByTestId("live-timekeeper-leave")));
    await flush();
    expect(s.recorder.stop).not.toHaveBeenCalled();
    expect(mockSends.broadcastMatchCancelled).not.toHaveBeenCalled();
    expect(mockReconcile).toHaveBeenCalled();
    expect(s.getByTestId("live-pause-toggle").props.accessibilityState).toEqual(expect.objectContaining({ disabled: false }));
  });

  it("no Leave once the clock ended: a refused end (the server's own end) waits on the re-read without it (TK-K14)", async () => {
    mockEndMatchClock.mockResolvedValue({ ok: false, error: { code: "MATCH_NOT_LIVE", message: "x" } });
    const s = asTimekeeper();
    s.getByTestId("live-timekeeper-leave");
    await act(async () => completeHold(s.getByTestId("live-end")));
    await flush();
    expect(s.getByTestId("live-end")).toHaveTextContent("ENDING");
    expect(s.queryByTestId("live-timekeeper-leave")).toBeNull();
    s.getByTestId("live-timekeeper-kicker");
  });

  it("no Leave once the server ended the clock", async () => {
    const s = asTimekeeper();
    await act(async () => completeHold(s.getByTestId("live-end")));
    await flush();
    expect(s.onEnded).toHaveBeenCalledTimes(1);
    expect(s.queryByTestId("live-timekeeper-leave")).toBeNull();
  });

  it("Leave is back when a failed end offers the hold again", async () => {
    mockEndMatchClock.mockResolvedValueOnce({ ok: false, error: { code: "UNKNOWN", message: "offline" } });
    const s = asTimekeeper();
    await act(async () => completeHold(s.getByTestId("live-end")));
    await flush();
    expect(s.getByTestId("live-timekeeper-leave").props.accessibilityState).toEqual({ disabled: false });
  });

  it("dimmed while a pause is in flight, and a tap then asks nothing; enabled again once it settles", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    let answer!: (v: unknown) => void;
    mockPauseMatch.mockImplementationOnce(() => new Promise((r) => (answer = r)));
    const s = asTimekeeper();
    expect(s.getByTestId("live-timekeeper-leave").props.accessibilityState).toEqual({ disabled: false });
    await act(async () => fireEvent.press(s.getByTestId("live-pause-toggle")));
    expect(s.getByTestId("live-timekeeper-leave").props.accessibilityState).toEqual({ disabled: true });
    fireEvent.press(s.getByTestId("live-timekeeper-leave"));
    expect(alert).not.toHaveBeenCalled();
    await act(async () => answer({ ok: true, data: { paused_at: new Date(NOW).toISOString() } }));
    await flush();
    expect(s.getByTestId("live-timekeeper-leave").props.accessibilityState).toEqual({ disabled: false });
    fireEvent.press(s.getByTestId("live-timekeeper-leave"));
    expect(alert).toHaveBeenCalledTimes(1);
  });

  // The confirm re-checks: the alert can sit open while the clock ends or
  // another control starts, and the server would refuse the Leave then.
  type AlertButtons = Parameters<typeof Alert.alert>[2];
  function holdAlertOpen() {
    const held: { buttons: AlertButtons } = { buttons: undefined };
    jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
      held.buttons = buttons;
    });
    return { confirm: () => held.buttons?.[1]?.onPress?.() };
  }

  it("a confirm after the 00:00 auto-end ended the clock (the alert still up) leaves nothing", async () => {
    const alert = holdAlertOpen();
    const s = asTimekeeper({ remaining: 0 });
    fireEvent.press(s.getByTestId("live-timekeeper-leave"));
    await advance(AUTO_END_DELAY_MS + 100);
    expect(mockEndMatchClock).toHaveBeenCalledTimes(1);
    expect(s.onEnded).toHaveBeenCalledTimes(1);
    await act(async () => alert.confirm());
    await flush();
    expect(mockLeave).not.toHaveBeenCalled();
    expect(mockSends.broadcastMatchCancelled).not.toHaveBeenCalled();
    expect(s.recorder.stop).toHaveBeenCalledTimes(1);
    // The end's state stands: ENDING, and no Leave offered.
    expect(s.getByTestId("live-end")).toHaveTextContent("ENDING");
    expect(s.queryByTestId("live-timekeeper-leave")).toBeNull();
  });

  it("a confirm while a pause is in flight (started with the alert up) leaves nothing", async () => {
    const alert = holdAlertOpen();
    let answer!: (v: unknown) => void;
    mockPauseMatch.mockImplementationOnce(() => new Promise((r) => (answer = r)));
    const s = asTimekeeper();
    fireEvent.press(s.getByTestId("live-timekeeper-leave"));
    await act(async () => fireEvent.press(s.getByTestId("live-pause-toggle")));
    await act(async () => alert.confirm());
    await flush();
    expect(mockLeave).not.toHaveBeenCalled();
    await act(async () => answer({ ok: true, data: { paused_at: new Date(NOW).toISOString() } }));
    await flush();
    // The pause landed as the pause left it; Leave is offered again.
    s.getByTestId("live-strip-paused");
    expect(mockSends.broadcastTimerPaused).toHaveBeenCalledTimes(1);
    expect(s.getByTestId("live-timekeeper-leave").props.accessibilityState).toEqual({ disabled: false });
  });
});

describe("the timekeeper's camera fails mid-match (D12, TK-L3, TK-L4)", () => {
  it("shows the camera banner over a running clock; Restart camera starts a new recording", () => {
    const s = asTimekeeper({ recorderState: "error" });
    s.getByText("CAMERA STOPPED · KEEP RUNNING THE CLOCK");
    s.getByTestId("live-pause-toggle");
    s.recorder.start.mockClear();
    fireEvent.press(s.getByTestId("live-camera-restart"));
    expect(s.recorder.start).toHaveBeenCalledTimes(1);
  });

  it("replaces the athletes' no-video plate: no plate and none of its copy, the NO VIDEO tally stays (board P-TK-B7 2b)", () => {
    const s = asTimekeeper({ recorderState: "error" });
    s.getByTestId("live-camera-stopped");
    expect(s.queryByTestId("live-no-video-error")).toBeNull();
    expect(s.queryByText("NO VIDEO FOR THIS MATCH")).toBeNull();
    expect(s.queryByText(/your result still counts/)).toBeNull();
    expect(s.getByTestId("live-tally")).toHaveTextContent("NO VIDEO");
  });

  it("is the timekeeper's only: an athlete's failed camera keeps the shipped no-video screen", () => {
    const s = asAthlete({ recorderState: "error" });
    expect(s.queryByTestId("live-camera-stopped")).toBeNull();
    s.getByTestId("live-no-video-error");
    s.getByText("NO VIDEO FOR THIS MATCH");
  });

  it("without the camera permission Restart cannot work: no TK-L3, the shipped permission plate with its one action", () => {
    const s = asTimekeeper({ recorderState: "error", permission: { granted: false, canAskAgain: true } });
    expect(s.queryByTestId("live-camera-stopped")).toBeNull();
    expect(s.queryByTestId("live-camera-restart")).toBeNull();
    s.getByTestId("live-no-video-canAsk");
    s.getByTestId("live-allow-camera");
  });
});

describe("an athlete watches the clock", () => {
  it("has no controls: TK-L2 in their place; no kicker and no Leave", () => {
    const s = asAthlete();
    expect(s.queryByTestId("live-pause-toggle")).toBeNull();
    expect(s.queryByTestId("live-end")).toBeNull();
    expect(s.getByTestId("live-clock-runner")).toHaveTextContent("J. CRUZ RUNS THE CLOCK");
    expect(s.queryByTestId("live-timekeeper-kicker")).toBeNull();
    expect(s.queryByTestId("live-timekeeper-leave")).toBeNull();
  });

  it("never ends the clock at 00:00: the timekeeper's phone or the server does", async () => {
    const s = asAthlete({ remaining: 0 });
    await advance(AUTO_END_DELAY_MS * 10);
    expect(mockEndMatchClock).not.toHaveBeenCalled();
    expect(mockSends.broadcastMatchEnded).not.toHaveBeenCalled();
    expect(s.onEnded).not.toHaveBeenCalled();
    s.getByTestId("live-strip-timeup");
  });

  it("a received pause only re-reads (the read applies it)", () => {
    const s = asAthlete();
    act(() => mockSyncParams.current?.onTimerPaused?.(new Date(NOW).toISOString(), "tk-1"));
    expect(mockReconcile).toHaveBeenCalledTimes(1);
    expect(s.queryByTestId("live-strip-paused")).toBeNull();
  });

  it("a received end freezes on the timekeeper's ended plate and re-reads; the DB moves the wizard", async () => {
    const s = asAthlete();
    act(() => mockSyncParams.current?.onMatchEnded?.("tk-1"));
    // The deck's {NAME}: the timekeeper's short name, as on TK-L2 (stepSeams passes it as endedByName).
    s.getByText("J. CRUZ ENDED THE MATCH");
    expect(mockReconcile).toHaveBeenCalledTimes(1);
    // No haptic from a broadcast: it marks the end the DB confirms.
    expect(mockMatchEnd).not.toHaveBeenCalled();
    await advance(OPPONENT_ENDED_INTERSTITIAL_MS * 3);
    // No step change and no recorder stop from a broadcast: the reconciler's move does both.
    expect(s.onEnded).not.toHaveBeenCalled();
    expect(s.recorder.stop).not.toHaveBeenCalled();
    act(() => mockSyncParams.current?.onMatchEnded?.("tk-1"));
    expect(mockReconcile).toHaveBeenCalledTimes(1);
    // The read that shows the end (before the wizard moves on): the haptic, once; the plate stays.
    emitSnapshot({ status: "in_progress", ended_at: ENDED_AT });
    expect(mockMatchEnd).toHaveBeenCalledTimes(1);
    s.getByText("J. CRUZ ENDED THE MATCH");
    emitSnapshot({ status: "in_progress", ended_at: ENDED_AT });
    expect(mockMatchEnd).toHaveBeenCalledTimes(1);
  });

  it("the end the DB shows before any broadcast (the row event won the race) still buzzes once", () => {
    asAthlete();
    emitSnapshot({ status: "in_progress", ended_at: ENDED_AT });
    expect(mockMatchEnd).toHaveBeenCalledTimes(1);
  });

  // Spec 4.2 End, board P-TK-B7 frame 5: the plate also shows when the read
  // comes first (a lost broadcast, the server's own end at full time); the
  // wizard keeps this step on screen meanwhile (`useLiveEndHold`).
  it("the end the DB shows before any broadcast freezes the ended plate on the server's final clock", () => {
    const s = asAthlete({ remaining: 200 });
    emitSnapshot({ status: "in_progress", ended_at: ENDED_AT, final_elapsed_s: 228 });
    s.getByText("J. CRUZ ENDED THE MATCH");
    // 300 - 228 = 72 s left on the server's clock, not this phone's 03:20.
    s.getByText("FINAL CLOCK 01:12 OF 05:00");
    expect(s.queryByTestId("live-clock-runner")).toBeNull();
    // No step change from here and no recorder stop: the wizard's move does both.
    expect(s.onEnded).not.toHaveBeenCalled();
    expect(s.recorder.stop).not.toHaveBeenCalled();
    expect(mockReconcile).not.toHaveBeenCalled();
  });

  it("a broadcast freeze takes the server's final clock from the read that confirms it", () => {
    const s = asAthlete({ remaining: 200 });
    act(() => mockSyncParams.current?.onMatchEnded?.("tk-1"));
    s.getByText("FINAL CLOCK 03:20 OF 05:00");
    emitSnapshot({ status: "in_progress", ended_at: ENDED_AT, final_elapsed_s: 102 });
    s.getByText("J. CRUZ ENDED THE MATCH");
    s.getByText("FINAL CLOCK 03:18 OF 05:00");
  });

  it("a read without the server's clock keeps the broadcast freeze's own", async () => {
    const s = asAthlete({ remaining: 200 });
    act(() => mockSyncParams.current?.onMatchEnded?.("tk-1"));
    // The clock keeps ticking under the plate.
    await advance(3_000);
    emitSnapshot({ status: "in_progress", ended_at: ENDED_AT });
    s.getByText("FINAL CLOCK 03:20 OF 05:00");
  });

  it("the plate a read froze stays: later running reads (stale ones) never undo it", () => {
    const s = asAthlete();
    emitSnapshot({ status: "in_progress", ended_at: ENDED_AT, final_elapsed_s: 228 });
    emitSnapshot({ status: "in_progress" });
    emitSnapshot({ status: "in_progress" });
    s.getByText("J. CRUZ ENDED THE MATCH");
    expect(mockReconcile).not.toHaveBeenCalled();
  });

  it.each([
    ["the other athlete", "a-2"],
    ["no actor", undefined],
    ["someone who is not the seated timekeeper", "tk-old"],
  ])("a received end from %s does not freeze: it only re-reads", async (_name, actor) => {
    const s = asAthlete();
    act(() => mockSyncParams.current?.onMatchEnded?.(actor));
    expect(mockReconcile).toHaveBeenCalledTimes(1);
    expect(s.queryByText(/ENDED THE MATCH/)).toBeNull();
    expect(mockMatchEnd).not.toHaveBeenCalled();
    s.getByTestId("live-clock-runner");
    // The seated timekeeper's own end still freezes afterwards.
    act(() => mockSyncParams.current?.onMatchEnded?.("tk-1"));
    s.getByText("J. CRUZ ENDED THE MATCH");
    expect(mockReconcile).toHaveBeenCalledTimes(2);
  });

  it("the timekeeper offline: TK-D7 with the TK-D9 countdown inside it, the clock still running", () => {
    const s = asAthlete({
      props: { timekeeper: { ...ATHLETE_SEAM, offline: true, timeoutAt: TIMEOUT_AT }, renderTimeoutChip: chip },
    });
    s.getByText("J. CRUZ IS OFFLINE");
    expect(s.getByTestId("tk-d9")).toHaveTextContent(`chip ${TIMEOUT_AT}`);
    s.getByTestId("live-clock-runner");
    expect(s.queryByTestId("live-strip-paused")).toBeNull();
  });

  it("paused by the timekeeper: TK-D9 counting to the pause timeout", () => {
    const s = asAthlete({ paused: true, props: { timekeeper: { ...ATHLETE_SEAM, timeoutAt: TIMEOUT_AT }, renderTimeoutChip: chip } });
    s.getByTestId("live-strip-paused");
    expect(s.getByTestId("tk-d9")).toHaveTextContent(`chip ${TIMEOUT_AT}`);
  });

  it("a stale timeout from the last state read is not shown once the clock runs and the timekeeper is online", () => {
    const s = asAthlete({ props: { timekeeper: { ...ATHLETE_SEAM, timeoutAt: TIMEOUT_AT }, renderTimeoutChip: chip } });
    expect(s.queryByTestId("tk-d9")).toBeNull();
  });

  it("the banner clears when the timekeeper is back", () => {
    const s = asAthlete({ props: { timekeeper: { ...ATHLETE_SEAM, offline: true } } });
    s.getByTestId("live-timekeeper-offline");
    s.rerenderWith({ timekeeper: ATHLETE_SEAM });
    expect(s.queryByTestId("live-timekeeper-offline")).toBeNull();
  });
});

describe("a broadcast freeze on an athlete's phone waits on the DB (a stray or forged match_ended, jr_be-czt)", () => {
  const end = () => act(() => mockSyncParams.current?.onMatchEnded?.("tk-1"));

  it("reads that keep showing the clock running undo it: the live screen and TK-D7 come back, no haptic", () => {
    const s = asAthlete({ props: { timekeeper: { ...ATHLETE_SEAM, offline: true } } });
    s.getByTestId("live-timekeeper-offline");
    end();
    s.getByText("J. CRUZ ENDED THE MATCH");
    expect(s.queryByTestId("live-timekeeper-offline")).toBeNull();
    expect(mockReconcile).toHaveBeenCalledTimes(1);
    // The first read may have left before the end was stamped: still frozen, and a fresh read is asked for.
    emitSnapshot({ status: "in_progress", ended_at: null });
    s.getByText("J. CRUZ ENDED THE MATCH");
    expect(mockReconcile).toHaveBeenCalledTimes(2);
    // The second left after the freeze: the clock still runs, so the freeze is undone.
    emitSnapshot({ status: "in_progress", ended_at: null });
    expect(s.queryByText(/ENDED THE MATCH/)).toBeNull();
    s.getByTestId("live-clock-runner");
    s.getByTestId("live-timekeeper-offline");
    expect(mockMatchEnd).not.toHaveBeenCalled();
    expect(s.recorder.stop).not.toHaveBeenCalled();
    expect(s.onEnded).not.toHaveBeenCalled();
  });

  it("the timekeeper's real end afterwards freezes again, and its read buzzes once", () => {
    const s = asAthlete();
    end();
    emitSnapshot({ status: "in_progress" });
    emitSnapshot({ status: "in_progress" });
    expect(s.queryByText(/ENDED THE MATCH/)).toBeNull();
    end();
    s.getByText("J. CRUZ ENDED THE MATCH");
    emitSnapshot({ status: "in_progress", ended_at: ENDED_AT });
    expect(mockMatchEnd).toHaveBeenCalledTimes(1);
    s.getByText("J. CRUZ ENDED THE MATCH");
  });

  it("a stale running read, then the read that shows the end: the plate stays and buzzes once", () => {
    const s = asAthlete();
    end();
    emitSnapshot({ status: "in_progress" });
    emitSnapshot({ status: "in_progress", ended_at: ENDED_AT });
    s.getByText("J. CRUZ ENDED THE MATCH");
    expect(mockMatchEnd).toHaveBeenCalledTimes(1);
  });

  it("running reads with no freeze change nothing and ask for no read", () => {
    const s = asAthlete();
    emitSnapshot({ status: "in_progress" });
    emitSnapshot({ status: "in_progress" });
    expect(mockReconcile).not.toHaveBeenCalled();
    s.getByTestId("live-clock-runner");
  });
});

describe("through LiveStage, as the renderer mounts it (past GO)", () => {
  function renderStage(props: Partial<React.ComponentProps<typeof LiveStage>>, selfId: string) {
    return render(
      <MatchSyncProvider value={syncValue(selfId)}>
        <LiveStage
          matchId="M1"
          me={{ displayName: "Marcus Reyes", currentElo: 1512, weightLbs: 170 }}
          opponent={{ displayName: "Dana Okafor", currentElo: 1487, weightLbs: 168 }}
          durationSeconds={DURATION}
          startedAt={new Date(NOW - COUNTDOWN_MS - 60_000).toISOString()}
          pausedAt={null}
          totalPausedDuration={0}
          recorder={makeRecorder()}
          recording
          myWeight={170}
          opponentWeight={168}
          onEnded={jest.fn()}
          {...props}
        />
      </MatchSyncProvider>,
    );
  }

  it("the timekeeper, paused: the seams and the TK-D9 renderer reach the live screen", () => {
    const s = renderStage(
      {
        pausedAt: new Date(NOW).toISOString(),
        controls: "full",
        endVia: "end_match_clock",
        timekeeper: { ...TK_SEAM, timeoutAt: TIMEOUT_AT },
        renderTimeoutChip: chip,
      },
      "tk-1",
    );
    s.getByTestId("live-timekeeper-kicker");
    expect(s.getByTestId("tk-d9")).toHaveTextContent(`chip ${TIMEOUT_AT}`);
  });

  it("an athlete, the timekeeper offline: TK-D7 with the TK-D9 chip inside it", () => {
    const s = renderStage(
      {
        controls: "none",
        endVia: null,
        endedByName: "J. Cruz",
        timekeeper: { ...ATHLETE_SEAM, offline: true, timeoutAt: TIMEOUT_AT },
        renderTimeoutChip: chip,
      },
      "a-1",
    );
    within(s.getByTestId("live-timekeeper-offline")).getByTestId("tk-d9");
    s.getByTestId("live-clock-runner");
  });
});

describe("a blank timekeeper name never prints blank or 'Opponent' (jits-o47s.27)", () => {
  it("the ended plate, TK-L2 and TK-D7 fall back to the role when the read carried no name", () => {
    const s = asAthlete({ props: { endedByName: "", timekeeper: { ...ATHLETE_SEAM, name: "", offline: true } } });
    s.getByText("TIMEKEEPER RUNS THE CLOCK");
    s.getByText("TIMEKEEPER IS OFFLINE");
    act(() => mockSyncParams.current?.onMatchEnded?.("tk-1"));
    s.getByText("TIMEKEEPER ENDED THE MATCH");
    expect(s.queryByText(/OPPONENT|DANA OKAFOR ENDED/)).toBeNull();
  });

  it("a blank endedByName with a known timekeeper names them by short name", () => {
    const s = asAthlete({ props: { endedByName: "  " } });
    act(() => mockSyncParams.current?.onMatchEnded?.("tk-1"));
    s.getByText("J. CRUZ ENDED THE MATCH");
  });

  it("a blank endedByName in a two-athlete match names the opponent, as the default does", () => {
    const s = renderLive({ selfId: null, props: { endedByName: "" } });
    act(() => mockSyncParams.current?.onMatchEnded?.());
    s.getByText("DANA OKAFOR ENDED THE MATCH");
  });
});

describe("a no contest while the clock runs stops the recorder before the wizard's exit", () => {
  // The wizard feeds every reconciler snapshot to the step's listeners first,
  // then exits a cancelled match through `exitMatchTo`, which unmounts the
  // camera: the recording must be stopped by then (TK-NC1, TK-NC2, TK-NC6, TK-NC7).
  it.each([
    ["an athlete (the timekeeper left or went offline, a pause timeout)", asAthlete],
    ["the timekeeper (back after an offline no contest)", asTimekeeper],
  ])("%s: the read that shows the cancel stops it", (_label, mount) => {
    const s = mount();
    emitSnapshot({ status: "in_progress" });
    expect(s.recorder.stop).not.toHaveBeenCalled();
    emitSnapshot({ status: "cancelled", cancel_reason: "timekeeper_offline" });
    expect(s.recorder.stop).toHaveBeenCalledTimes(1);
  });

  it("nothing after it: no auto-end at 00:00 on the way out", async () => {
    const s = asTimekeeper({ remaining: 0 });
    emitSnapshot({ status: "cancelled", cancel_reason: "pause_timeout" });
    await advance(AUTO_END_DELAY_MS * 4);
    expect(mockEndMatchClock).not.toHaveBeenCalled();
    expect(s.onEnded).not.toHaveBeenCalled();
  });

  it("a two-athlete match registers no such listener (its recorder stops only on the end)", () => {
    const s = renderLive({ selfId: null });
    emitSnapshot({ status: "cancelled" });
    expect(s.recorder.stop).not.toHaveBeenCalled();
  });
});

describe("a two-athlete match is unchanged", () => {
  it("no timekeeper-mode piece, the shipped controls, received events applied, sends without an actor", async () => {
    const PAUSED_AT = new Date(NOW).toISOString();
    mockPauseMatch.mockResolvedValue({ ok: true, data: { paused_at: PAUSED_AT } });
    const s = renderLive({ selfId: null });
    for (const id of ["live-timekeeper-kicker", "live-timekeeper-leave", "live-clock-runner", "live-timekeeper-banners"]) {
      expect(s.queryByTestId(id)).toBeNull();
    }
    act(() => mockSyncParams.current?.onTimerPaused?.(PAUSED_AT));
    s.getByTestId("live-strip-paused");
    expect(mockReconcile).not.toHaveBeenCalled();
  });

  it("sends exactly the payloads it always did: no actor, and the end is the broadcast alone", async () => {
    const PAUSED_AT = new Date(NOW).toISOString();
    mockPauseMatch.mockResolvedValue({ ok: true, data: { paused_at: PAUSED_AT } });
    const s = renderLive({ selfId: null });
    await act(async () => fireEvent.press(s.getByTestId("live-pause-toggle")));
    await flush();
    expect(mockSends.broadcastTimerPaused.mock.calls).toEqual([[PAUSED_AT]]);
    mockResumeMatch.mockResolvedValue({ ok: true, data: { total_paused_duration: 2 } });
    await act(async () => fireEvent.press(s.getByTestId("live-pause-toggle")));
    await flush();
    expect(mockSends.broadcastTimerResumed.mock.calls).toEqual([[2]]);
    await act(async () => completeHold(s.getByTestId("live-end")));
    await flush();
    expect(mockSends.broadcastMatchEnded.mock.calls).toEqual([[]]);
    expect(mockEndMatchClock).not.toHaveBeenCalled();
    expect(s.onEnded).toHaveBeenCalledTimes(1);
  });

  it("an opponent's end still advances after the plate (the broadcast is the end)", async () => {
    const s = renderLive({ selfId: null });
    act(() => mockSyncParams.current?.onMatchEnded?.());
    s.getByText("DANA OKAFOR ENDED THE MATCH");
    expect(s.recorder.stop).toHaveBeenCalledTimes(1);
    expect(mockMatchEnd).toHaveBeenCalledTimes(1);
    // No read undoes it: the two-athlete end never waits on the DB.
    emitSnapshot({ status: "in_progress" });
    emitSnapshot({ status: "in_progress" });
    s.getByText("DANA OKAFOR ENDED THE MATCH");
    await advance(OPPONENT_ENDED_INTERSTITIAL_MS);
    expect(s.onEnded).toHaveBeenCalledTimes(1);
    expect(mockReconcile).not.toHaveBeenCalled();
  });

  it("the hold still buzzes at its completion, before the broadcast settles", async () => {
    mockSends.broadcastMatchEnded.mockImplementationOnce(() => new Promise<string>(() => undefined));
    const s = renderLive({ selfId: null });
    await act(async () => completeHold(s.getByTestId("live-end")));
    await flush();
    expect(mockMatchEnd).toHaveBeenCalledTimes(1);
    expect(s.onEnded).not.toHaveBeenCalled();
  });
});

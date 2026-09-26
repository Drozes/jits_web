/**
 * Auto-end at 00:00 (jits-2y8i).
 *
 * The live step arms a short timeout when the clock hits zero and ends the
 * match when it fires. The timer keeps re-rendering the step every second
 * after it reaches zero, and `handleEnd` is a new function on every render,
 * so with `handleEnd` in the effect deps the first re-render inside
 * AUTO_END_DELAY_MS cancelled the armed timeout, and a one-shot guard kept
 * it from ever re-arming: the match sat LIVE at 00:00 and `match_ended` was
 * never sent.
 *
 * This drives the REAL `useSessionMatchTimer` (its 1 s interval is the
 * re-render source in production) under fake timers, and a sync double that
 * hands back a fresh object on every render, exactly like the real hook, so
 * `handleEnd` changes identity on every render here too.
 */
import * as React from "react";
import { render, act, fireEvent } from "@testing-library/react-native";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));

const mockPauseMatch = jest.fn();
const mockResumeMatch = jest.fn();
jest.mock("@jits/shared/api/mutations", () => ({
  pauseMatch: (...a: unknown[]) => mockPauseMatch(...a),
  resumeMatch: (...a: unknown[]) => mockResumeMatch(...a),
}));
jest.mock("@jits/shared/api/queries", () => ({ getMatchDetails: jest.fn() }));

const mockBroadcastMatchEnded = jest.fn();
interface CapturedSyncParams {
  onTimerPaused?: (pausedAt: string) => void;
  onTimerResumed?: (totalPausedDuration: number) => void;
  onMatchEnded?: () => void;
}
const mockSyncParams: { current: CapturedSyncParams | null } = { current: null };
jest.mock("@jits/shared/hooks/use-session-match-sync", () => ({
  // A new object every render, like the real hook's return literal.
  useSessionMatchSync: (params: CapturedSyncParams) => {
    mockSyncParams.current = params;
    return {
      broadcastTimerStarted: jest.fn(),
      broadcastReady: jest.fn(),
      broadcastMatchCancelled: jest.fn(),
      broadcastMatchEnded: () => {
        mockBroadcastMatchEnded();
        return Promise.resolve("ok");
      },
      broadcastTimerPaused: jest.fn(),
      broadcastTimerResumed: jest.fn(),
    };
  },
}));

const mockTimeWarning = jest.fn(() => Promise.resolve());
jest.mock("@/lib/match-flow/use-keep-awake", () => ({ useMatchKeepAwake: () => {} }));
jest.mock("@/lib/match-flow/use-haptics", () => ({
  matchHaptics: {
    matchStart: () => Promise.resolve(),
    matchEnd: () => Promise.resolve(),
    timeWarning: () => mockTimeWarning(),
  },
}));
jest.mock("@/components/ui/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ textPrimary: "#E8EDF2", textOnAccent: "#FFFFFF", accentCta: "#E5484D" }),
}));
jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  const stub = () => R.createElement(RN.View, { testID: "icon" });
  return new Proxy(
    {},
    { get: (_t: Record<string, unknown>, prop: string) => (prop === "__esModule" ? true : stub) },
  );
});
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

import { LiveStep } from "@/components/match-flow/steps/live-step";
import { AUTO_END_DELAY_MS } from "@/lib/video/recording-limits";
import type { UseVideoRecorderReturn } from "@/lib/video/use-video-recorder";

const NOW = new Date("2026-09-26T12:00:00.000Z").getTime();
const DURATION = 300;

function makeRecorder() {
  return {
    permission: { granted: false },
    start: jest.fn(() => Promise.resolve()),
    stop: jest.fn(() => Promise.resolve()),
  } as unknown as UseVideoRecorderReturn & { stop: jest.Mock };
}

/**
 * Render a live step whose clock has `remainingSeconds` left right now. With
 * `pausedForSeconds`, the step mounts into a match that was paused that many
 * seconds ago with `remainingSeconds` left (cold start / re-entry).
 */
function renderLive(remainingSeconds: number, pausedForSeconds?: number) {
  const recorder = makeRecorder();
  const onEnded = jest.fn();
  const pauseMs = (pausedForSeconds ?? 0) * 1000;
  const startedAt = new Date(NOW - pauseMs - (DURATION - remainingSeconds) * 1000).toISOString();
  const pausedAt = pausedForSeconds == null ? null : new Date(NOW - pauseMs).toISOString();
  const element = () => (
    <LiveStep
      matchId="M1"
      matchType="ranked"
      durationSeconds={DURATION}
      startedAt={startedAt}
      pausedAt={pausedAt}
      totalPausedDuration={0}
      recorder={recorder}
      // A fresh inline callback per render, like the match-step renderer.
      onEnded={() => onEnded()}
    />
  );
  const utils = render(element());
  const rerender = () => utils.rerender(element());
  return { ...utils, rerender, recorder, onEnded };
}

/** Advance `ms` in small slices, forcing a parent re-render between each. */
async function advanceWithRerenders(ms: number, rerender: () => void, slice = 250) {
  for (let t = 0; t < ms; t += slice) {
    await act(async () => {
      jest.advanceTimersByTime(slice);
    });
    rerender();
  }
}

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  mockBroadcastMatchEnded.mockClear();
  mockTimeWarning.mockClear();
  mockPauseMatch.mockReset();
  mockResumeMatch.mockReset();
  mockSyncParams.current = null;
});

afterEach(() => {
  jest.useRealTimers();
});

describe("LiveStep auto-end at 00:00 (jits-2y8i)", () => {
  it("ends exactly once even when the step re-renders inside the auto-end delay", async () => {
    const { rerender, onEnded, recorder } = renderLive(0);

    await advanceWithRerenders(AUTO_END_DELAY_MS + 5_000, rerender);

    expect(mockBroadcastMatchEnded).toHaveBeenCalledTimes(1);
    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(recorder.stop).toHaveBeenCalledTimes(1);
  });

  it("ends once when the clock runs down to zero while ticking", async () => {
    const { rerender, onEnded } = renderLive(3);

    await advanceWithRerenders(2_000, rerender);
    expect(mockBroadcastMatchEnded).not.toHaveBeenCalled();

    await advanceWithRerenders(1_000 + AUTO_END_DELAY_MS + 3_000, rerender);
    expect(mockBroadcastMatchEnded).toHaveBeenCalledTimes(1);
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it("does not fire again when the opponent's match_ended arrives first", async () => {
    const { rerender, onEnded, recorder } = renderLive(0);

    await advanceWithRerenders(AUTO_END_DELAY_MS / 2, rerender);
    act(() => {
      mockSyncParams.current?.onMatchEnded?.();
    });
    await advanceWithRerenders(AUTO_END_DELAY_MS + 5_000, rerender);

    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(recorder.stop).toHaveBeenCalledTimes(1);
    expect(mockBroadcastMatchEnded).not.toHaveBeenCalled();
  });

  it("does not double-fire after a manual END MATCH at 00:00", async () => {
    const { rerender, onEnded, getByText } = renderLive(0);

    await act(async () => {
      fireEvent.press(getByText(/end match/i));
    });
    await advanceWithRerenders(AUTO_END_DELAY_MS + 5_000, rerender);

    expect(mockBroadcastMatchEnded).toHaveBeenCalledTimes(1);
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it("holds while paused at 00:00 and re-arms on resume", async () => {
    const { rerender, onEnded } = renderLive(0);

    act(() => {
      mockSyncParams.current?.onTimerPaused?.(new Date(NOW).toISOString());
    });
    await advanceWithRerenders(AUTO_END_DELAY_MS + 5_000, rerender);
    expect(mockBroadcastMatchEnded).not.toHaveBeenCalled();
    expect(onEnded).not.toHaveBeenCalled();

    act(() => {
      mockSyncParams.current?.onTimerResumed?.(0);
    });
    await advanceWithRerenders(AUTO_END_DELAY_MS + 3_000, rerender);
    expect(mockBroadcastMatchEnded).toHaveBeenCalledTimes(1);
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it("clears the armed timeout on unmount", async () => {
    const { unmount, onEnded } = renderLive(0);

    await act(async () => {
      jest.advanceTimersByTime(AUTO_END_DELAY_MS / 2);
    });
    unmount();
    await act(async () => {
      jest.advanceTimersByTime(AUTO_END_DELAY_MS * 5);
    });

    expect(mockBroadcastMatchEnded).not.toHaveBeenCalled();
    expect(onEnded).not.toHaveBeenCalled();
  });
});

describe("LiveStep mounted into a paused match", () => {
  it("shows RESUME, ticks after the resume tap, and auto-ends once", async () => {
    const { rerender, onEnded, getByText, queryByText } = renderLive(3, 20);

    // Paused on mount: the toggle offers RESUME and the clock is frozen.
    expect(getByText("Resume")).toBeTruthy();
    expect(queryByText("Pause")).toBeNull();
    expect(getByText("00:03")).toBeTruthy();
    await advanceWithRerenders(AUTO_END_DELAY_MS + 5_000, rerender);
    expect(getByText("00:03")).toBeTruthy();
    expect(mockBroadcastMatchEnded).not.toHaveBeenCalled();
    // The 10 s warning is for a ticking clock, not a paused re-entry.
    expect(mockTimeWarning).not.toHaveBeenCalled();

    // Mount-time `now` + 6 s: resume_match adds this pause to the total.
    mockResumeMatch.mockResolvedValue({ ok: true, data: { total_paused_duration: 26 } });
    await act(async () => {
      fireEvent.press(getByText("Resume"));
    });
    expect(mockResumeMatch).toHaveBeenCalledTimes(1);
    expect(mockPauseMatch).not.toHaveBeenCalled();
    expect(getByText("Pause")).toBeTruthy();

    expect(mockTimeWarning).toHaveBeenCalledTimes(1);
    await advanceWithRerenders(1_000, rerender);
    expect(getByText("00:02")).toBeTruthy();

    await advanceWithRerenders(2_000 + AUTO_END_DELAY_MS + 3_000, rerender);
    expect(mockBroadcastMatchEnded).toHaveBeenCalledTimes(1);
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it("ticks and auto-ends once after the opponent's resume broadcast", async () => {
    const { rerender, onEnded, getByText } = renderLive(2, 30);

    await advanceWithRerenders(4_000, rerender);
    expect(getByText("00:02")).toBeTruthy();

    act(() => {
      mockSyncParams.current?.onTimerResumed?.(34);
    });
    await advanceWithRerenders(2_000 + AUTO_END_DELAY_MS + 3_000, rerender);

    expect(mockBroadcastMatchEnded).toHaveBeenCalledTimes(1);
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it("holds at 00:00 while still paused and ends once after resume", async () => {
    const { rerender, onEnded } = renderLive(0, 10);

    await advanceWithRerenders(AUTO_END_DELAY_MS + 5_000, rerender);
    expect(mockBroadcastMatchEnded).not.toHaveBeenCalled();

    act(() => {
      mockSyncParams.current?.onTimerResumed?.(16);
    });
    await advanceWithRerenders(AUTO_END_DELAY_MS + 3_000, rerender);
    expect(mockBroadcastMatchEnded).toHaveBeenCalledTimes(1);
    expect(onEnded).toHaveBeenCalledTimes(1);
  });
});

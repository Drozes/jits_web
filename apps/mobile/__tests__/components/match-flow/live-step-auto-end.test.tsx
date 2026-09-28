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
import { completeHold } from "../../support/complete-hold";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));

const mockPauseMatch = jest.fn();
const mockResumeMatch = jest.fn();
jest.mock("@jits/shared/api/mutations", () => ({
  pauseMatch: (...a: unknown[]) => mockPauseMatch(...a),
  resumeMatch: (...a: unknown[]) => mockResumeMatch(...a),
}));
jest.mock("@jits/shared/api/queries", () => ({ getMatchDetails: jest.fn() }));

const mockBroadcastMatchEnded = jest.fn();
const mockBroadcastTimerPaused = jest.fn();
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
      broadcastTimerPaused: (...a: unknown[]) => mockBroadcastTimerPaused(...a),
      broadcastTimerResumed: jest.fn(),
    };
  },
}));

const mockTimeWarning = jest.fn(() => Promise.resolve());
const mockMatchEnd = jest.fn(() => Promise.resolve());
jest.mock("@/lib/match-flow/use-keep-awake", () => ({ useMatchKeepAwake: () => {} }));
jest.mock("@/lib/match-flow/use-haptics", () => ({
  matchHaptics: {
    matchStart: () => Promise.resolve(),
    matchEnd: () => mockMatchEnd(),
    timeWarning: () => mockTimeWarning(),
  },
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/components/ui/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ textPrimary: "#E8EDF2", textOnAccent: "#FFFFFF", accentCta: "#E5484D" }),
  // The amber PAUSED / TIME captions read the scheme.
  useResolvedColorScheme: () => "dark",
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
import { OPPONENT_ENDED_INTERSTITIAL_MS } from "@/lib/match-flow/live-view-state";
import type { UseVideoRecorderReturn } from "@/lib/video/use-video-recorder";

const NOW = new Date("2026-09-26T12:00:00.000Z").getTime();
const DURATION = 300;

function makeRecorder(granted = false) {
  return {
    state: "idle",
    error: null,
    requestPermission: jest.fn(() => Promise.resolve()),
    permission: { granted, canAskAgain: true },
    start: jest.fn(() => Promise.resolve()),
    stop: jest.fn(() => Promise.resolve()),
  } as unknown as UseVideoRecorderReturn & { stop: jest.Mock };
}

/**
 * Render a live step whose clock has `remainingSeconds` left right now. With
 * `pausedForSeconds`, the step mounts into a match that was paused that many
 * seconds ago with `remainingSeconds` left (cold start / re-entry).
 */
function renderLive(remainingSeconds: number, pausedForSeconds?: number, granted = false) {
  const recorder = makeRecorder(granted);
  const onEnded = jest.fn();
  const pauseMs = (pausedForSeconds ?? 0) * 1000;
  const startedAt = new Date(NOW - pauseMs - (DURATION - remainingSeconds) * 1000).toISOString();
  const pausedAt = pausedForSeconds == null ? null : new Date(NOW - pauseMs).toISOString();
  const element = () => (
    <LiveStep
      matchId="M1"
      matchType="ranked"
      me={{ display_name: "Kai Reyes", current_elo: 1512, current_weight: 77 }}
      opponent={{ display_name: "Mina Park", current_elo: 1498, current_weight: 76 }}
      durationSeconds={DURATION}
      startedAt={startedAt}
      pausedAt={pausedAt}
      totalPausedDuration={0}
      recorder={recorder}
      // A fresh inline callback per render, like the match-step renderer.
      onEnded={(s: number) => onEnded(s)}
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
  mockBroadcastTimerPaused.mockClear();
  mockTimeWarning.mockClear();
  mockMatchEnd.mockClear();
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

  it("disables the hold at 00:00 (auto-end owns it) and still ends exactly once", async () => {
    const { rerender, onEnded, getByTestId } = renderLive(0);

    const end = getByTestId("live-end");
    expect(end).toHaveTextContent("ENDING");
    expect(end.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    await act(async () => {
      completeHold(getByTestId("live-end"));
    });
    expect(mockBroadcastMatchEnded).not.toHaveBeenCalled();
    // Pause stays live at time up: it is how the timekeeper holds the end.
    expect(getByTestId("live-pause-toggle").props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: false }),
    );
    await advanceWithRerenders(AUTO_END_DELAY_MS + 5_000, rerender);

    expect(mockBroadcastMatchEnded).toHaveBeenCalledTimes(1);
    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(mockMatchEnd).toHaveBeenCalledTimes(1);
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
    expect(getByText("RESUME")).toBeTruthy();
    expect(queryByText("PAUSE")).toBeNull();
    expect(getByText("00:03")).toBeTruthy();
    await advanceWithRerenders(AUTO_END_DELAY_MS + 5_000, rerender);
    expect(getByText("00:03")).toBeTruthy();
    expect(mockBroadcastMatchEnded).not.toHaveBeenCalled();
    // The 10 s warning is for a ticking clock, not a paused re-entry.
    expect(mockTimeWarning).not.toHaveBeenCalled();

    // Mount-time `now` + 6 s: resume_match adds this pause to the total.
    mockResumeMatch.mockResolvedValue({ ok: true, data: { total_paused_duration: 26 } });
    await act(async () => {
      fireEvent.press(getByText("RESUME"));
    });
    expect(mockResumeMatch).toHaveBeenCalledTimes(1);
    expect(mockPauseMatch).not.toHaveBeenCalled();
    expect(getByText("PAUSE")).toBeTruthy();

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

describe("LiveStep recorder auto-start", () => {
  it("starts recording on entry to a live clock", () => {
    const { recorder } = renderLive(120, undefined, true);
    expect(recorder.start).toHaveBeenCalledTimes(1);
  });

  it("does not record when entering a live step whose clock already ran out", async () => {
    // Re-entering an expired match used to record the second or two before
    // auto-end and upload it as a success, spending the one video row.
    const { recorder, rerender } = renderLive(0, undefined, true);
    await advanceWithRerenders(AUTO_END_DELAY_MS + 2_000, rerender);
    expect(recorder.start).not.toHaveBeenCalled();
  });
});

describe("LiveStep reports the finish time from the match clock", () => {
  it("a completed hold passes the elapsed seconds at hold completion", async () => {
    // 300 s bout with 120 s left: 180 s on the clock.
    const { onEnded, getByTestId } = renderLive(120);
    await act(async () => {
      completeHold(getByTestId("live-end"));
    });
    expect(onEnded).toHaveBeenCalledWith(180);
  });

  it("is pause-aware: a paused clock reports the paused reading", async () => {
    // Paused 40 s ago with 100 s left: the 40 s of pause do not count.
    const { onEnded, getByTestId } = renderLive(100, 40);
    await act(async () => {
      completeHold(getByTestId("live-end"));
    });
    expect(onEnded).toHaveBeenCalledWith(200);
  });

  it("auto-end at 00:00 caps the reading at the duration", async () => {
    const { rerender, onEnded } = renderLive(0);
    await advanceWithRerenders(AUTO_END_DELAY_MS + 3_000, rerender);
    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(onEnded).toHaveBeenCalledWith(DURATION);
  });

  it("the opponent's match_ended passes this device's clock reading", async () => {
    const { rerender, onEnded } = renderLive(250);
    await advanceWithRerenders(5_000, rerender);
    act(() => {
      mockSyncParams.current?.onMatchEnded?.();
    });
    // The reading is taken at receipt, then the opponent-ended plate shows.
    await advanceWithRerenders(OPPONENT_ENDED_INTERSTITIAL_MS, rerender);
    expect(onEnded).toHaveBeenCalledWith(55);
  });

  it("floors the reading at 1 s when ended right at the start", async () => {
    const { onEnded, getByTestId } = renderLive(DURATION);
    await act(async () => {
      completeHold(getByTestId("live-end"));
    });
    expect(onEnded).toHaveBeenCalledWith(1);
  });
});

describe("LiveStep hold to end", () => {
  it("ends once with one haptic at hold completion, then shows ENDING with both buttons dimmed", async () => {
    const { onEnded, getByTestId } = renderLive(120);

    await act(async () => {
      fireEvent(getByTestId("live-end"), "pressIn");
    });
    expect(getByTestId("live-end")).toHaveTextContent("KEEP HOLDING");
    expect(getByTestId("live-strip-hold")).toHaveTextContent(/RELEASE TO CANCEL/);
    expect(mockMatchEnd).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent(getByTestId("live-end"), "longPress");
    });
    // The haptic lands at completion, before the broadcast settles.
    expect(mockMatchEnd).toHaveBeenCalledTimes(1);
    expect(getByTestId("live-end")).toHaveTextContent("ENDING");
    expect(getByTestId("live-end").props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
    expect(getByTestId("live-pause-toggle").props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockBroadcastMatchEnded).toHaveBeenCalledTimes(1);
    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(onEnded).toHaveBeenCalledWith(180);
    // No second whistle once the end path runs.
    expect(mockMatchEnd).toHaveBeenCalledTimes(1);
  });

  it("releasing early does not end and fires no haptic", async () => {
    const { onEnded, getByTestId, queryByTestId, rerender } = renderLive(120);

    await act(async () => {
      fireEvent(getByTestId("live-end"), "pressIn");
    });
    await advanceWithRerenders(500, rerender);
    await act(async () => {
      fireEvent(getByTestId("live-end"), "pressOut");
    });
    await advanceWithRerenders(1_000, rerender);

    expect(onEnded).not.toHaveBeenCalled();
    expect(mockBroadcastMatchEnded).not.toHaveBeenCalled();
    expect(mockMatchEnd).not.toHaveBeenCalled();
    expect(getByTestId("live-end")).toHaveTextContent("HOLD TO END");
    expect(queryByTestId("live-strip-hold")).toBeNull();
  });

  it("paused at 00:00, the hold is enabled and a completed hold ends once", async () => {
    const { onEnded, getByTestId, rerender } = renderLive(0, 10);

    expect(getByTestId("live-strip-paused")).toBeTruthy();
    expect(getByTestId("live-end")).toHaveTextContent("HOLD TO END");
    await act(async () => {
      completeHold(getByTestId("live-end"));
    });
    await advanceWithRerenders(AUTO_END_DELAY_MS + 3_000, rerender);

    expect(mockBroadcastMatchEnded).toHaveBeenCalledTimes(1);
    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(onEnded).toHaveBeenCalledWith(DURATION);
    expect(mockMatchEnd).toHaveBeenCalledTimes(1);
  });

  it("a screen reader 'End match' action ends through the same path", async () => {
    const { onEnded, getByTestId } = renderLive(120);
    await act(async () => {
      fireEvent(getByTestId("live-end"), "accessibilityAction", {
        nativeEvent: { actionName: "activate" },
      });
    });
    expect(mockBroadcastMatchEnded).toHaveBeenCalledTimes(1);
    expect(onEnded).toHaveBeenCalledWith(180);
    expect(mockMatchEnd).toHaveBeenCalledTimes(1);
  });
});

describe("LiveStep opponent-ended interstitial (R-P8)", () => {
  it("stops, freezes and shows the plate, then advances after the interstitial with the receipt reading", async () => {
    const { onEnded, recorder, getByTestId, queryByTestId, getByText, rerender } = renderLive(250, undefined, true);
    await advanceWithRerenders(5_000, rerender);
    act(() => {
      mockSyncParams.current?.onMatchEnded?.();
    });

    expect(recorder.stop).toHaveBeenCalledTimes(1);
    expect(mockMatchEnd).toHaveBeenCalledTimes(1);
    const plate = getByTestId("live-opponent-ended");
    expect(plate.props.accessibilityRole).toBe("alert");
    expect(getByText("MATCH OVER")).toBeTruthy();
    expect(getByText("MINA PARK ENDED THE MATCH")).toBeTruthy();
    expect(getByText("FINAL CLOCK 04:05 OF 05:00")).toBeTruthy();
    expect(getByTestId("live-slab-final")).toBeTruthy();
    expect(getByTestId("live-dim-saving-dim")).toBeTruthy();
    expect(queryByTestId("live-end")).toBeNull();
    expect(queryByTestId("live-pause-toggle")).toBeNull();
    // The recorder double never reached "recording", so nothing is saving.
    expect(getByTestId("live-tally")).toHaveTextContent("NO VIDEO");

    // The clock is frozen on the plate while real time passes.
    await advanceWithRerenders(OPPONENT_ENDED_INTERSTITIAL_MS - 250, rerender);
    expect(getByTestId("live-timer")).toHaveTextContent("04:05");
    expect(onEnded).not.toHaveBeenCalled();

    await advanceWithRerenders(250, rerender);
    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(onEnded).toHaveBeenCalledWith(55);
  });

  it("ignores a second match_ended and auto-end during the interstitial", async () => {
    const { onEnded, recorder, rerender } = renderLive(0);
    act(() => {
      mockSyncParams.current?.onMatchEnded?.();
    });
    act(() => {
      mockSyncParams.current?.onMatchEnded?.();
    });
    await advanceWithRerenders(OPPONENT_ENDED_INTERSTITIAL_MS + AUTO_END_DELAY_MS + 2_000, rerender);

    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(recorder.stop).toHaveBeenCalledTimes(1);
    expect(mockBroadcastMatchEnded).not.toHaveBeenCalled();
    expect(mockMatchEnd).toHaveBeenCalledTimes(1);
  });

  it("no control, auto-start, warning haptic or pause result acts during the interstitial", async () => {
    // A pause RPC is in flight when the opponent's match_ended lands.
    let resolvePause: (v: unknown) => void = () => {};
    mockPauseMatch.mockReturnValue(new Promise((r) => (resolvePause = r)));
    const { onEnded, recorder, getByTestId, queryByTestId, rerender } = renderLive(12);
    await act(async () => {
      fireEvent.press(getByTestId("live-pause-toggle"));
    });
    expect(mockPauseMatch).toHaveBeenCalledTimes(1);

    act(() => {
      mockSyncParams.current?.onMatchEnded?.();
    });
    // No hold or pause to press while the plate shows.
    expect(queryByTestId("live-end")).toBeNull();
    expect(queryByTestId("live-pause-toggle")).toBeNull();

    // The pause resolves after the end: no pause applied or broadcast, no toast.
    await act(async () => {
      resolvePause({ ok: true, data: { paused_at: new Date(NOW).toISOString() } });
    });
    const { toast } = jest.requireMock("@/components/ui/toast") as { toast: { error: jest.Mock } };
    expect(mockBroadcastTimerPaused).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(queryByTestId("live-strip-paused")).toBeNull();

    // Camera permission granted under the plate: recording does not start.
    (recorder as unknown as { permission: { granted: boolean; canAskAgain: boolean } }).permission = {
      granted: true,
      canAskAgain: true,
    };
    // The clock ticks under the plate into the final 10 s and to 00:00.
    await advanceWithRerenders(OPPONENT_ENDED_INTERSTITIAL_MS - 250, rerender);
    expect(recorder.start).not.toHaveBeenCalled();
    expect(mockTimeWarning).not.toHaveBeenCalled();
    expect(onEnded).not.toHaveBeenCalled();

    await advanceWithRerenders(250 + AUTO_END_DELAY_MS + 12_000, rerender);
    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(recorder.stop).toHaveBeenCalledTimes(1);
    expect(recorder.start).not.toHaveBeenCalled();
    expect(mockTimeWarning).not.toHaveBeenCalled();
    expect(mockBroadcastMatchEnded).not.toHaveBeenCalled();
    expect(mockMatchEnd).toHaveBeenCalledTimes(1);
  });

  it("clears the interstitial timeout on unmount", async () => {
    const { onEnded, unmount } = renderLive(200);
    act(() => {
      mockSyncParams.current?.onMatchEnded?.();
    });
    unmount();
    await act(async () => {
      jest.advanceTimersByTime(OPPONENT_ENDED_INTERSTITIAL_MS * 3);
    });
    expect(onEnded).not.toHaveBeenCalled();
  });
});

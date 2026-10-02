/**
 * 3-2-1 before the clock, timed from the server `started_at` so both phones
 * agree; the live step (and so the recorder) mounts only at GO, with the
 * clock started at GO; one `countdownTick` per numeral and one `countdownGo`
 * at GO (replacing the live step's `matchStart`); re-entry past GO skips it;
 * a phone whose clock runs behind never shows it for longer than 3 s.
 * Countdown slam (Adding Flare): numerals drop in from 1.6x and land, the red
 * bar drains to GO; Reduce Motion crossfades (bar still drains), haptics kept.
 */
import * as React from "react";
import { act, render } from "@testing-library/react-native";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("expo-router", () => ({ useRouter: () => ({ dismissTo: jest.fn() }) }));
const mockTick = jest.fn(() => Promise.resolve());
const mockGo = jest.fn(() => Promise.resolve());
const mockMatchStart = jest.fn(() => Promise.resolve());
jest.mock("@/lib/match-flow/use-haptics", () => ({
  matchHaptics: { countdownTick: () => mockTick(), countdownGo: () => mockGo(), matchStart: () => mockMatchStart() },
}));
const mockLiveProps = jest.fn();
jest.mock("@/components/match-flow/steps/live-step", () => ({
  LiveStep: (p: Record<string, unknown>) => {
    mockLiveProps(p);
    const R = require("react");
    const RN = require("react-native");
    return R.createElement(RN.View, { testID: "live-step" });
  },
}));

const mockWindow: { current: { width: number; height: number } } = { current: { width: 390, height: 844 } };
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ ...mockWindow.current, scale: 3, fontScale: 1 }),
}));

import { StyleSheet } from "react-native";
import { getAnimatedStyle } from "react-native-reanimated";
import { __setReduceMotionForTests } from "@/lib/motion";
import {
  COUNTDOWN_MS,
  Countdown,
  GoFlash,
  SLAM_FROM_SCALE,
  SLAM_MS,
  countdownNumeral,
  numeralSize,
} from "@/components/match-flow/countdown/countdown";
import { LiveStage, clockStartFor } from "@/components/match-flow/countdown/live-stage";

const NOW = Date.parse("2026-09-27T12:00:00.000Z");
const who = (name: string) => ({ display_name: name, current_elo: 1500, current_weight: 170 });

function renderStage(startedAtMs: number, recording = true) {
  return render(
    <LiveStage
      matchId="M1"
      me={who("Kai Reyes")}
      opponent={who("Mina Park")}
      durationSeconds={600}
      startedAt={new Date(startedAtMs).toISOString()}
      pausedAt={null}
      totalPausedDuration={0}
      recorder={{} as never}
      recording={recording}
      myWeight={170}
      opponentWeight={168}
      onEnded={jest.fn()}
    />,
  );
}

beforeEach(() => {
  mockWindow.current = { width: 390, height: 844 };
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  jest.clearAllMocks();
});
afterEach(() => {
  __setReduceMotionForTests(false);
  jest.useRealTimers();
});

describe("countdown math", () => {
  it("numerals by time left", () => {
    expect(countdownNumeral(3000)).toBe(3);
    expect(countdownNumeral(2001)).toBe(3);
    expect(countdownNumeral(2000)).toBe(2);
    expect(countdownNumeral(1)).toBe(1);
    expect(countdownNumeral(0)).toBe(0);
    expect(countdownNumeral(9000)).toBe(3);
  });

  it("the clock starts at GO: started_at + 3 s", () => {
    expect(clockStartFor("2026-09-27T12:00:00.000Z")).toBe("2026-09-27T12:00:03.000Z");
    expect(clockStartFor("not a date")).toBe("not a date");
  });
});

describe("LiveStage", () => {
  it("counts 3-2-1 from the server start, then mounts live at GO with the shifted clock", () => {
    const s = renderStage(NOW);
    s.getByTestId("match-countdown");
    expect(s.getByTestId("countdown-numeral")).toHaveTextContent("3");
    s.getByText("REC ARMS AT GO");
    expect(s.queryByText("RANKED")).toBeNull();
    expect(mockLiveProps).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    expect(s.getByTestId("countdown-numeral")).toHaveTextContent("2");
    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    expect(s.getByTestId("countdown-numeral")).toHaveTextContent("1");
    expect(mockTick).toHaveBeenCalledTimes(3);
    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    s.getByTestId("live-step");
    expect(s.queryByTestId("match-countdown")).toBeNull();
    s.getByText("GRAPPLE");
    const props = mockLiveProps.mock.calls.at(-1)?.[0];
    expect(props.startedAt).toBe(new Date(NOW + COUNTDOWN_MS).toISOString());
    expect(props.recordingEnabled).toBe(true);
    act(() => {
      jest.advanceTimersByTime(800);
    });
    expect(s.queryByText("GRAPPLE")).toBeNull();
  });

  it("the second phone, joining late, reaches GO at the same moment", () => {
    // timer_started arrived 1.4 s after the server start.
    const s = renderStage(NOW - 1_400);
    expect(s.getByTestId("countdown-numeral")).toHaveTextContent("2");
    act(() => {
      jest.advanceTimersByTime(1_600);
    });
    s.getByTestId("live-step");
  });

  it("re-entering a match already past GO goes straight to live", () => {
    const s = renderStage(NOW - 60_000);
    s.getByTestId("live-step");
    expect(s.queryByTestId("match-countdown")).toBeNull();
    expect(mockTick).not.toHaveBeenCalled();
    // No countdown ran, so GO's haptic is the live step's own matchStart.
    expect(mockGo).not.toHaveBeenCalled();
    expect(mockLiveProps.mock.calls.at(-1)?.[0].startHaptic).toBe(true);
  });

  it("never runs longer than one countdown on a phone whose clock is behind", () => {
    // The server start looks 10 s in the future on this phone.
    const s = renderStage(NOW + 10_000);
    act(() => {
      jest.advanceTimersByTime(COUNTDOWN_MS);
    });
    s.getByTestId("live-step");
  });

  it("not recording: says so, and live mounts with recording off", () => {
    const s = renderStage(NOW, false);
    s.getByText("NOT RECORDING");
    act(() => {
      jest.advanceTimersByTime(COUNTDOWN_MS);
    });
    expect(mockLiveProps.mock.calls.at(-1)?.[0].recordingEnabled).toBe(false);
  });
});

describe("orientation", () => {
  const fontSize = (el: { props: { style?: unknown } }) =>
    (StyleSheet.flatten(el.props.style as never) as { fontSize?: number }).fontSize;

  it("portrait: the 240 numeral, the caption and the athlete chip", () => {
    const s = renderStage(NOW);
    expect(fontSize(s.getByTestId("countdown-numeral"))).toBe(240);
    s.getByText("SYNCED TO SERVER CLOCK \u00b7 BOTH PHONES");
    s.getByTestId("countdown-chip");
    s.getByTestId("countdown-progress");
  });

  it("landscape: the numeral fits the height, no caption or chip to overlap it", () => {
    mockWindow.current = { width: 844, height: 390 };
    const s = renderStage(NOW);
    const size = fontSize(s.getByTestId("countdown-numeral"))!;
    expect(size).toBe(numeralSize(390));
    expect(size).toBeLessThan(390 * 0.6);
    expect(s.queryByText("SYNCED TO SERVER CLOCK \u00b7 BOTH PHONES")).toBeNull();
    expect(s.queryByTestId("countdown-chip")).toBeNull();
    s.getByTestId("countdown-progress");
  });

  it("numeral size is capped and floored", () => {
    expect(numeralSize(2000)).toBe(240);
    expect(numeralSize(100)).toBe(96);
  });
});

type Styled = { transform?: Array<Record<string, number>>; opacity?: number };
const animated = (el: unknown) => getAnimatedStyle(el as never) as Styled;
const scaleOf = (el: unknown) => animated(el).transform?.find((t) => "scale" in t)?.scale;
const scaleXOf = (el: unknown) => animated(el).transform?.find((t) => "scaleX" in t)?.scaleX;
/** Advance in frame-sized steps so Reanimated's frame callbacks keep up. */
function advance(ms: number) {
  for (let t = 0; t < ms; t += 16) {
    act(() => {
      jest.advanceTimersByTime(Math.min(16, ms - t));
    });
  }
}

describe("countdown slam haptics", () => {
  it("one countdownTick per numeral, one countdownGo at GO that replaces the live step's matchStart", () => {
    renderStage(NOW);
    expect(mockTick).toHaveBeenCalledTimes(1);
    advance(2_000);
    expect(mockTick).toHaveBeenCalledTimes(3);
    expect(mockGo).not.toHaveBeenCalled();
    advance(1_000);
    expect(mockTick).toHaveBeenCalledTimes(3);
    expect(mockGo).toHaveBeenCalledTimes(1);
    expect(mockLiveProps.mock.calls.at(-1)?.[0].startHaptic).toBe(false);
    // LiveStage itself never fires matchStart for the same moment.
    expect(mockMatchStart).not.toHaveBeenCalled();
    advance(1_000);
    expect(mockGo).toHaveBeenCalledTimes(1);
  });

  it("the total length is unchanged: live mounts at exactly 3 s, not before", () => {
    const s = renderStage(NOW);
    act(() => {
      jest.advanceTimersByTime(COUNTDOWN_MS - 1);
    });
    expect(s.queryByTestId("live-step")).toBeNull();
    expect(mockGo).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    s.getByTestId("live-step");
    expect(mockGo).toHaveBeenCalledTimes(1);
  });

  it("haptics are kept under Reduce Motion", () => {
    __setReduceMotionForTests(true);
    renderStage(NOW);
    advance(COUNTDOWN_MS);
    expect(mockTick).toHaveBeenCalledTimes(3);
    expect(mockGo).toHaveBeenCalledTimes(1);
  });
});

describe("countdown slam motion", () => {
  const props = {
    recording: true,
    me: who("Kai Reyes"),
    opponent: who("Mina Park"),
    myWeight: 170,
    opponentWeight: 168,
  } as const;

  it("each numeral drops in from 1.6x and lands in about 140 ms", () => {
    const s = render(<Countdown goAt={NOW + COUNTDOWN_MS} {...props} />);
    // The first frame of the slam: big and transparent.
    expect(scaleOf(s.getByTestId("countdown-numeral-slam"))).toBeCloseTo(SLAM_FROM_SCALE);
    advance(SLAM_MS + 32);
    expect(scaleOf(s.getByTestId("countdown-numeral-slam"))).toBeCloseTo(1);
    expect(animated(s.getByTestId("countdown-numeral-slam")).opacity).toBeCloseTo(1);
    // The next numeral slams again.
    advance(1_000 - SLAM_MS - 32);
    expect(s.getByTestId("countdown-numeral")).toHaveTextContent("2");
    expect(scaleOf(s.getByTestId("countdown-numeral-slam"))).toBeCloseTo(SLAM_FROM_SCALE);
    advance(SLAM_MS + 32);
    expect(scaleOf(s.getByTestId("countdown-numeral-slam"))).toBeCloseTo(1);
    expect(s.queryByTestId("countdown-numeral-out")).toBeNull();
  });

  it("the red bar drains from full to empty by GO", () => {
    const s = render(<Countdown goAt={NOW + COUNTDOWN_MS} {...props} />);
    const bar = () => s.getByTestId("countdown-progress");
    expect(scaleXOf(bar())).toBeCloseTo(1);
    expect(StyleSheet.flatten(bar().props.style as never)).toMatchObject({ backgroundColor: "#E63946" });
    advance(1_500);
    expect(scaleXOf(bar())).toBeGreaterThan(0.4);
    expect(scaleXOf(bar())).toBeLessThan(0.6);
    advance(1_500);
    expect(scaleXOf(bar())).toBeCloseTo(0);
  });

  it("a re-render with the same numeral neither replays the slam nor buzzes", () => {
    const s = render(<Countdown goAt={NOW + COUNTDOWN_MS} {...props} />);
    advance(SLAM_MS + 32);
    expect(mockTick).toHaveBeenCalledTimes(1);
    s.rerender(<Countdown goAt={NOW + COUNTDOWN_MS} {...props} recording={false} />);
    s.getByText("NOT RECORDING");
    expect(scaleOf(s.getByTestId("countdown-numeral-slam"))).toBeCloseTo(1);
    expect(mockTick).toHaveBeenCalledTimes(1);
  });

  it("Reduce Motion: no slam, the numerals crossfade, the bar still drains linearly", () => {
    __setReduceMotionForTests(true);
    const s = render(<Countdown goAt={NOW + COUNTDOWN_MS} {...props} />);
    expect(scaleOf(s.getByTestId("countdown-numeral-slam"))).toBe(1);
    expect(animated(s.getByTestId("countdown-numeral-slam")).opacity).toBe(1);
    expect(s.queryByTestId("countdown-numeral-out")).toBeNull();
    expect(scaleXOf(s.getByTestId("countdown-progress"))).toBeCloseTo(1);
    advance(1_000);
    expect(s.getByTestId("countdown-numeral")).toHaveTextContent("2");
    // The outgoing 3 fades out over the incoming 2; nothing scales.
    expect(s.getByTestId("countdown-numeral-outgoing")).toHaveTextContent("3");
    expect(scaleOf(s.getByTestId("countdown-numeral-slam"))).toBe(1);
    expect(scaleXOf(s.getByTestId("countdown-progress"))).toBeCloseTo(2 / 3, 1);
    advance(320);
    // The fade is done and the outgoing layer is gone.
    expect(s.queryByTestId("countdown-numeral-out")).toBeNull();
    expect(animated(s.getByTestId("countdown-numeral-slam")).opacity).toBeCloseTo(1);
    advance(1_680);
    expect(scaleXOf(s.getByTestId("countdown-progress"))).toBeCloseTo(0);
  });

  it("Reduce Motion: a parent re-render mid-fade does not cut the crossfade short", () => {
    __setReduceMotionForTests(true);
    const s = render(<Countdown goAt={NOW + COUNTDOWN_MS} {...props} />);
    advance(1_000);
    s.getByTestId("countdown-numeral-outgoing");
    s.rerender(<Countdown goAt={NOW + COUNTDOWN_MS} {...props} recording={false} />);
    s.getByText("NOT RECORDING");
    expect(s.getByTestId("countdown-numeral-outgoing")).toHaveTextContent("3");
    advance(96);
    s.getByTestId("countdown-numeral-outgoing");
    advance(200);
    expect(s.queryByTestId("countdown-numeral-outgoing")).toBeNull();
    expect(mockTick).toHaveBeenCalledTimes(2);
  });

  it.each([false, true])("re-entry mid-countdown paints the true fraction left on the first frame (reduce motion %s)", (rm) => {
    __setReduceMotionForTests(rm);
    const s = render(<Countdown goAt={NOW + 1_500} {...props} />);
    expect(scaleXOf(s.getByTestId("countdown-progress"))).toBeCloseTo(0.5);
    expect(s.getByTestId("countdown-numeral")).toHaveTextContent("2");
  });

  it("GO (GRAPPLE, red) slams in too; still under Reduce Motion", () => {
    const s = render(<GoFlash />);
    expect(scaleOf(s.getByTestId("countdown-go-slam"))).toBeCloseTo(SLAM_FROM_SCALE);
    advance(SLAM_MS + 32);
    expect(scaleOf(s.getByTestId("countdown-go-slam"))).toBeCloseTo(1);
    s.unmount();
    __setReduceMotionForTests(true);
    const r = render(<GoFlash />);
    expect(scaleOf(r.getByTestId("countdown-go-slam"))).toBe(1);
    // The GO haptic belongs to LiveStage, so the flash never buzzes.
    expect(mockGo).not.toHaveBeenCalled();
  });
});

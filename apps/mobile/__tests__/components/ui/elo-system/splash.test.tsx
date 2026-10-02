/**
 * Launch splash Motion Rule hygiene (WP6: R3 SP-1, SP-2, SP-3). Reduce Motion
 * is read with useReduceMotion() on the first frame; the climb's odometer is
 * RollingNumber (no requestAnimationFrame + setState loop); the Statement
 * glow plays once; every variant still dismisses at the same moment.
 */
import * as React from "react";
import { act, render } from "@testing-library/react-native";
import { SPLASH_GLOW_STATEMENT, SPLASH_REVEAL, SPLASH_STATEMENT } from "@jits/shared/constants";
import { __setReduceMotionForTests } from "@/lib/motion";

const mockImpact = jest.fn(() => Promise.resolve());
jest.mock("expo-haptics", () => ({
  impactAsync: () => mockImpact(),
  ImpactFeedbackStyle: { Heavy: "heavy" },
}));
jest.mock("expo-splash-screen", () => ({ hideAsync: () => Promise.resolve() }));
jest.mock("react-native-svg", () => {
  const R = require("react");
  const RN = require("react-native");
  const stub = (p: { children?: React.ReactNode }) => R.createElement(RN.View, null, p.children);
  return { __esModule: true, default: stub, Svg: stub, G: stub, Path: stub, Rect: stub };
});

import { SplashReveal } from "@/components/ui/elo-system/splash-reveal";
import { SplashStatement } from "@/components/ui/elo-system/splash-statement";
import { SplashGlowStatement } from "@/components/ui/elo-system/splash-glow-statement";

/** Advance in frame-sized steps so Reanimated's frame callbacks keep up. */
function advance(ms: number) {
  for (let t = 0; t < ms; t += 16) {
    act(() => {
      jest.advanceTimersByTime(Math.min(16, ms - t));
    });
  }
}


beforeEach(() => {
  jest.useFakeTimers();
  mockImpact.mockClear();
});

afterEach(() => {
  act(() => __setReduceMotionForTests(false));
  jest.useRealTimers();
});

describe("SplashReveal (climb)", () => {
  it("rolls the odometer with RollingNumber (UI-thread digit columns) and lands on the target", () => {
    const onDone = jest.fn();
    const s = render(<SplashReveal targetElo={1481} onDone={onDone} />);
    // Mid-roll: digit columns under one labeled view; VoiceOver reads only the final value.
    advance(SPLASH_REVEAL.NUMBER_DELAY_MS + SPLASH_REVEAL.NUMBER_ROLL_MS / 2);
    const rolling = s.getByTestId("splash-odometer");
    expect(rolling.props.accessibilityLabel).toBe("1481");
    expect(rolling.props.accessibilityRole).toBe("text");
    advance(SPLASH_REVEAL.NUMBER_ROLL_MS / 2 + 200);
    expect(s.getByTestId("splash-odometer")).toHaveTextContent("1481");
    s.unmount();
  });

  it("dismisses at TOTAL_MS with one Heavy haptic on the wordmark beat", () => {
    const onDone = jest.fn();
    render(<SplashReveal targetElo={1481} onDone={onDone} />);
    advance(SPLASH_REVEAL.WORDMARK_DELAY_MS + 16);
    expect(mockImpact).toHaveBeenCalledTimes(1);
    act(() => {
      jest.advanceTimersByTime(SPLASH_REVEAL.TOTAL_MS - SPLASH_REVEAL.WORDMARK_DELAY_MS - 64);
    });
    expect(onDone).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(64);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("Reduce Motion on the first frame: the final number at once, resting frame, still dismisses", () => {
    act(() => __setReduceMotionForTests(true));
    const onDone = jest.fn();
    const s = render(<SplashReveal targetElo={1481} onDone={onDone} />);
    expect(s.getByTestId("splash-odometer")).toHaveTextContent("1481");
    act(() => {
      jest.advanceTimersByTime(SPLASH_REVEAL.REDUCED_MOTION_HOLD_MS);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(mockImpact).not.toHaveBeenCalled();
  });

  it("Reduce Motion switched on mid-reveal snaps to the final number and keeps the dismiss moment", () => {
    const onDone = jest.fn();
    const s = render(<SplashReveal targetElo={1481} onDone={onDone} />);
    advance(SPLASH_REVEAL.NUMBER_DELAY_MS + 100);
    act(() => __setReduceMotionForTests(true));
    expect(s.getByTestId("splash-odometer")).toHaveTextContent("1481");
    act(() => {
      jest.advanceTimersByTime(SPLASH_REVEAL.TOTAL_MS);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe("SplashStatement", () => {
  it("plays the glow once and dismisses after TOTAL_MS + the fade out (no endless loop)", () => {
    const onDone = jest.fn();
    render(<SplashStatement onDone={onDone} />);
    advance(SPLASH_STATEMENT.TOTAL_MS - 32);
    expect(onDone).not.toHaveBeenCalled();
    advance(SPLASH_STATEMENT.FADEOUT_MS + 96);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(mockImpact).toHaveBeenCalledTimes(1);
    // Only finite timings remain: once the breathe has run, nothing is left to tick.
    advance(SPLASH_STATEMENT.GLOW_BREATHE_MS + 200);
    expect(jest.getTimerCount()).toBe(0);
  });

  it("Reduce Motion: fades the resting frame in, no haptic, dismisses after the hold + fade", () => {
    act(() => __setReduceMotionForTests(true));
    const onDone = jest.fn();
    render(<SplashStatement onDone={onDone} />);
    advance(SPLASH_STATEMENT.REDUCED_MOTION_FADEIN_MS + SPLASH_STATEMENT.REDUCED_MOTION_HOLD_MS + SPLASH_STATEMENT.FADEOUT_MS + 96);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(mockImpact).not.toHaveBeenCalled();
  });
});

describe("SplashGlowStatement", () => {
  it("dismisses after TOTAL_MS + the fade out with one Heavy haptic", () => {
    const onDone = jest.fn();
    render(<SplashGlowStatement onDone={onDone} />);
    advance(SPLASH_GLOW_STATEMENT.TOTAL_MS - 32);
    expect(onDone).not.toHaveBeenCalled();
    advance(SPLASH_GLOW_STATEMENT.FADEOUT_MS + 96);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(mockImpact).toHaveBeenCalledTimes(1);
  });

  it("Reduce Motion on the first frame: no mark, no haptic, still dismisses", () => {
    act(() => __setReduceMotionForTests(true));
    const onDone = jest.fn();
    render(<SplashGlowStatement onDone={onDone} />);
    advance(
      SPLASH_GLOW_STATEMENT.REDUCED_MOTION_FADEIN_MS + SPLASH_GLOW_STATEMENT.REDUCED_MOTION_HOLD_MS + SPLASH_GLOW_STATEMENT.FADEOUT_MS + 96,
    );
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(mockImpact).not.toHaveBeenCalled();
  });
});

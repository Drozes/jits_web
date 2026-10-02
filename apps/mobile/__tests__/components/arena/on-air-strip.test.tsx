/**
 * ON AIR strip (Adding Flare [06.3]): while live, an ON AIR tally that fills
 * on a real go-live, and a heartbeat that beats on the shared tempo clock.
 */
import * as React from "react";
import { act, render } from "@testing-library/react-native";
import { AppState } from "react-native";

jest.mock("react-native-reanimated", () => {
  const mock = require("react-native-reanimated/mock");
  return { ...mock, withTiming: jest.fn(mock.withTiming) };
});
jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ statePositive: "#22C55E" }),
}));
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
}));

import * as Haptics from "expo-haptics";
import { withTiming } from "react-native-reanimated";
import { OnAirStrip, beatLevel } from "@/components/arena/on-air-strip";
import {
  __resetArenaTempoForTests,
  getTempoClock,
  isTempoClockRunning,
} from "@/lib/arena/arena-tempo";
import { duration, __setReduceMotionForTests, __resetAppActiveForTests } from "@/lib/motion";

const mockWithTiming = withTiming as jest.Mock;

beforeEach(() => {
  __resetArenaTempoForTests();
  __resetAppActiveForTests();
  __setReduceMotionForTests(false);
  Object.defineProperty(AppState, "currentState", { value: "active", configurable: true, writable: true });
  jest.clearAllMocks();
});

function style(node: { props: { style?: unknown } }): Record<string, unknown> {
  const parts = ([] as unknown[]).concat(node.props.style).flat().filter(Boolean) as Record<string, unknown>[];
  return Object.assign({}, ...parts);
}

/** Calls that animate the tally fill (to 1 over `duration.slow`). */
function fillCalls() {
  return mockWithTiming.mock.calls.filter(
    ([to, cfg]) => to === 1 && (cfg as { duration?: number } | undefined)?.duration === duration.slow,
  );
}

describe("OnAirStrip", () => {
  it("shows nothing while offline and holds no clock", () => {
    const r = render(<OnAirStrip isLive={false} />);
    expect(r.queryByTestId("arena-on-air")).toBeNull();
    expect(isTempoClockRunning()).toBe(false);
  });

  it("while live: the ON AIR tally and the heartbeat, on the shared clock", () => {
    const r = render(<OnAirStrip isLive />);
    const strip = r.getByTestId("arena-on-air");
    expect(strip.props.accessibilityLabel).toBe("On air");
    expect(r.getByText("On air")).toBeTruthy();
    expect(isTempoClockRunning()).toBe(true);
  });

  it("never uses the harness's Go live / Go offline words", () => {
    const r = render(<OnAirStrip isLive />);
    expect(r.queryByText(/go live|go offline/i)).toBeNull();
    expect(r.queryByLabelText(/go live|go offline/i)).toBeNull();
  });

  it("mounting while already live shows the tally filled, never replays", () => {
    const r = render(<OnAirStrip isLive />);
    expect(fillCalls()).toHaveLength(0);
    expect(style(r.getByTestId("arena-on-air-fill", { includeHiddenElements: true })).transform).toEqual([{ scaleX: 1 }]);
    r.rerender(<OnAirStrip isLive />);
    expect(fillCalls()).toHaveLength(0);
  });

  it("the tally fills once when live flips false to true", () => {
    const r = render(<OnAirStrip isLive={false} />);
    r.rerender(<OnAirStrip isLive />);
    expect(fillCalls()).toHaveLength(1);
    r.rerender(<OnAirStrip isLive />);
    expect(fillCalls()).toHaveLength(1);
    // Off and on again is a new go-live.
    r.rerender(<OnAirStrip isLive={false} />);
    r.rerender(<OnAirStrip isLive />);
    expect(fillCalls()).toHaveLength(2);
  });

  it("the heartbeat lights on the beat and rests dim between beats", () => {
    const r = render(<OnAirStrip isLive />);
    act(() => {
      getTempoClock().value = 0;
    });
    r.rerender(<OnAirStrip isLive />);
    expect(style(r.getByTestId("arena-on-air-beat", { includeHiddenElements: true })).opacity).toBe(1);
    act(() => {
      getTempoClock().value = 0.6;
    });
    r.rerender(<OnAirStrip isLive />);
    expect(style(r.getByTestId("arena-on-air-beat", { includeHiddenElements: true })).opacity).toBe(0);
    expect(beatLevel(0.1)).toBeGreaterThan(0);
    expect(beatLevel(0.1)).toBeLessThan(1);
  });

  it("Reduce Motion: tally filled at once, the full trace static, no clock", () => {
    __setReduceMotionForTests(true);
    const r = render(<OnAirStrip isLive={false} />);
    r.rerender(<OnAirStrip isLive />);
    expect(fillCalls()).toHaveLength(0);
    expect(style(r.getByTestId("arena-on-air-fill", { includeHiddenElements: true })).transform).toEqual([{ scaleX: 1 }]);
    act(() => {
      getTempoClock().value = 0.6;
    });
    r.rerender(<OnAirStrip isLive />);
    expect(style(r.getByTestId("arena-on-air-beat", { includeHiddenElements: true })).opacity).toBe(1);
    expect(isTempoClockRunning()).toBe(false);
  });

  it("is silent: no haptic for going on air or the heartbeat", () => {
    const r = render(<OnAirStrip isLive={false} />);
    r.rerender(<OnAirStrip isLive />);
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
  });
});

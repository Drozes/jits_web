/**
 * LIVE pill pace (Adding Flare review): live-in-Arena dots follow the shared
 * lobby tempo clock; match-meaning pills (the match screen's LIVE, a sent
 * challenge) keep the fixed `duration.pulse` cycle.
 */
import * as React from "react";
import { act, render } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";

jest.mock("react-native-reanimated", () => {
  const mock = require("react-native-reanimated/mock");
  return { ...mock, withRepeat: jest.fn(mock.withRepeat) };
});

import { withRepeat } from "react-native-reanimated";
import { LiveDot, LivePill } from "@/components/ui/elo-system/live-pill";
import { __resetArenaTempoForTests, isTempoClockRunning } from "@/lib/arena/arena-tempo";
import { duration, __setReduceMotionForTests, __resetAppActiveForTests } from "@/lib/motion";

const mockWithRepeat = withRepeat as jest.Mock;
let listeners: Array<(s: AppStateStatus) => void> = [];

beforeEach(() => {
  __resetArenaTempoForTests();
  __resetAppActiveForTests();
  __setReduceMotionForTests(false);
  listeners = [];
  Object.defineProperty(AppState, "currentState", { value: "active", configurable: true, writable: true });
  jest.spyOn(AppState, "addEventListener").mockImplementation(((_t: string, l: (s: AppStateStatus) => void) => {
    listeners.push(l);
    return { remove: () => (listeners = listeners.filter((x) => x !== l)) };
  }) as never);
  mockWithRepeat.mockClear();
});

afterEach(() => jest.restoreAllMocks());

/** withRepeat calls whose inner timing runs the fixed 1400 ms cycle. */
function fixedLoops() {
  return mockWithRepeat.mock.calls.length;
}

describe("LiveDot / LivePill pace", () => {
  it("arena pace (default) holds the shared tempo clock", () => {
    render(<LivePill label="Live" />);
    expect(isTempoClockRunning()).toBe(true);
  });

  it("fixed pace never holds the tempo clock and runs its own 1400 ms loop", () => {
    const { withTiming } = jest.requireActual("react-native-reanimated/mock");
    expect(withTiming).toBeDefined();
    render(<LivePill label="Sent" pace="fixed" />);
    expect(isTempoClockRunning()).toBe(false);
    expect(fixedLoops()).toBe(1);
    expect(duration.pulse).toBe(1400);
  });

  it("fixed pace is static under Reduce Motion", () => {
    __setReduceMotionForTests(true);
    const r = render(<LiveDot testID="dot" pace="fixed" />);
    expect(fixedLoops()).toBe(0);
    const style = Object.assign(
      {},
      ...([] as unknown[]).concat(r.getByTestId("dot", { includeHiddenElements: true }).props.style).filter(Boolean),
    ) as { opacity: number };
    expect(style.opacity).toBe(1);
  });

  it("fixed pace stops in the background and restarts on foreground", () => {
    render(<LiveDot pace="fixed" />);
    expect(fixedLoops()).toBe(1);
    act(() => listeners.forEach((l) => l("background")));
    act(() => listeners.forEach((l) => l("active")));
    expect(fixedLoops()).toBe(2);
  });
});

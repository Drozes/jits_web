/**
 * Steel sheen (Motion Rule, Ambient tier): mounted only while its action
 * waits on this user, nothing under Reduce Motion, takes no touches, rests
 * about 2s then sweeps across in 800ms, and pauses while the app is in the
 * background (restarting on foreground). Silent.
 */
import * as React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import { AppState } from "react-native";
import { getAnimatedStyle } from "react-native-reanimated";

const mockHaptic = jest.fn(() => Promise.resolve());
jest.mock("@/lib/motion/haptics", () => ({
  haptics: new Proxy({}, { get: () => () => mockHaptic() }),
}));

import { SHEEN_REST_MS, SHEEN_SWEEP_MS, SteelSheen } from "@/components/ui/steel-sheen";
import { __resetAppActiveForTests, __setReduceMotionForTests } from "@/lib/motion";

const HIDDEN = { includeHiddenElements: true } as const;
let listeners: Array<(s: string) => void> = [];

function emit(state: string) {
  act(() => {
    for (const l of [...listeners]) l(state);
  });
}

function bandX(screen: ReturnType<typeof render>): number {
  const style = getAnimatedStyle(screen.getByTestId("steel-sheen-band", HIDDEN)) as {
    transform?: { translateX?: number }[];
  };
  return (style.transform ?? []).find((t) => t.translateX !== undefined)?.translateX ?? NaN;
}

function layout(screen: ReturnType<typeof render>, width = 200) {
  fireEvent(screen.getByTestId("steel-sheen", HIDDEN), "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width, height: 56 } },
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  mockHaptic.mockClear();
  listeners = [];
  __resetAppActiveForTests();
  __setReduceMotionForTests(false);
  Object.defineProperty(AppState, "currentState", { value: "active", configurable: true, writable: true });
  jest.spyOn(AppState, "addEventListener").mockImplementation(((_t: string, l: (s: string) => void) => {
    listeners.push(l);
    return { remove: () => (listeners = listeners.filter((x) => x !== l)) };
  }) as unknown as typeof AppState.addEventListener);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  __setReduceMotionForTests(false);
});

describe("SteelSheen", () => {
  it("is drawn only while active", () => {
    const screen = render(<SteelSheen active={false} />);
    expect(screen.queryByTestId("steel-sheen", HIDDEN)).toBeNull();
    screen.rerender(<SteelSheen active />);
    expect(screen.getByTestId("steel-sheen", HIDDEN).props.pointerEvents).toBe("none");
    screen.rerender(<SteelSheen active={false} />);
    expect(screen.queryByTestId("steel-sheen", HIDDEN)).toBeNull();
  });

  it("draws nothing under Reduce Motion", () => {
    __setReduceMotionForTests(true);
    const screen = render(<SteelSheen active />);
    expect(screen.queryByTestId("steel-sheen", HIDDEN)).toBeNull();
  });

  it("rests, then sweeps across the button, and repeats", () => {
    const screen = render(<SteelSheen active />);
    const parked = bandX(screen);
    expect(parked).toBeLessThan(0);
    layout(screen, 200);

    // Resting: still parked off the left edge.
    act(() => jest.advanceTimersByTime(SHEEN_REST_MS - 100));
    expect(bandX(screen)).toBe(parked);

    // Mid-sweep, then fully across the right edge.
    act(() => jest.advanceTimersByTime(100 + SHEEN_SWEEP_MS / 2));
    expect(bandX(screen)).toBeGreaterThan(parked);
    act(() => jest.advanceTimersByTime(SHEEN_SWEEP_MS / 2 - 16));
    expect(bandX(screen)).toBeGreaterThan(150);

    // Back to the park for the next rest.
    act(() => jest.advanceTimersByTime(100));
    expect(bandX(screen)).toBe(parked);
  });

  it("pauses in the background and restarts on foreground", () => {
    const screen = render(<SteelSheen active />);
    const parked = bandX(screen);
    layout(screen, 200);

    emit("background");
    act(() => jest.advanceTimersByTime(SHEEN_REST_MS + SHEEN_SWEEP_MS / 2));
    expect(bandX(screen)).toBe(parked);

    emit("active");
    act(() => jest.advanceTimersByTime(SHEEN_REST_MS + SHEEN_SWEEP_MS / 2));
    expect(bandX(screen)).toBeGreaterThan(parked);
  });

  it("never buzzes", () => {
    const screen = render(<SteelSheen active />);
    layout(screen, 200);
    act(() => jest.advanceTimersByTime((SHEEN_REST_MS + SHEEN_SWEEP_MS) * 3));
    expect(mockHaptic).not.toHaveBeenCalled();
  });
});

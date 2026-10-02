/**
 * The odometer ELO roll (Adding Flare, jits-pddd.4).
 *
 * - The odometer math: only the digits that change move; a higher column
 *   moves only while the columns below it carry from 9 to 0.
 * - Digit-count changes (999 to 1003) get a leading blank column.
 * - It lands as a plain Text with the final value; the label is always final.
 * - `onLanded` fires once, after the delay plus the roll; never without play.
 * - Reduce Motion and `play` false show the final value from the first frame.
 * - `usePlayOnce` plays a key once per app run.
 */
import * as React from "react";
import { Text } from "react-native";
import { act, render } from "@testing-library/react-native";
import {
  ROLL_MS,
  RollingNumber,
  odometerPosition,
  usePlayOnce,
  __resetPlayedMomentsForTests,
} from "@/components/ui/elo-system/rolling-number";
import { __setReduceMotionForTests, duration } from "@/lib/motion";

const STYLE = { fontSize: 22, lineHeight: 26 };

beforeEach(() => {
  jest.useFakeTimers();
  __setReduceMotionForTests(false);
  __resetPlayedMomentsForTests();
});
afterEach(() => {
  jest.useRealTimers();
  __setReduceMotionForTests(false);
});

describe("odometerPosition", () => {
  it("puts each column on its digit at rest", () => {
    expect(odometerPosition(1512, 0)).toBe(2);
    expect(odometerPosition(1512, 1)).toBe(1);
    expect(odometerPosition(1512, 2)).toBe(5);
    expect(odometerPosition(1512, 3)).toBe(1);
  });

  it("moves a higher column only during the carry (unchanged digits stay put)", () => {
    // 1512 -> 1526 halfway through a step: ones and tens move, hundreds do not.
    expect(odometerPosition(1519.5, 0)).toBeCloseTo(9.5);
    expect(odometerPosition(1519.5, 1)).toBeCloseTo(1.5);
    expect(odometerPosition(1519.5, 2)).toBe(5);
    expect(odometerPosition(1514.3, 1)).toBe(1);
    expect(odometerPosition(1514.3, 3)).toBe(1);
  });

  it("carries across every column from 999 to 1000, either direction", () => {
    for (const k of [0, 1, 2]) expect(odometerPosition(999.5, k)).toBeCloseTo(9.5);
    expect(odometerPosition(999.5, 3)).toBeCloseTo(0.5);
    expect(odometerPosition(1000, 3)).toBe(1);
    expect(odometerPosition(999, 3)).toBe(0);
  });
});

describe("RollingNumber", () => {
  it("rolls with the duration within the slow ceiling", () => {
    expect(ROLL_MS).toBeLessThanOrEqual(duration.slow);
  });

  it("draws one column per digit with a leading blank on a digit-count change, then lands on the final Text", () => {
    const onLanded = jest.fn();
    const s = render(<RollingNumber testID="n" from={999} to={1003} play onLanded={onLanded} style={STYLE} />);
    const box = s.getByTestId("n");
    expect(box.props.accessibilityLabel).toBe("1003");
    // 4 columns x 11 cells (0..9 and the wrap 0), hidden from accessibility.
    const cells = s.UNSAFE_getAllByType(Text);
    expect(cells).toHaveLength(44);
    // The thousands column shows a blank for its leading zero.
    expect(cells[0].props.children).toBe(" ");
    expect(cells[1].props.children).toBe("1");
    expect(cells[11].props.children).toBe("0");
    expect(onLanded).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(ROLL_MS);
    });
    expect(onLanded).toHaveBeenCalledTimes(1);
    expect(s.getByTestId("n")).toHaveTextContent("1003");
    expect(s.UNSAFE_getAllByType(Text)).toHaveLength(1);
  });

  it("rolls a fall too and lands once", () => {
    const onLanded = jest.fn();
    const s = render(<RollingNumber testID="n" from={1000} to={991} play onLanded={onLanded} style={STYLE} />);
    expect(s.UNSAFE_getAllByType(Text).length).toBeGreaterThan(1);
    act(() => {
      jest.advanceTimersByTime(ROLL_MS * 3);
    });
    expect(s.getByTestId("n")).toHaveTextContent("991");
    expect(onLanded).toHaveBeenCalledTimes(1);
  });

  it("waits for the delay before rolling and landing", () => {
    const onLanded = jest.fn();
    render(<RollingNumber from={1512} to={1526} play delayMs={540} onLanded={onLanded} style={STYLE} />);
    act(() => {
      jest.advanceTimersByTime(ROLL_MS);
    });
    expect(onLanded).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(540);
    });
    expect(onLanded).toHaveBeenCalledTimes(1);
  });

  it("under Reduce Motion shows the final value from the first frame and still lands (for haptics)", () => {
    __setReduceMotionForTests(true);
    const onLanded = jest.fn();
    const s = render(<RollingNumber testID="n" from={1512} to={1526} play onLanded={onLanded} style={STYLE} />);
    expect(s.getByTestId("n")).toHaveTextContent("1526");
    expect(s.UNSAFE_getAllByType(Text)).toHaveLength(1);
    act(() => {
      jest.runAllTimers();
    });
    expect(onLanded).toHaveBeenCalledTimes(1);
  });

  it("without play is static and never lands", () => {
    const onLanded = jest.fn();
    const s = render(<RollingNumber testID="n" from={1512} to={1526} play={false} onLanded={onLanded} style={STYLE} />);
    expect(s.getByTestId("n")).toHaveTextContent("1526");
    act(() => {
      jest.runAllTimers();
    });
    expect(onLanded).not.toHaveBeenCalled();
  });

  it("does not replay on a re-render with the same value", () => {
    const onLanded = jest.fn();
    const s = render(<RollingNumber testID="n" from={1512} to={1526} play onLanded={onLanded} style={STYLE} />);
    act(() => {
      jest.advanceTimersByTime(ROLL_MS);
    });
    s.rerender(<RollingNumber testID="n" from={1512} to={1526} play onLanded={onLanded} style={STYLE} />);
    act(() => {
      jest.runAllTimers();
    });
    expect(s.UNSAFE_getAllByType(Text)).toHaveLength(1);
    expect(onLanded).toHaveBeenCalledTimes(1);
  });
});

describe("usePlayOnce", () => {
  function Probe({ k, eligible, out }: { k: string | null; eligible: boolean; out: boolean[] }) {
    out.push(usePlayOnce(k, eligible));
    return null;
  }

  it("plays a key once per app run, and never when not eligible", () => {
    const a: boolean[] = [];
    const first = render(<Probe k="m1" eligible out={a} />);
    first.unmount();
    const b: boolean[] = [];
    render(<Probe k="m1" eligible out={b} />);
    const c: boolean[] = [];
    render(<Probe k="m2" eligible={false} out={c} />);
    const d: boolean[] = [];
    render(<Probe k={null} eligible out={d} />);
    expect(a[0]).toBe(true);
    expect(b[0]).toBe(false);
    expect(c[0]).toBe(false);
    expect(d[0]).toBe(true);
  });
});

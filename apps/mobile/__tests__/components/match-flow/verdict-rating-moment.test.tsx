/**
 * The verdict's rating moment (Adding Flare, jits-pddd.4): the odometer
 * roll, the delta chip, `ratingGain` and "the tap".
 *
 * - A submission WIN: three `tapTick`s 180ms apart, then the roll, then ONE
 *   `ratingGain` when it lands and the delta chip with sign and arrow.
 * - The loser of a submission: the tap marks shown filled, no haptic at all.
 * - A draw, a loss and a dispute are silent; a non-submission win skips the
 *   tap but still gains.
 * - Reduce Motion: final value at once, the winner's haptics kept.
 * - Once per result: a remount of the same result is silent and static.
 * - VoiceOver reads only "Rating 1526, up 14".
 */
import * as React from "react";
import { act, render } from "@testing-library/react-native";

jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  const stub = () => R.createElement(RN.View, { testID: "icon" });
  return new Proxy({}, { get: (_t: Record<string, unknown>, prop: string) => (prop === "__esModule" ? true : stub) });
});
jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({}),
  useResolvedColorScheme: () => "dark",
}));
const mockImpact = jest.fn((_s?: unknown) => Promise.resolve());
const mockNotify = jest.fn((_s?: unknown) => Promise.resolve());
jest.mock("expo-haptics", () => ({
  impactAsync: (s: unknown) => mockImpact(s),
  notificationAsync: (s: unknown) => mockNotify(s),
  selectionAsync: () => Promise.resolve(),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
}));

import { RatingMoment, TAP_LEAD_MS, TAP_STAGGER_MS } from "@/components/match-flow/verdict/rating-moment";
import { ROLL_MS, __resetPlayedMomentsForTests } from "@/components/ui/elo-system/rolling-number";
import { __setReduceMotionForTests } from "@/lib/motion";

type Props = React.ComponentProps<typeof RatingMoment>;
const WIN: Props = { matchId: "M1", outcome: "win", disputed: false, submission: true, before: 1512, after: 1526, delta: 14 };
const LOSS: Props = { matchId: "M1", outcome: "loss", disputed: false, submission: true, before: 1498, after: 1489, delta: -9 };

beforeEach(() => {
  jest.useFakeTimers();
  mockImpact.mockClear();
  mockNotify.mockClear();
  __setReduceMotionForTests(false);
  __resetPlayedMomentsForTests();
});
afterEach(() => {
  jest.useRealTimers();
  __setReduceMotionForTests(false);
});

const tick = (ms: number) =>
  act(() => {
    jest.advanceTimersByTime(ms);
  });
const all = () =>
  act(() => {
    jest.runAllTimers();
  });

describe("a submission win", () => {
  it("taps three times, 180ms apart, then rolls and lands one ratingGain", () => {
    const s = render(<RatingMoment {...WIN} />);
    expect(s.getByTestId("verdict-tap-marks", { includeHiddenElements: true })).toBeTruthy();
    expect(mockImpact).toHaveBeenCalledTimes(1);
    tick(TAP_STAGGER_MS);
    expect(mockImpact).toHaveBeenCalledTimes(2);
    tick(TAP_STAGGER_MS);
    expect(mockImpact).toHaveBeenCalledTimes(3);
    expect(mockImpact.mock.calls.every(([style]) => style === "light")).toBe(true);
    // Still rolling: no gain yet, the number is not final Text.
    tick(TAP_LEAD_MS - 2 * TAP_STAGGER_MS + ROLL_MS - 20);
    expect(mockNotify).not.toHaveBeenCalled();
    tick(40);
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify).toHaveBeenCalledWith("success");
    expect(s.getByTestId("verdict-rating-value", { includeHiddenElements: true })).toHaveTextContent("1526");
    expect(s.getByTestId("summary-elo-delta", { includeHiddenElements: true })).toHaveTextContent("▲ +14");
    all();
    expect(mockImpact).toHaveBeenCalledTimes(3);
    expect(mockNotify).toHaveBeenCalledTimes(1);
  });

  it("is read as the final value and delta only", () => {
    const s = render(<RatingMoment {...WIN} />);
    expect(s.getByTestId("verdict-rating-card").props.accessibilityLabel).toBe("Rating 1526, up 14");
  });

  it("under Reduce Motion shows the final value at once and keeps the winner's haptics", () => {
    __setReduceMotionForTests(true);
    const s = render(<RatingMoment {...WIN} />);
    expect(s.getByTestId("verdict-rating-value", { includeHiddenElements: true })).toHaveTextContent("1526");
    all();
    expect(mockImpact).toHaveBeenCalledTimes(3);
    expect(mockNotify).toHaveBeenCalledTimes(1);
  });

  it("plays once per result: a remount or re-render is static and silent", () => {
    const first = render(<RatingMoment {...WIN} />);
    all();
    first.rerender(<RatingMoment {...WIN} />);
    all();
    expect(mockImpact).toHaveBeenCalledTimes(3);
    expect(mockNotify).toHaveBeenCalledTimes(1);
    first.unmount();
    const again = render(<RatingMoment {...WIN} />);
    expect(again.getByTestId("verdict-rating-value", { includeHiddenElements: true })).toHaveTextContent("1526");
    all();
    expect(mockImpact).toHaveBeenCalledTimes(3);
    expect(mockNotify).toHaveBeenCalledTimes(1);
    // The marks are still drawn (filled) on the replay.
    expect(again.getByTestId("verdict-tap-marks", { includeHiddenElements: true })).toBeTruthy();
  });
});

describe("no haptic on a loss, a draw or a dispute", () => {
  it("the loser of a submission sees the marks filled, silent and still", () => {
    const s = render(<RatingMoment {...LOSS} />);
    expect(s.getByTestId("verdict-tap-marks", { includeHiddenElements: true })).toBeTruthy();
    all();
    expect(mockImpact).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
    expect(s.getByTestId("verdict-rating-value", { includeHiddenElements: true })).toHaveTextContent("1489");
    expect(s.getByTestId("summary-elo-delta", { includeHiddenElements: true })).toHaveTextContent("▼ −9");
    expect(s.getByTestId("verdict-rating-card").props.accessibilityLabel).toBe("Rating 1489, down 9");
  });

  it("a draw that gains is silent and has no tap", () => {
    const s = render(<RatingMoment {...WIN} outcome="draw" before={1500} after={1503} delta={3} />);
    expect(s.queryByTestId("verdict-tap-marks", { includeHiddenElements: true })).toBeNull();
    all();
    expect(mockImpact).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("a disputed result does not play", () => {
    const s = render(<RatingMoment {...WIN} disputed />);
    expect(s.queryByTestId("verdict-tap-marks", { includeHiddenElements: true })).toBeNull();
    expect(s.getByTestId("verdict-rating-value", { includeHiddenElements: true })).toHaveTextContent("1526");
    all();
    expect(mockImpact).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });
});

describe("a win that was not a submission", () => {
  it("skips the tap and lands the gain right after the roll", () => {
    const s = render(<RatingMoment {...WIN} submission={false} />);
    expect(s.queryByTestId("verdict-tap-marks", { includeHiddenElements: true })).toBeNull();
    tick(ROLL_MS + 1);
    expect(mockImpact).not.toHaveBeenCalled();
    expect(mockNotify).toHaveBeenCalledTimes(1);
  });
});

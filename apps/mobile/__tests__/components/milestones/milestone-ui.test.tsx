/**
 * Milestone UI (specs/matches-tab 10.6, board P-MT-15): the one-line status
 * banner (4 s, tap to dismiss, fades; in place under Reduce Motion), the
 * 14-piece burst (brand colours, ink only for a loss, nothing under Reduce
 * Motion) and the MilestoneMoment wrapper.
 */
import * as React from "react";
import { Text } from "react-native";
import { act, fireEvent, render } from "@testing-library/react-native";

jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  return new Proxy({}, { get: (_t, prop) => (prop === "__esModule" ? true : () => R.createElement(RN.View)) });
});

import { __setReduceMotionForTests } from "@/lib/motion/use-reduce-motion";
import { duration } from "@/lib/motion";
import { paletteFor } from "@/lib/theme/palette";
import { MILESTONE_BANNER_MS, MilestoneBanner } from "@/components/milestones/milestone-banner";
import { BURST_PIECES, MilestoneBurst } from "@/components/milestones/milestone-burst";
import { MilestoneMoment } from "@/components/milestones/milestone-moment";
import type { MilestoneCelebration } from "@/lib/milestones/milestone-store";

/** The burst is hidden from screen readers; queries must include hidden elements. */
const H = { includeHiddenElements: true };

const win: MilestoneCelebration = {
  milestone: "first_win",
  marks: ["first_match", "first_win"],
  copy: "First win. That one counts.",
  targetId: "m1",
  haptic: true,
  confetti: "brand",
  particles: true,
};

beforeEach(() => {
  jest.useFakeTimers();
  __setReduceMotionForTests(false);
});
afterEach(() => {
  jest.useRealTimers();
});

function layout(node: ReturnType<ReturnType<typeof render>["getByTestId"]>) {
  fireEvent(node, "layout", { nativeEvent: { layout: { width: 300, height: 200, x: 0, y: 0 } } });
}

describe("MilestoneBanner", () => {
  it("is a status line with the copy, at least 44 pt, and leaves after 4 s with a fade", () => {
    const onDismiss = jest.fn();
    const { getByTestId, getByText } = render(<MilestoneBanner milestone="first_win" copy={win.copy} onDismiss={onDismiss} />);
    const banner = getByTestId("milestone-banner-first_win");
    expect(banner.props.role).toBe("status");
    expect(banner.props.accessibilityLiveRegion).toBe("polite");
    expect(banner.props.accessibilityLabel).toBe(win.copy);
    expect(getByText(win.copy)).toBeTruthy();
    expect(banner.props.style).toMatchObject({ minHeight: 44, borderLeftWidth: 3 });
    act(() => jest.advanceTimersByTime(MILESTONE_BANNER_MS - 1));
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(1));
    // Fading: not gone until the fade ends.
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(duration.fast));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("a tap dismisses it (once)", () => {
    const onDismiss = jest.fn();
    const { getByTestId } = render(<MilestoneBanner milestone="first_match" copy="First match in the books" onDismiss={onDismiss} />);
    fireEvent.press(getByTestId("milestone-banner-first_match"));
    fireEvent.press(getByTestId("milestone-banner-first_match"));
    act(() => jest.advanceTimersByTime(duration.fast));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    act(() => jest.advanceTimersByTime(MILESTONE_BANNER_MS));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("the rule is gain green for a first win and ink otherwise", () => {
    const p = paletteFor("light");
    const winRule = render(<MilestoneBanner milestone="first_win" copy="x" onDismiss={jest.fn()} />).getByTestId("milestone-banner-first_win").props.style.borderLeftColor;
    const inkRule = render(<MilestoneBanner milestone="first_highlight" copy="y" onDismiss={jest.fn()} />).getByTestId("milestone-banner-first_highlight").props.style.borderLeftColor;
    expect(winRule).not.toBe(inkRule);
    expect([p.text, paletteFor("dark").text]).toContain(inkRule);
  });

  it("under Reduce Motion it leaves in place (no fade wait)", () => {
    __setReduceMotionForTests(true);
    const onDismiss = jest.fn();
    const { getByTestId } = render(<MilestoneBanner milestone="first_win" copy={win.copy} onDismiss={onDismiss} />);
    fireEvent.press(getByTestId("milestone-banner-first_win"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe("MilestoneBurst", () => {
  it("draws 14 sharp pieces, starting within the stagger so the burst ends under 1.2 s", () => {
    const { getByTestId, getAllByTestId } = render(<MilestoneBurst play />);
    const burst = getByTestId("milestone-burst", H);
    expect(burst.props.pointerEvents).toBe("none");
    expect(burst.props.accessibilityElementsHidden).toBe(true);
    layout(burst);
    expect(getAllByTestId("milestone-burst-piece", H)).toHaveLength(14);
    expect(BURST_PIECES).toHaveLength(14);
    for (const piece of BURST_PIECES) expect(piece.d).toBeLessThanOrEqual(180);
  });

  it("brand pieces use the verdict confetti colours; a loss uses ink steps only", () => {
    expect(new Set(BURST_PIECES.map((p) => p.c))).toEqual(new Set(["cta", "text", "red"]));
    expect(new Set(BURST_PIECES.map((p) => p.ink))).toEqual(new Set(["text", "text2", "text3"]));
    const { getByTestId, getAllByTestId } = render(<MilestoneBurst play palette="ink" />);
    layout(getByTestId("milestone-burst", H));
    const colors = getAllByTestId("milestone-burst-piece", H).map((n) => [].concat(n.props.style).find((s: { backgroundColor?: string } | null) => s?.backgroundColor) as unknown as { backgroundColor: string });
    const p = paletteFor("light");
    const d = paletteFor("dark");
    const forbidden = [p.cta, p.red, p.win, d.cta, d.red, d.win];
    for (const c of colors) expect(forbidden).not.toContain(c.backgroundColor);
  });

  it("draws nothing under Reduce Motion or without play", () => {
    expect(render(<MilestoneBurst play={false} />).toJSON()).toBeNull();
    __setReduceMotionForTests(true);
    expect(render(<MilestoneBurst play />).toJSON()).toBeNull();
  });
});

describe("MilestoneMoment", () => {
  it("adds the banner above the child and the burst over it; nothing extra without a celebration", () => {
    const child = <Text testID="child">card</Text>;
    const none = render(<MilestoneMoment celebration={null} onDismiss={jest.fn()}>{child}</MilestoneMoment>);
    expect(none.getByTestId("child")).toBeTruthy();
    expect(none.queryByTestId("milestone-banner-first_win")).toBeNull();
    expect(none.queryByTestId("milestone-burst", H)).toBeNull();

    const on = render(<MilestoneMoment celebration={win} onDismiss={jest.fn()}>{child}</MilestoneMoment>);
    expect(on.getByTestId("milestone-banner-first_win")).toBeTruthy();
    expect(on.getByTestId("milestone-burst", H)).toBeTruthy();
    expect(on.getByTestId("child")).toBeTruthy();
  });

  it("no particles when the celebration says so (Reduce Motion), the banner still shows", () => {
    const on = render(<MilestoneMoment celebration={{ ...win, particles: false }} onDismiss={jest.fn()}><Text>card</Text></MilestoneMoment>);
    expect(on.getByTestId("milestone-banner-first_win")).toBeTruthy();
    expect(on.queryByTestId("milestone-burst", H)).toBeNull();
  });
});

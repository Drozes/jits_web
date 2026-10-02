/**
 * Press scale (Motion Rule, Reactive tier) on `PressableScale` and every
 * `Button`, plus the Button's `haptic` and `sheen` props:
 *
 *  - press-in dips to PRESS_SCALE, release springs back to 1;
 *  - Reduce Motion: no scale, a 0.85 opacity dip while held, haptic kept;
 *  - disabled: no scale, no haptic, no onPress;
 *  - `haptic` fires once per press (`press` or `accept`, never both), only
 *    on onPress (a press-in alone is silent), and only when opted in;
 *  - `sheen` draws the steel sheen only while enabled and motion is allowed.
 */
import * as React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import { StyleSheet, Text } from "react-native";
import { getAnimatedStyle } from "react-native-reanimated";

const mockPress = jest.fn(() => Promise.resolve());
const mockAccept = jest.fn(() => Promise.resolve());
jest.mock("@/lib/motion/haptics", () => ({
  haptics: {
    press: () => mockPress(),
    accept: () => mockAccept(),
  },
}));

import { PressableScale, REDUCED_PRESS_OPACITY } from "@/components/ui/pressable-scale";
import { Button } from "@/components/ui/button";
import { PRESS_SCALE, __setReduceMotionForTests } from "@/lib/motion";

function scaleOf(node: Parameters<typeof getAnimatedStyle>[0]): number {
  const style = getAnimatedStyle(node) as { transform?: { scale?: number }[] };
  const t = (style.transform ?? []).find((x) => x.scale !== undefined);
  return t?.scale ?? 1;
}

beforeEach(() => {
  jest.useFakeTimers();
  mockPress.mockClear();
  mockAccept.mockClear();
  __setReduceMotionForTests(false);
});

afterEach(() => {
  jest.useRealTimers();
  __setReduceMotionForTests(false);
});

describe("PressableScale", () => {
  it("dips to the press scale on press-in and springs back on release", () => {
    const screen = render(
      <PressableScale testID="p" onPress={jest.fn()}>
        <Text>Go</Text>
      </PressableScale>,
    );
    const node = screen.getByTestId("p");
    expect(scaleOf(node)).toBe(1);

    fireEvent(node, "pressIn", {});
    act(() => jest.advanceTimersByTime(500));
    expect(scaleOf(node)).toBeCloseTo(PRESS_SCALE, 3);

    fireEvent(node, "pressOut", {});
    act(() => jest.advanceTimersByTime(2_000));
    expect(scaleOf(node)).toBeCloseTo(1, 3);
  });

  it("under Reduce Motion does not scale; it dips to 0.85 opacity only while held", () => {
    __setReduceMotionForTests(true);
    const screen = render(
      <PressableScale testID="p" style={{ height: 40 }} onPress={jest.fn()}>
        <Text>Go</Text>
      </PressableScale>,
    );
    const node = screen.getByTestId("p");
    fireEvent(node, "pressIn", {});
    act(() => jest.advanceTimersByTime(500));
    expect(scaleOf(node)).toBe(1);
    expect(StyleSheet.flatten(screen.getByTestId("p").props.style).opacity).toBe(
      REDUCED_PRESS_OPACITY,
    );

    fireEvent(node, "pressOut", {});
    expect(StyleSheet.flatten(screen.getByTestId("p").props.style).opacity).toBeUndefined();
  });

  it("keeps the haptic under Reduce Motion", () => {
    __setReduceMotionForTests(true);
    const screen = render(
      <PressableScale testID="p" haptic onPress={jest.fn()}>
        <Text>Go</Text>
      </PressableScale>,
    );
    fireEvent.press(screen.getByTestId("p"));
    expect(mockPress).toHaveBeenCalledTimes(1);
  });

  it("resolves a function style with the pressed state", () => {
    const screen = render(
      <PressableScale
        testID="p"
        onPress={jest.fn()}
        style={({ pressed }) => ({ backgroundColor: pressed ? "red" : "blue" })}
      >
        <Text>Go</Text>
      </PressableScale>,
    );
    const bg = () => StyleSheet.flatten(screen.getByTestId("p").props.style).backgroundColor;
    expect(bg()).toBe("blue");
    fireEvent(screen.getByTestId("p"), "pressIn", {});
    expect(bg()).toBe("red");
    fireEvent(screen.getByTestId("p"), "pressOut", {});
    expect(bg()).toBe("blue");
  });

  it("a disabled control does not scale, buzz or press", () => {
    const onPress = jest.fn();
    const screen = render(
      <PressableScale testID="p" haptic disabled onPress={onPress}>
        <Text>Go</Text>
      </PressableScale>,
    );
    const node = screen.getByTestId("p");
    fireEvent(node, "pressIn", {});
    act(() => jest.advanceTimersByTime(500));
    expect(scaleOf(node)).toBe(1);
    fireEvent.press(node);
    expect(onPress).not.toHaveBeenCalled();
    expect(mockPress).not.toHaveBeenCalled();
  });

  it("returns to rest when disabled mid-press", () => {
    const screen = render(
      <PressableScale testID="p" onPress={jest.fn()}>
        <Text>Go</Text>
      </PressableScale>,
    );
    fireEvent(screen.getByTestId("p"), "pressIn", {});
    act(() => jest.advanceTimersByTime(500));
    expect(scaleOf(screen.getByTestId("p"))).toBeCloseTo(PRESS_SCALE, 3);
    screen.rerender(
      <PressableScale testID="p" disabled onPress={jest.fn()}>
        <Text>Go</Text>
      </PressableScale>,
    );
    act(() => jest.advanceTimersByTime(16));
    expect(scaleOf(screen.getByTestId("p"))).toBe(1);
  });

  it("is silent without the haptic prop", () => {
    const onPress = jest.fn();
    const screen = render(
      <PressableScale testID="p" onPress={onPress}>
        <Text>Go</Text>
      </PressableScale>,
    );
    fireEvent.press(screen.getByTestId("p"));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(mockPress).not.toHaveBeenCalled();
    expect(mockAccept).not.toHaveBeenCalled();
  });

  it("fires the commit haptic once on press, never on press-in alone", () => {
    const screen = render(
      <PressableScale testID="p" haptic onPress={jest.fn()}>
        <Text>Go</Text>
      </PressableScale>,
    );
    fireEvent(screen.getByTestId("p"), "pressIn", {});
    fireEvent(screen.getByTestId("p"), "pressOut", {});
    expect(mockPress).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId("p"));
    expect(mockPress).toHaveBeenCalledTimes(1);
  });

  it('haptic="accept" fires accept and not press', () => {
    const screen = render(
      <PressableScale testID="p" haptic="accept" onPress={jest.fn()}>
        <Text>Go</Text>
      </PressableScale>,
    );
    fireEvent.press(screen.getByTestId("p"));
    expect(mockAccept).toHaveBeenCalledTimes(1);
    expect(mockPress).not.toHaveBeenCalled();
  });
});

describe("Button press scale, haptic and sheen", () => {
  it("every Button scales on press", () => {
    const screen = render(
      <Button testID="b" onPress={jest.fn()}>
        Tap
      </Button>,
    );
    fireEvent(screen.getByTestId("b"), "pressIn", {});
    act(() => jest.advanceTimersByTime(500));
    expect(scaleOf(screen.getByTestId("b"))).toBeCloseTo(PRESS_SCALE, 3);
  });

  it("a disabled Button keeps its dimmed opacity (the animation does not override it)", () => {
    const screen = render(
      <Button testID="b" disabled style={{ opacity: 0.5 }} onPress={jest.fn()}>
        Tap
      </Button>,
    );
    expect(StyleSheet.flatten(screen.getByTestId("b").props.style).opacity).toBe(0.5);
  });

  it("is silent by default and buzzes press when opted in", () => {
    const screen = render(
      <>
        <Button testID="plain" onPress={jest.fn()}>
          Plain
        </Button>
        <Button testID="commit" haptic onPress={jest.fn()}>
          Commit
        </Button>
      </>,
    );
    fireEvent.press(screen.getByTestId("plain"));
    expect(mockPress).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId("commit"));
    expect(mockPress).toHaveBeenCalledTimes(1);
  });

  it("draws the sheen only when asked, enabled and motion is allowed", () => {
    const screen = render(
      <Button testID="b" onPress={jest.fn()}>
        Tap
      </Button>,
    );
    expect(screen.queryByTestId("steel-sheen", { includeHiddenElements: true })).toBeNull();

    screen.rerender(
      <Button testID="b" sheen onPress={jest.fn()}>
        Tap
      </Button>,
    );
    expect(screen.getByTestId("steel-sheen", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId("steel-sheen", { includeHiddenElements: true }).props.pointerEvents).toBe("none");

    screen.rerender(
      <Button testID="b" sheen disabled onPress={jest.fn()}>
        Tap
      </Button>,
    );
    expect(screen.queryByTestId("steel-sheen", { includeHiddenElements: true })).toBeNull();

    act(() => __setReduceMotionForTests(true));
    screen.rerender(
      <Button testID="b" sheen onPress={jest.fn()}>
        Tap
      </Button>,
    );
    expect(screen.queryByTestId("steel-sheen", { includeHiddenElements: true })).toBeNull();
  });

  it("a sheened Button never buzzes for the sheen", () => {
    render(
      <Button testID="b" sheen onPress={jest.fn()}>
        Tap
      </Button>,
    );
    act(() => jest.advanceTimersByTime(10_000));
    expect(mockPress).not.toHaveBeenCalled();
    expect(mockAccept).not.toHaveBeenCalled();
  });
});

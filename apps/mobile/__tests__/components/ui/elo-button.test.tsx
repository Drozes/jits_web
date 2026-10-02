/**
 * The one ELO `Button` (WP3, jits-3eeg.4; kit card `components/Button`):
 * variants, the one disabled style, busy, a11y, the haptic and sheen props,
 * and the press scale it inherits from `PressableScale` (Reduce Motion dip
 * included). Colors come from the active theme's tokens, so this renders
 * under a mocked light scheme and compares against `lightTokens`.
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
jest.mock("nativewind", () => ({
  ...jest.requireActual("nativewind"),
  useColorScheme: () => ({ colorScheme: "light", setColorScheme: jest.fn() }),
}));

import {
  Button,
  BUTTON_HEIGHT,
  BUTTON_MAX_FONT_SCALE,
  BUTTON_RADIUS,
  DISABLED_OPACITY,
  buttonPaddingVertical,
} from "@/components/ui/elo-system/button";
import { REDUCED_PRESS_OPACITY } from "@/components/ui/pressable-scale";
import { PRESSED_OPACITY } from "@/components/ui/state-pressable";
import { BROADCAST } from "@/components/match-flow/live/broadcast-tokens";
import { onMediaTokens } from "@/lib/tokens";
import { ON_MEDIA } from "@/lib/theme/palette";
import { lightTokens as t } from "@/lib/tokens";
import { PRESS_SCALE, __setReduceMotionForTests } from "@/lib/motion";

type Node = Parameters<typeof getAnimatedStyle>[0] & { props: Record<string, unknown> };

function scaleOf(node: Parameters<typeof getAnimatedStyle>[0]): number {
  const style = getAnimatedStyle(node) as { transform?: { scale?: number }[] };
  const tr = (style.transform ?? []).find((x) => x.scale !== undefined);
  return tr?.scale ?? 1;
}
const flat = (node: Node) => (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>;
const labelColor = (node: { props: { style?: unknown } }) =>
  (StyleSheet.flatten(node.props.style as never) as { color?: string }).color;

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

describe("Button variants", () => {
  it("primary: Signal Red fill, on-signal label, the kit size and radius, `bg-cta` class", () => {
    const s = render(<Button testID="b" label="Sign in" onPress={jest.fn()} />);
    const st = flat(s.getByTestId("b"));
    expect(st.backgroundColor).toBe(t.accentCta);
    expect(st.minHeight).toBe(BUTTON_HEIGHT);
    expect(st.borderRadius).toBe(BUTTON_RADIUS);
    expect(String(s.getByTestId("b").props.className)).toMatch(/(^|\s)bg-cta(\s|$)/);
    expect(labelColor(s.getByText("Sign in"))).toBe(t.textOnAccent);
  });

  it("primary pressed: the lifted red, back to the fill on release", () => {
    const s = render(<Button testID="b" label="Go" onPress={jest.fn()} />);
    fireEvent(s.getByTestId("b"), "pressIn", {});
    expect(flat(s.getByTestId("b")).backgroundColor).toBe(t.accentCtaHover);
    fireEvent(s.getByTestId("b"), "pressOut", {});
    expect(flat(s.getByTestId("b")).backgroundColor).toBe(t.accentCta);
  });

  it("secondary: plate fill, strong hairline, ink label; plate-bright pressed; never red", () => {
    const s = render(<Button testID="b" variant="secondary" label="Retry" onPress={jest.fn()} />);
    const st = flat(s.getByTestId("b"));
    expect(st.backgroundColor).toBe(t.bgElevated);
    expect(st.borderWidth).toBe(1);
    expect(st.borderColor).toBe(t.borderHairlineStrong);
    expect(labelColor(s.getByText("Retry"))).toBe(t.textPrimary);
    expect(String(s.getByTestId("b").props.className)).not.toMatch(/bg-cta/);
    fireEvent(s.getByTestId("b"), "pressIn", {});
    expect(flat(s.getByTestId("b")).backgroundColor).toBe(t.bgElevatedHover);
  });

  it("ghost: no fill, ink label at 13px, a 0.7 dip while pressed", () => {
    const s = render(<Button testID="b" variant="ghost" label="Not now" onPress={jest.fn()} />);
    expect(flat(s.getByTestId("b")).backgroundColor).toBeUndefined();
    const label = StyleSheet.flatten(s.getByText("Not now").props.style) as { fontSize: number; color: string };
    expect(label.fontSize).toBe(13);
    expect(label.color).toBe(t.textPrimary);
    fireEvent(s.getByTestId("b"), "pressIn", {});
    expect(flat(s.getByTestId("b")).opacity).toBe(PRESSED_OPACITY);
  });

  it("destructive: an outline in negative (no fill, never a second red CTA); plate fill pressed", () => {
    const s = render(<Button testID="b" variant="destructive" label="Delete account" onPress={jest.fn()} />);
    const st = flat(s.getByTestId("b"));
    expect(st.backgroundColor).toBe("transparent");
    expect(st.borderWidth).toBe(1);
    expect(st.borderColor).toBe(t.stateNegative);
    expect(labelColor(s.getByText("Delete account"))).toBe(t.stateNegative);
    const cls = String(s.getByTestId("b").props.className);
    expect(cls).toContain("border-negative");
    expect(cls).not.toMatch(/bg-cta|bg-destructive/);
    fireEvent(s.getByTestId("b"), "pressIn", {});
    expect(flat(s.getByTestId("b")).backgroundColor).toBe(t.bgElevated);
  });

  it("glass: the fixed on-media glass whatever the theme, white label", () => {
    const s = render(<Button testID="b" variant="glass" label="Allow camera" onPress={jest.fn()} />);
    const st = flat(s.getByTestId("b"));
    expect(st.backgroundColor).toBe(onMediaTokens.glassStrong);
    expect(st.borderColor).toBe(onMediaTokens.strong);
    // The same glass as the live screen's Pause (one on-media source).
    expect(st.backgroundColor).toBe(BROADCAST.glassFill);
    expect(st.borderColor).toBe(BROADCAST.glassBorder);
    expect(labelColor(s.getByText("Allow camera"))).toBe(ON_MEDIA.white);
    fireEvent(s.getByTestId("b"), "pressIn", {});
    expect(flat(s.getByTestId("b")).backgroundColor).toBe(onMediaTokens.glassPressed);
  });
});

describe("Button and Dynamic Type", () => {
  it("height is a minimum, so a large-text label that wraps grows the button instead of clipping", () => {
    const s = render(<Button testID="b" label="I Acknowledge" onPress={jest.fn()} />);
    const st = flat(s.getByTestId("b"));
    expect(st.height).toBeUndefined();
    expect(st.minHeight).toBe(BUTTON_HEIGHT);
    expect(st.paddingVertical).toBe(8);
    const label = s.getByText("I Acknowledge");
    expect(label.props.maxFontSizeMultiplier).toBe(BUTTON_MAX_FONT_SCALE);
    expect((StyleSheet.flatten(label.props.style) as { flexShrink?: number }).flexShrink).toBe(1);
  });

  it("caps the label scale near 1.6 (it still grows, short of the largest steps)", () => {
    expect(BUTTON_MAX_FONT_SCALE).toBeGreaterThan(1.3);
    expect(BUTTON_MAX_FONT_SCALE).toBeLessThanOrEqual(1.6);
  });

  it("keeps the normal-size height: the padding never exceeds what a one-line label leaves", () => {
    // A 14px caps label lays out about 18 to 20pt tall.
    for (const h of [28, 32, 36, 44, 48, 56, 64, 72]) {
      const pad = buttonPaddingVertical(h);
      expect(pad).toBeGreaterThanOrEqual(0);
      expect(pad * 2 + 20).toBeLessThanOrEqual(h);
    }
    expect(buttonPaddingVertical(56)).toBe(8);
    expect(buttonPaddingVertical(28)).toBe(4);
  });
});

describe("Button states and a11y", () => {
  it("is a button named by its label unless an accessibilityLabel is given", () => {
    const s = render(
      <>
        <Button testID="a" label="Continue" onPress={jest.fn()} />
        <Button testID="b" label="Resume match" accessibilityLabel="Resume your match" onPress={jest.fn()} />
      </>,
    );
    expect(s.getByTestId("a").props.accessibilityRole).toBe("button");
    expect(s.getByTestId("a").props.accessibilityLabel).toBe("Continue");
    expect(s.getByLabelText("Resume your match")).toBeTruthy();
  });

  it("disabled: the one disabled style (0.5) on every variant, inert, no haptic, no scale", () => {
    for (const variant of ["primary", "secondary", "ghost", "destructive", "glass"] as const) {
      const onPress = jest.fn();
      const s = render(<Button testID="b" variant={variant} label="X" disabled haptic onPress={onPress} />);
      const node = s.getByTestId("b");
      expect(flat(node).opacity).toBe(DISABLED_OPACITY);
      expect(node.props.accessibilityState).toEqual({ disabled: true, busy: false });
      fireEvent(node, "pressIn", {});
      act(() => jest.advanceTimersByTime(500));
      expect(scaleOf(node)).toBe(1);
      fireEvent.press(node);
      expect(onPress).not.toHaveBeenCalled();
      s.unmount();
    }
    expect(mockPress).not.toHaveBeenCalled();
  });

  it("busy: a spinner replaces the icon, the button is inert but not dimmed", () => {
    const onPress = jest.fn();
    const icon = jest.fn(() => <Text>icon</Text>);
    const s = render(<Button testID="b" label="Saving" busy icon={icon} onPress={onPress} />);
    expect(s.getByTestId("b-spinner")).toBeTruthy();
    expect(s.queryByText("icon")).toBeNull();
    expect(s.getByTestId("b").props.accessibilityState).toEqual({ disabled: true, busy: true });
    expect(flat(s.getByTestId("b")).opacity).toBeUndefined();
    fireEvent.press(s.getByTestId("b"));
    expect(onPress).not.toHaveBeenCalled();
  });

  it("draws the icon in the label color and the trailing note at the end", () => {
    const icon = jest.fn((color: string) => <Text testID="icon">{color}</Text>);
    const s = render(
      <Button testID="b" variant="secondary" label="Compare" icon={icon} trailing={<Text>NOTE</Text>} onPress={jest.fn()} />,
    );
    expect(icon).toHaveBeenCalledWith(t.textPrimary);
    expect(s.getByText("NOTE")).toBeTruthy();
    expect(flat(s.getByTestId("b")).justifyContent).toBe("space-between");
  });

  it("labelContent is drawn in place of the label; the label stays the accessible name", () => {
    const s = render(
      <Button testID="b" label="Regenerate (3 left)" labelContent={<Text testID="rich">rich</Text>} onPress={jest.fn()} />,
    );
    expect(s.getByTestId("rich")).toBeTruthy();
    expect(s.queryByText("Regenerate (3 left)")).toBeNull();
    expect(s.getByTestId("b").props.accessibilityLabel).toBe("Regenerate (3 left)");
  });

  it("className places the button and style overrides last", () => {
    const s = render(
      <Button testID="b" label="X" className="mt-2 w-full" style={{ paddingHorizontal: 0 }} onPress={jest.fn()} />,
    );
    expect(String(s.getByTestId("b").props.className)).toContain("mt-2 w-full");
    expect(flat(s.getByTestId("b")).paddingHorizontal).toBe(0);
  });
});

describe("Button press feedback, haptic and sheen", () => {
  it("scales to PRESS_SCALE on press-in and springs back", () => {
    const s = render(<Button testID="b" label="Go" onPress={jest.fn()} />);
    const node = s.getByTestId("b");
    fireEvent(node, "pressIn", {});
    act(() => jest.advanceTimersByTime(500));
    expect(scaleOf(node)).toBeCloseTo(PRESS_SCALE, 3);
    fireEvent(node, "pressOut", {});
    act(() => jest.advanceTimersByTime(2_000));
    expect(scaleOf(node)).toBeCloseTo(1, 3);
  });

  it("under Reduce Motion it does not scale and dips to 0.85 while held", () => {
    __setReduceMotionForTests(true);
    const s = render(<Button testID="b" label="Go" onPress={jest.fn()} />);
    const node = s.getByTestId("b");
    fireEvent(node, "pressIn", {});
    act(() => jest.advanceTimersByTime(500));
    expect(scaleOf(node)).toBe(1);
    expect(flat(s.getByTestId("b")).opacity).toBe(REDUCED_PRESS_OPACITY);
  });

  it("is silent by default and fires exactly one haptic per press when opted in", () => {
    const s = render(
      <>
        <Button testID="plain" label="Plain" onPress={jest.fn()} />
        <Button testID="commit" label="Commit" haptic onPress={jest.fn()} />
        <Button testID="accept" label="Accept" haptic="accept" onPress={jest.fn()} />
      </>,
    );
    fireEvent.press(s.getByTestId("plain"));
    expect(mockPress).not.toHaveBeenCalled();
    fireEvent.press(s.getByTestId("commit"));
    expect(mockPress).toHaveBeenCalledTimes(1);
    fireEvent.press(s.getByTestId("accept"));
    expect(mockAccept).toHaveBeenCalledTimes(1);
    expect(mockPress).toHaveBeenCalledTimes(1);
  });

  it("draws the sheen only while enabled and not busy, clipped to the button", () => {
    const s = render(<Button testID="b" label="Confirm result" sheen onPress={jest.fn()} />);
    expect(s.getByTestId("steel-sheen", { includeHiddenElements: true })).toBeTruthy();
    expect(flat(s.getByTestId("b")).overflow).toBe("hidden");
    s.rerender(<Button testID="b" label="Confirm result" sheen busy onPress={jest.fn()} />);
    expect(s.queryByTestId("steel-sheen", { includeHiddenElements: true })).toBeNull();
    s.rerender(<Button testID="b" label="Confirm result" sheen disabled onPress={jest.fn()} />);
    expect(s.queryByTestId("steel-sheen", { includeHiddenElements: true })).toBeNull();
  });
});

/**
 * WP5 (jits-3eeg.6; R3 TY-1, TY-3, TY-4): the scale-driven Mono and Label.
 * Mono: JetBrains Mono at a step, tabular figures always on. Label: a caps
 * label at a step that can never render untracked.
 */
import * as React from "react";
import { StyleSheet } from "react-native";
import { render } from "@testing-library/react-native";
import { Label, MetaTag, Mono } from "@/components/ui/elo-system";
import { TEXT_STEPS, TRACKING, TYPE_STEP_NAMES, numeralTracking, type TextStep } from "@/lib/typography";

const flat = (node: { props: { style?: unknown } }) =>
  StyleSheet.flatten(node.props.style as never) as Record<string, unknown>;

describe("Mono", () => {
  it("defaults: mono 400 at `small` (12/16), ink, normal tracking, tabular", () => {
    const u = render(<Mono>1512</Mono>);
    const text = u.getByText("1512");
    expect(text.props.className).toMatch(/\bfont-mono\b/);
    expect(text.props.className).toMatch(/\btext-ink\b/);
    expect(flat(text)).toMatchObject({
      fontSize: 12,
      lineHeight: 16,
      letterSpacing: 0,
      fontVariant: ["tabular-nums"],
    });
  });

  it.each(TYPE_STEP_NAMES)("size %s sets the step's size and keeps tabular figures", (step) => {
    const u = render(<Mono size={step}>42</Mono>);
    const style = flat(u.getByText("42"));
    expect(style.fontSize).toBeGreaterThanOrEqual(10);
    expect(style.fontVariant).toEqual(["tabular-nums"]);
  });

  it("weights map to the shipped JetBrains Mono families", () => {
    const u = render(
      <>
        <Mono weight="medium">1</Mono>
        <Mono weight="bold">2</Mono>
      </>,
    );
    expect(u.getByText("1").props.className).toMatch(/\bfont-mono-medium\b/);
    expect(u.getByText("2").props.className).toMatch(/\bfont-mono-bold\b/);
  });

  it("numeral tracking is -0.04em of the size; caps uppercases", () => {
    const u = render(
      <Mono size="display-72" weight="bold" tracking="numeral" caps>
        1526
      </Mono>,
    );
    const text = u.getByText("1526");
    expect(flat(text)).toMatchObject({ fontSize: 72, lineHeight: 79, letterSpacing: numeralTracking(72) });
    expect(text.props.className).toMatch(/\buppercase\b/);
  });

  it("a caller style may tune color and line height but never drops tabular figures", () => {
    const u = render(
      <Mono size="micro" className="text-ink-3" style={{ color: "#fff", lineHeight: 12, fontVariant: [] }}>
        0:42
      </Mono>,
    );
    const text = u.getByText("0:42");
    expect(flat(text)).toMatchObject({ color: "#fff", lineHeight: 12, fontSize: 10, fontVariant: ["tabular-nums"] });
    // A later color class wins over the default ink (cn / tailwind-merge).
    expect(text.props.className).toMatch(/\btext-ink-3\b/);
    expect(text.props.className).not.toMatch(/\btext-ink(?!-)\b/);
  });

  it("passes accessibility props through", () => {
    const u = render(
      <Mono accessibilityLabel="Rating 1512" testID="rating">
        1512
      </Mono>,
    );
    expect(u.getByTestId("rating").props.accessibilityLabel).toBe("Rating 1512");
  });
});

describe("Label", () => {
  it("defaults to the meta-label recipe: mono 10, caps-l, ink-3, uppercase, tabular", () => {
    const u = render(<Label>Closest match</Label>);
    const text = u.getByText("Closest match");
    expect(text.props.className).toMatch(/\bfont-mono\b/);
    expect(text.props.className).toMatch(/\btext-ink-3\b/);
    expect(text.props.className).toMatch(/\buppercase\b/);
    expect(flat(text)).toMatchObject({
      fontSize: 10,
      lineHeight: 13,
      letterSpacing: TRACKING["caps-l"],
      textTransform: "uppercase",
      fontVariant: ["tabular-nums"],
    });
  });

  it("heading family: DM Sans 700 in ink by default, no tabular figures", () => {
    const u = render(
      <Label family="heading" size="small" tracking="caps">
        Sign out
      </Label>,
    );
    const text = u.getByText("Sign out");
    expect(text.props.className).toMatch(/\bfont-heading\b/);
    expect(text.props.className).toMatch(/\btext-ink\b/);
    expect(flat(text)).toMatchObject({ fontSize: 12, letterSpacing: TRACKING.caps });
    expect(flat(text).fontVariant).toBeUndefined();
  });

  it("heading weights map to the shipped DM Sans families", () => {
    const u = render(
      <>
        <Label family="heading" weight="medium">a</Label>
        <Label family="heading" weight="regular">b</Label>
        <Label weight="bold">c</Label>
      </>,
    );
    expect(u.getByText("a").props.className).toMatch(/\bfont-heading-medium\b/);
    expect(u.getByText("b").props.className).toMatch(/\bfont-heading-regular\b/);
    expect(u.getByText("c").props.className).toMatch(/\bfont-mono-bold\b/);
  });

  it.each(Object.keys(TEXT_STEPS) as TextStep[])("size %s is tracked and caps", (step) => {
    const u = render(<Label size={step}>x</Label>);
    const style = flat(u.getByText("x"));
    expect(style.fontSize).toBe(TEXT_STEPS[step].fontSize);
    expect(style.letterSpacing).toBeGreaterThanOrEqual(TRACKING.caps);
    expect(style.textTransform).toBe("uppercase");
  });

  it("a caller style cannot remove the caps or the tracking (R3 TY-3)", () => {
    const u = render(
      <Label tracking="caps-xl" style={{ letterSpacing: 0, textTransform: "none", color: "#abc" }}>
        Live
      </Label>,
    );
    expect(flat(u.getByText("Live"))).toMatchObject({
      letterSpacing: TRACKING["caps-xl"],
      textTransform: "uppercase",
      color: "#abc",
    });
  });
});

describe("MetaTag (built on Label)", () => {
  it("renders its text as a mono micro caps-l label in ink-2", () => {
    const u = render(<MetaTag>172.5 lbs</MetaTag>);
    const text = u.getByText("172.5 lbs");
    expect(text.props.className).toMatch(/\btext-ink-2\b/);
    expect(text.props.className).not.toMatch(/\btext-ink-3\b/);
    expect(flat(text)).toMatchObject({
      fontSize: 10,
      letterSpacing: 1.68,
      textTransform: "uppercase",
      fontVariant: ["tabular-nums"],
    });
  });
});

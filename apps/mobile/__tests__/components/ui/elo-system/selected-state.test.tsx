/**
 * WP2 (jits-3eeg.3): the one selected-state treatment and the neutral
 * "done" states. Selected = plate-bright + hairline-strong + ink (+ an ink
 * check where the edge alone would carry it); never a red fill, edge or dot.
 * Ready is not a gain: an ink check on plate-bright, never Gain Green.
 */
import * as React from "react";
import { Switch as RNSwitch } from "react-native";
import { render } from "@testing-library/react-native";
import { Chip } from "@/components/ui/elo-system/chip";
import { SELECTED_SURFACE, UNSELECTED_SURFACE, SelectCheck, selectionSurface } from "@/components/ui/elo-system/selection";
import { ReadyPanel } from "@/components/match-flow/steps/ready-panel";
import { Switch } from "@/components/ui/switch";
import { darkTokens, lightTokens } from "@/lib/tokens";

const RED = /\b(bg|border|text)-cta\b/;
const GREEN = /-positive\b/;

describe("selectionSurface", () => {
  it("steps the surface, keeps the strong hairline, never red", () => {
    expect(selectionSurface(true)).toBe(SELECTED_SURFACE);
    expect(selectionSurface(false)).toBe(UNSELECTED_SURFACE);
    expect(SELECTED_SURFACE).toMatch(/\bbg-surface-4\b/);
    expect(SELECTED_SURFACE).toMatch(/\bborder-hairline-strong\b/);
    expect(UNSELECTED_SURFACE).toMatch(/\bbg-surface-3\b/);
    expect(`${SELECTED_SURFACE} ${UNSELECTED_SURFACE}`).not.toMatch(RED);
  });

  it("SelectCheck is decorative (the control carries the selected state)", () => {
    const u = render(<SelectCheck />);
    const root = u.toJSON() as { props: Record<string, unknown> };
    expect(root.props.accessibilityElementsHidden).toBe(true);
    expect(root.props.importantForAccessibility).toBe("no-hide-descendants");
  });
});

describe("Chip (Target WP2)", () => {
  it("selected: plate-bright fill, strong edge, ink label, no red square", () => {
    const u = render(<Chip testID="chip" active>Fighters</Chip>);
    const chip = u.getByTestId("chip");
    expect(chip.props.accessibilityState).toEqual({ selected: true });
    expect(chip.props.className).toMatch(/\bbg-surface-4\b/);
    expect(chip.props.className).toMatch(/\bborder-hairline-strong\b/);
    expect(chip.props.className).not.toMatch(RED);
    expect(u.getByText("Fighters").props.className).toMatch(/\btext-ink\b/);
    // The old 6px red square is gone: the label is the only child.
    expect(JSON.stringify(u.toJSON())).not.toMatch(/bg-cta/);
  });

  it("inactive: plate fill, strong edge, ink-2 label", () => {
    const u = render(<Chip testID="chip">Gyms</Chip>);
    const chip = u.getByTestId("chip");
    expect(chip.props.accessibilityState).toEqual({ selected: false });
    expect(chip.props.className).toMatch(/\bbg-surface-3\b/);
    expect(u.getByText("Gyms").props.className).toMatch(/\btext-ink-2\b/);
  });
});

describe("ReadyPanel", () => {
  it("ready: plate-bright with an ink label, never Gain Green", () => {
    const u = render(<ReadyPanel label="You" ready />);
    const panel = u.getByTestId("ready-panel-you");
    expect(panel.props.accessibilityLabel).toBe("You, ready");
    expect(panel.props.className).toMatch(/\bbg-surface-4\b/);
    expect(JSON.stringify(u.toJSON())).not.toMatch(GREEN);
    expect(u.getByText("You").props.className).toMatch(/\btext-ink\b/);
  });

  it("waiting: the plate, ink-2 label", () => {
    const u = render(<ReadyPanel label="You" ready={false} />);
    expect(u.getByTestId("ready-panel-you").props.className).toMatch(/\bbg-surface-3\b/);
    expect(u.getByText("You").props.className).toMatch(/\btext-ink-2\b/);
  });
});

describe("Switch (R3 ST-1)", () => {
  it("renders the neutral track with its required label", () => {
    const u = render(<Switch label="Match results" value onValueChange={() => {}} />);
    const sw = u.UNSAFE_getByType(RNSwitch);
    expect(sw.props.accessibilityLabel).toBe("Match results");
    // The test renderer resolves the dark theme by default or the light one;
    // either way the "on" track is ink, never red or green.
    const on = sw.props.trackColor.true;
    expect([darkTokens.accentCta, darkTokens.statePositive]).not.toContain(on);
    expect([darkTokens.textPrimary, lightTokens.textPrimary]).toContain(on);
    expect([darkTokens.bgPrimary, lightTokens.bgPrimary]).toContain(sw.props.thumbColor);
  });
});

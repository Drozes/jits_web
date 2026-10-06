/**
 * The angle switcher's press feedback (jits-xfvd.16, contract 4.3): the
 * press scale, one `select` haptic on a new angle only, and the busy state
 * while the player is still switching. Labels and testIDs stay as the
 * match-loop harness knows them.
 */
import * as React from "react";
import { fireEvent, render, within } from "@testing-library/react-native";
import { filmChipLabelStyle, filmChipStyle } from "@/components/film-room/film-chip";
import { ON_MEDIA } from "@/lib/theme/palette";
import { AA_NORMAL_TEXT, composite, contrast } from "../../support/token-contrast";
import { AngleSwitcher } from "@/components/film-room/angle-switcher";
import { haptics, __setReduceMotionForTests } from "@/lib/motion";
import { REDUCED_PRESS_OPACITY } from "@/components/ui/pressable-scale";

const mine = { id: "a", is_mine: true, uploaded_by_name: "Kai Reyes", playability: "playable" };
const theirs = { id: "b", is_mine: false, uploaded_by_name: "Dee Okafor", playability: "playable" };

let select: jest.SpyInstance;
beforeEach(() => {
  select = jest.spyOn(haptics, "select").mockResolvedValue(undefined);
});
afterEach(() => {
  select.mockRestore();
  __setReduceMotionForTests(false);
});

describe("AngleSwitcher press feedback", () => {
  it.each(["film", "plate"] as const)("%s: a new angle buzzes once, then selects", (variant) => {
    const onSelect = jest.fn();
    const s = render(<AngleSwitcher variant={variant} angles={[mine, theirs]} activeId="a" onSelect={onSelect} />);
    fireEvent.press(s.getByLabelText("D. OKAFOR'S ANGLE"));
    expect(select).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("b");
    expect(select.mock.invocationCallOrder[0]).toBeLessThan(onSelect.mock.invocationCallOrder[0]);
  });

  it("the active angle does nothing: no haptic, no call", () => {
    const onSelect = jest.fn();
    const s = render(<AngleSwitcher variant="film" angles={[mine, theirs]} activeId="a" onSelect={onSelect} />);
    fireEvent.press(s.getByLabelText("YOUR ANGLE"));
    expect(select).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("marks the busy angle selected and busy, and nothing else", () => {
    const s = render(<AngleSwitcher variant="film" angles={[mine, theirs]} activeId="b" busyId="b" onSelect={jest.fn()} />);
    expect(s.getByTestId("angle-b").props.accessibilityState).toEqual({ selected: true, busy: true });
    expect(s.getByTestId("angle-a").props.accessibilityState).toEqual({ selected: false });
    s.rerender(<AngleSwitcher variant="film" angles={[mine, theirs]} activeId="b" busyId={null} onSelect={jest.fn()} />);
    expect(s.getByTestId("angle-b").props.accessibilityState).toEqual({ selected: true });
  });

  it("keeps the tab roles, labels and testIDs", () => {
    const s = render(<AngleSwitcher variant="film" angles={[mine, theirs]} activeId="a" onSelect={jest.fn()} />);
    expect(s.getByTestId("angle-switcher").props.accessibilityRole).toBe("tablist");
    expect(s.getByTestId("angle-a").props.accessibilityRole).toBe("tab");
    expect(s.getByTestId("angle-a").props.accessibilityLabel).toBe("YOUR ANGLE");
    expect(s.getByTestId("angle-b").props.accessibilityLabel).toBe("D. OKAFOR'S ANGLE");
  });

  it("over film, each angle is a key moment chip: same box and label, the selected one inverted", () => {
    const s = render(<AngleSwitcher variant="film" angles={[mine, theirs]} activeId="a" onSelect={jest.fn()} />);
    expect(s.getByTestId("angle-a")).toHaveStyle(filmChipStyle(true) as Record<string, unknown>);
    expect(s.getByTestId("angle-b")).toHaveStyle(filmChipStyle(false) as Record<string, unknown>);
    expect(s.getByText("YOUR ANGLE")).toHaveStyle(filmChipLabelStyle(true) as Record<string, unknown>);
    expect(s.getByText("D. OKAFOR'S ANGLE")).toHaveStyle(filmChipLabelStyle(false) as Record<string, unknown>);
    expect(filmChipStyle(true)).toMatchObject({ backgroundColor: ON_MEDIA.text, borderColor: ON_MEDIA.text, borderWidth: 1, borderRadius: 2, height: 44 });
    expect(filmChipStyle(false)).toMatchObject({ backgroundColor: ON_MEDIA.badge, borderColor: ON_MEDIA.strong });
    expect(filmChipLabelStyle(true).color).toBe(ON_MEDIA.ink);
    // jits-3liz: the unselected label holds 4.5:1 over a white frame.
    expect(contrast(filmChipLabelStyle(false).color as string, composite(ON_MEDIA.badge, "#FFFFFF"))).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it("the Best angle tag sits inside the chip and holds 4.5:1 over a white frame (jits-tn2h)", () => {
    const s = render(<AngleSwitcher variant="film" angles={[mine, { ...theirs, is_primary: true }]} activeId="a" onSelect={jest.fn()} />);
    const tag = s.getByTestId("angle-best-tag-b");
    expect(within(s.getByTestId("angle-b")).getByTestId("angle-best-b")).toBeTruthy();
    expect(tag).toHaveStyle({ backgroundColor: ON_MEDIA.badge });
    expect(s.getByTestId("angle-best-b")).toHaveStyle({ color: ON_MEDIA.text });
    // Unselected: tag ground = badge over the chip's own fill over a white frame.
    const ground = composite(ON_MEDIA.badge, composite(filmChipStyle(false).backgroundColor as string, "#FFFFFF"));
    expect(contrast(ON_MEDIA.text, ground)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    // Selected: ink on the light chip fill (over white, the worst case for light ink is moot).
    const t = render(<AngleSwitcher variant="film" angles={[mine, { ...theirs, is_primary: true }]} activeId="b" onSelect={jest.fn()} />);
    expect(t.getByTestId("angle-best-b")).toHaveStyle({ color: ON_MEDIA.ink });
    expect(contrast(ON_MEDIA.ink, composite(ON_MEDIA.text, "#000000"))).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it("under Reduce Motion a press dips the opacity and keeps the haptic", () => {
    __setReduceMotionForTests(true);
    const s = render(<AngleSwitcher variant="film" angles={[mine, theirs]} activeId="a" onSelect={jest.fn()} />);
    const seg = s.getByTestId("angle-b");
    fireEvent(seg, "pressIn");
    expect(s.getByTestId("angle-b")).toHaveStyle({ opacity: REDUCED_PRESS_OPACITY });
    fireEvent(seg, "pressOut");
    fireEvent.press(seg);
    expect(select).toHaveBeenCalledTimes(1);
  });
});

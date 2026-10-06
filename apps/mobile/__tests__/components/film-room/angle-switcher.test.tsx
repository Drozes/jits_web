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
import { PressableScale, REDUCED_PRESS_OPACITY } from "@/components/ui/pressable-scale";
import { DISABLED_OPACITY } from "@/components/ui/elo-system/button";

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
    // Outlined in ON_MEDIA.strong so it stays distinct on the badge chip (jits-3liz).
    expect(tag).toHaveStyle({ backgroundColor: ON_MEDIA.badge, borderColor: ON_MEDIA.strong, borderWidth: 1 });
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

describe("AngleSwitcher lock (jits-xfvd.19, contract 07 11.1)", () => {
  const timekeeper = { id: "c", is_mine: false, uploaded_by_name: "Jo Cruz", recording_type: "timekeeper", playability: "playable" };

  it("pending: the tapped chip is selected + busy, every other chip disabled and dimmed to 0.5", () => {
    // Keep-watching: activeId is still the outgoing angle while pending.
    const s = render(<AngleSwitcher variant="film" angles={[mine, theirs, timekeeper]} activeId="a" busyId="b" locked onSelect={jest.fn()} />);
    expect(s.getByTestId("angle-b").props.accessibilityState).toEqual({ selected: true, busy: true });
    expect(s.getByTestId("angle-b")).toHaveStyle(filmChipStyle(true) as Record<string, unknown>);
    for (const id of ["a", "c"]) {
      expect(s.getByTestId(`angle-${id}`).props.accessibilityState).toEqual({ disabled: true, selected: false });
      expect(s.getByTestId(`angle-${id}`)).toHaveStyle({ ...filmChipStyle(false), opacity: DISABLED_OPACITY } as Record<string, unknown>);
    }
    expect(DISABLED_OPACITY).toBe(0.5);
    expect(s.getByTestId("angle-b")).not.toHaveStyle({ opacity: DISABLED_OPACITY });
  });

  it("taps while locked: a disabled chip only calls onIgnoredTap; the busy chip does nothing; never a haptic or a select", () => {
    const onSelect = jest.fn();
    const onIgnoredTap = jest.fn();
    const s = render(<AngleSwitcher variant="film" angles={[mine, theirs, timekeeper]} activeId="a" busyId="b" locked onSelect={onSelect} onIgnoredTap={onIgnoredTap} />);
    fireEvent.press(s.getByTestId("angle-a"));
    fireEvent.press(s.getByTestId("angle-c"));
    expect(onIgnoredTap).toHaveBeenCalledTimes(2);
    fireEvent.press(s.getByTestId("angle-b"));
    expect(onIgnoredTap).toHaveBeenCalledTimes(2);
    expect(onSelect).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
  });

  it("locked chips do not move: no press scale, no Reduce Motion dip", () => {
    __setReduceMotionForTests(true);
    const s = render(<AngleSwitcher variant="film" angles={[mine, theirs]} activeId="a" busyId="b" locked onSelect={jest.fn()} />);
    fireEvent(s.getByTestId("angle-a"), "pressIn");
    expect(s.getByTestId("angle-a")).toHaveStyle({ opacity: DISABLED_OPACITY });
    fireEvent(s.getByTestId("angle-b"), "pressIn");
    expect(s.getByTestId("angle-b")).not.toHaveStyle({ opacity: REDUCED_PRESS_OPACITY });
  });

  it.each(["film", "plate"] as const)("%s: locking and unlocking never remount a chip (same element, screen-reader focus kept)", (variant) => {
    const el = (locked: boolean) => (
      <AngleSwitcher variant={variant} angles={[mine, theirs]} activeId="a" busyId={locked ? "b" : null} locked={locked} onSelect={jest.fn()} />
    );
    const s = render(el(false));
    const a = s.getByTestId("angle-a");
    const b = s.getByTestId("angle-b");
    const scales = s.UNSAFE_getAllByType(PressableScale);
    expect(scales).toHaveLength(2);
    s.rerender(el(true));
    expect(s.getByTestId("angle-a")).toBe(a);
    expect(s.getByTestId("angle-b")).toBe(b);
    expect(s.UNSAFE_getAllByType(PressableScale)).toEqual(scales);
    expect(s.UNSAFE_getAllByType(PressableScale).every((x, i) => x === scales[i])).toBe(true);
    s.rerender(el(false));
    expect(s.getByTestId("angle-a")).toBe(a);
    expect(s.getByTestId("angle-b")).toBe(b);
    expect(s.UNSAFE_getAllByType(PressableScale).every((x, i) => x === scales[i])).toBe(true);
  });

  it("landing (still locked, no busy chip): the landed chip is selected, not dimmed; the rest stay disabled", () => {
    const onIgnoredTap = jest.fn();
    const s = render(<AngleSwitcher variant="film" angles={[mine, theirs]} activeId="b" busyId={null} locked onSelect={jest.fn()} onIgnoredTap={onIgnoredTap} />);
    expect(s.getByTestId("angle-b").props.accessibilityState).toEqual({ selected: true });
    expect(s.getByTestId("angle-b")).not.toHaveStyle({ opacity: DISABLED_OPACITY });
    expect(s.getByTestId("angle-a").props.accessibilityState).toEqual({ disabled: true, selected: false });
    fireEvent.press(s.getByTestId("angle-b"));
    expect(onIgnoredTap).not.toHaveBeenCalled();
    fireEvent.press(s.getByTestId("angle-a"));
    expect(onIgnoredTap).toHaveBeenCalledTimes(1);
    expect(select).not.toHaveBeenCalled();
  });

  it("unlocking restores the tab behavior: one select haptic, then onSelect", () => {
    const onSelect = jest.fn();
    const s = render(<AngleSwitcher variant="film" angles={[mine, theirs]} activeId="b" busyId="b" locked onSelect={onSelect} />);
    s.rerender(<AngleSwitcher variant="film" angles={[mine, theirs]} activeId="b" onSelect={onSelect} />);
    expect(select).not.toHaveBeenCalled();
    expect(s.getByTestId("angle-a").props.accessibilityState).toEqual({ selected: false });
    expect(s.getByTestId("angle-a")).not.toHaveStyle({ opacity: DISABLED_OPACITY });
    fireEvent.press(s.getByTestId("angle-a"));
    expect(select).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("a");
  });

  it("the Best angle tag keeps its badge ground and outline on a locked chip", () => {
    const s = render(<AngleSwitcher variant="film" angles={[mine, { ...theirs, is_primary: true }]} activeId="a" busyId="a" locked onSelect={jest.fn()} />);
    expect(s.getByTestId("angle-best-tag-b")).toHaveStyle({ backgroundColor: ON_MEDIA.badge, borderColor: ON_MEDIA.strong, borderWidth: 1 });
  });

  it("the plate variant is unaffected when not locked (the match page never passes it)", () => {
    const onSelect = jest.fn();
    const s = render(<AngleSwitcher variant="plate" angles={[mine, theirs]} activeId="a" onSelect={onSelect} />);
    expect(s.getByTestId("angle-b").props.accessibilityState).toEqual({ selected: false });
    fireEvent.press(s.getByTestId("angle-b"));
    expect(onSelect).toHaveBeenCalledWith("b");
    expect(select).toHaveBeenCalledTimes(1);
  });
});

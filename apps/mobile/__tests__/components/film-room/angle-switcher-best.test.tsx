/**
 * "Best angle" (jits-n2im.15, COPY-DECK 13) on the angle switcher, the
 * full-screen player's and the match page's: the server-elected primary
 * wears it only when 2+ angles can play and a primary is elected.
 */
import * as React from "react";
import { render } from "@testing-library/react-native";
import { AngleSwitcher, bestAngleId } from "@/components/film-room/angle-switcher";

const mine = { id: "a", is_mine: true, uploaded_by_name: "Kai Reyes", playability: "playable" };
const theirs = { id: "b", is_mine: false, uploaded_by_name: "Dee Okafor", playability: "playable" };

describe("Best angle on the switcher", () => {
  it("marks the primary chip, with the spoken label", () => {
    const s = render(<AngleSwitcher variant="film" angles={[mine, { ...theirs, is_primary: true }]} activeId="a" onSelect={jest.fn()} />);
    expect(s.getByTestId("angle-best-b")).toBeTruthy();
    expect(s.getByText("BEST ANGLE")).toBeTruthy();
    expect(s.getByLabelText("D. OKAFOR'S ANGLE, Best angle")).toBeTruthy();
    // The other chip keeps the label the player and harness always used.
    expect(s.getByLabelText("YOUR ANGLE")).toBeTruthy();
  });

  it("no marker without an elected primary", () => {
    const s = render(<AngleSwitcher angles={[mine, theirs]} activeId="a" onSelect={jest.fn()} />);
    expect(s.queryByText("BEST ANGLE")).toBeNull();
  });

  it("no marker when fewer than two angles can play", () => {
    expect(bestAngleId([{ ...mine, is_primary: true }, { ...theirs, playability: "processing" }])).toBeNull();
    expect(bestAngleId([{ ...mine, is_primary: true }, theirs])).toBe("a");
  });

  it("on the match page it takes the Film status's Best angle, so the plate and the switcher agree", () => {
    const s = render(<AngleSwitcher angles={[{ ...mine, is_primary: true }, theirs]} activeId="a" onSelect={jest.fn()} bestId={null} />);
    expect(s.queryByText("BEST ANGLE")).toBeNull();
    const t = render(<AngleSwitcher angles={[mine, theirs]} activeId="a" onSelect={jest.fn()} bestId="b" />);
    expect(t.getByTestId("angle-best-b")).toBeTruthy();
  });
});

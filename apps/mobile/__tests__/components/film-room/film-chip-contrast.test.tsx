/**
 * The film chip over a bright frame (jits-3liz): the unselected chip's
 * ON_MEDIA.white label must hold WCAG AA 4.5:1 even over a pure white video
 * frame, on every surface that draws the chip (the key moment stepper and
 * the player's angle switcher). The selected chip keeps its inverted look.
 */
import * as React from "react";
import { StyleSheet } from "react-native";
import { render } from "@testing-library/react-native";
import type { KeyMoment } from "@jits/shared/utils";
import { filmChipLabelStyle, filmChipStyle } from "@/components/film-room/film-chip";
import { MomentStepper } from "@/components/film-room/moment-stepper";
import { AngleSwitcher } from "@/components/film-room/angle-switcher";
import { ON_MEDIA } from "@/lib/theme/palette";
import { AA_NORMAL_TEXT, composite, contrast } from "../../support/token-contrast";

const WHITE_FRAME = "#FFFFFF";
const BLACK_FRAME = "#000000";

/** The label's contrast against the chip fill flattened over a frame. */
function labelContrast(fill: string, ink: string, frame: string): number {
  return contrast(ink, composite(fill, frame));
}

function flat(style: unknown): Record<string, unknown> {
  return StyleSheet.flatten(style as never) as Record<string, unknown>;
}

const moments: KeyMoment[] = [
  { t: 6, label: "Takedown", kind: "score", description: null },
  { t: 38, label: "Sweep", kind: "score", description: null },
];

describe("film chip contrast over film (jits-3liz)", () => {
  it("the unselected ground is the on-media text ground, ON_MEDIA.badge, with the border unchanged", () => {
    expect(filmChipStyle(false)).toMatchObject({ backgroundColor: ON_MEDIA.badge, borderColor: ON_MEDIA.strong, borderWidth: 1 });
    expect(filmChipLabelStyle(false).color).toBe(ON_MEDIA.white);
  });

  it("the selected chip stays inverted: ON_MEDIA.text fill and edge, ON_MEDIA.ink label", () => {
    expect(filmChipStyle(true)).toMatchObject({ backgroundColor: ON_MEDIA.text, borderColor: ON_MEDIA.text });
    expect(filmChipLabelStyle(true).color).toBe(ON_MEDIA.ink);
  });

  it.each([
    ["white", WHITE_FRAME],
    ["black", BLACK_FRAME],
  ])("the unselected label holds 4.5:1 over a %s frame", (_name, frame) => {
    const fill = filmChipStyle(false).backgroundColor as string;
    expect(labelContrast(fill, filmChipLabelStyle(false).color as string, frame)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it("key moment stepper: the unselected chip and its arrows hold 4.5:1 over a white frame", () => {
    // Playhead past the first moment but not on it: the middle chip is unselected.
    const s = render(<MomentStepper moments={moments} positionS={20} currentT={null} onJump={jest.fn()} />);
    const current = flat(s.getByTestId("moment-step-current").props.style);
    expect(current.backgroundColor).toBe(ON_MEDIA.badge);
    for (const id of ["moment-step-time", "moment-step-count"]) {
      const ink = flat(s.getByTestId(id).props.style).color as string;
      expect(labelContrast(current.backgroundColor as string, ink, WHITE_FRAME)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    }
    for (const id of ["moment-step-prev", "moment-step-next"]) {
      const fill = flat(s.getByTestId(id).props.style).backgroundColor as string;
      expect(fill).toBe(ON_MEDIA.badge);
      expect(labelContrast(fill, ON_MEDIA.white, WHITE_FRAME)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    }
  });

  it("angle switcher over film: the unselected angle holds 4.5:1 over a white frame", () => {
    const angles = [
      { id: "a", is_mine: true, uploaded_by_name: "Kai Reyes", playability: "playable" },
      { id: "b", is_mine: false, uploaded_by_name: "Dee Okafor", playability: "playable" },
    ];
    const s = render(<AngleSwitcher variant="film" angles={angles} activeId="a" onSelect={jest.fn()} />);
    const fill = flat(s.getByTestId("angle-b").props.style).backgroundColor as string;
    const ink = flat(s.getByText("D. OKAFOR'S ANGLE").props.style).color as string;
    expect(fill).toBe(ON_MEDIA.badge);
    expect(labelContrast(fill, ink, WHITE_FRAME)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
});

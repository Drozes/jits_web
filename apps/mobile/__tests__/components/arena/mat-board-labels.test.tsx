/**
 * Small Mat Board contracts: what VoiceOver reads for an On The Mat row
 * (AC-A4: every fact the row shows), and the degraded-state plates' neutral
 * rail (spec 3: Signal Red only for "someone wants you" and the one CTA).
 *
 * Source: apps/mobile/components/arena/mat-board.tsx, arena-plates.tsx
 */
import * as React from "react";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
import { render } from "@testing-library/react-native";
import { matRowLabel, spokenGap } from "@/components/arena/mat-board";
import { CapPlate, RosterErrorPlate } from "@/components/arena/arena-plates";

describe("spokenGap", () => {
  it("spells the sign out", () => {
    expect(spokenGap(40)).toBe("plus 40");
    expect(spokenGap(-12)).toBe("minus 12");
    expect(spokenGap(0)).toBe("even");
  });
});

describe("matRowLabel", () => {
  it("reads the name, rating, gap and weight", () => {
    expect(matRowLabel("Alex", 1412, 40, 185, false)).toBe(
      "Alex, ELO 1412, plus 40 vs you, 185 pounds",
    );
  });
  it("leaves out a missing weight and ends with the rematch tag", () => {
    expect(matRowLabel("Sam", 1300, -5, null, true)).toBe("Sam, ELO 1300, minus 5 vs you, rematch");
  });
});

describe("degraded plates", () => {
  it.each([
    ["cap", () => <CapPlate onDismiss={jest.fn()} />, "arena-cap-plate"],
    ["roster error", () => <RosterErrorPlate onRetry={jest.fn()} />, "arena-roster-error-plate"],
  ])("the %s plate has a neutral ink-3 rail, never Signal Red", (_n, el, testID) => {
    const { getByTestId } = render(el());
    const cls = String(getByTestId(testID).props.className);
    expect(cls).toMatch(/border-l-ink-3/);
    expect(cls).not.toMatch(/border-l-cta/);
  });
});

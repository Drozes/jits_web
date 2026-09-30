import { formatRecord, recordA11yLabel } from "@/lib/athlete/record";

describe("formatRecord", () => {
  it("renders the compact mono record line", () => {
    expect(formatRecord({ wins: 14, losses: 6, draws: 1 })).toBe("14W · 6L · 1D");
    expect(formatRecord({ wins: 0, losses: 0, draws: 0 })).toBe("0W · 0L · 0D");
  });
});

describe("recordA11yLabel", () => {
  it("spells the record out, singular for exactly one", () => {
    expect(recordA11yLabel({ wins: 14, losses: 6, draws: 1 })).toBe(
      "Record: 14 wins, 6 losses, 1 draw",
    );
    expect(recordA11yLabel({ wins: 1, losses: 1, draws: 2 })).toBe(
      "Record: 1 win, 1 loss, 2 draws",
    );
    expect(recordA11yLabel({ wins: 0, losses: 0, draws: 0 })).toBe(
      "Record: 0 wins, 0 losses, 0 draws",
    );
  });
});

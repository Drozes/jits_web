/**
 * Tests for the gym-owner stats formatters (H8 gym stats + H10 bracket
 * drill-down): formatRangeLabel, formatRangeSuffix, formatPct, formatFinishTime,
 * formatMomentum, formatTierLabel, formatBracketRange.
 *
 * Source: apps/mobile/lib/gym-manager/stats-format.ts
 */

import {
  formatBracketRange,
  formatElo,
  formatFinishTime,
  formatMomentum,
  formatPct,
  formatRangeLabel,
  formatRangeSuffix,
  formatTierLabel,
} from "@/lib/gym-manager/stats-format";

describe("formatRangeLabel", () => {
  it("labels each range for the filter chips", () => {
    expect(formatRangeLabel("30d")).toBe("30 Days");
    expect(formatRangeLabel("90d")).toBe("90 Days");
    expect(formatRangeLabel("all")).toBe("All Time");
  });
});

describe("formatRangeSuffix", () => {
  it("returns a short inline suffix", () => {
    expect(formatRangeSuffix("30d")).toBe("30d");
    expect(formatRangeSuffix("90d")).toBe("90d");
    expect(formatRangeSuffix("all")).toBe("All");
  });
});

describe("formatPct", () => {
  it("rounds a fraction to a whole percent", () => {
    expect(formatPct(0.78)).toBe("78%");
    expect(formatPct(0.225)).toBe("23%");
  });

  it("renders the extremes", () => {
    expect(formatPct(0)).toBe("0%");
    expect(formatPct(1)).toBe("100%");
  });

  it("clamps out-of-range input", () => {
    expect(formatPct(1.4)).toBe("100%");
    expect(formatPct(-0.2)).toBe("0%");
  });

  it("guards non-finite input", () => {
    expect(formatPct(NaN)).toBe("0%");
    expect(formatPct(Infinity)).toBe("0%");
  });
});

describe("formatFinishTime", () => {
  it("formats seconds as m:ss with no leading zero on minutes", () => {
    expect(formatFinishTime(194)).toBe("3:14");
    expect(formatFinishTime(402)).toBe("6:42");
  });

  it("zero-pads the seconds", () => {
    expect(formatFinishTime(125)).toBe("2:05");
  });

  it("rounds to the nearest second", () => {
    expect(formatFinishTime(125.6)).toBe("2:06");
  });

  it("renders an em-dash for no data or invalid input", () => {
    expect(formatFinishTime(0)).toBe("—");
    expect(formatFinishTime(-5)).toBe("—");
    expect(formatFinishTime(NaN)).toBe("—");
  });
});

describe("formatElo", () => {
  it("rounds a one-decimal aggregate ELO to a whole number", () => {
    expect(formatElo(1487.3)).toBe("1487");
    expect(formatElo(1502.6)).toBe("1503");
  });

  it("leaves an already-integer value untouched", () => {
    expect(formatElo(1500)).toBe("1500");
  });

  it("guards non-finite input", () => {
    expect(formatElo(NaN)).toBe("0");
    expect(formatElo(Infinity)).toBe("0");
  });
});

describe("formatMomentum", () => {
  it("signs a positive momentum", () => {
    expect(formatMomentum(12)).toBe("+12");
  });

  it("uses the unicode minus glyph for negative momentum", () => {
    expect(formatMomentum(-7)).toBe("−7");
  });

  it("renders zero without a sign", () => {
    expect(formatMomentum(0)).toBe("0");
  });

  it("rounds before signing", () => {
    expect(formatMomentum(8.4)).toBe("+8");
    expect(formatMomentum(-2.6)).toBe("−3");
  });

  it("guards non-finite input", () => {
    expect(formatMomentum(NaN)).toBe("0");
  });
});

describe("formatTierLabel", () => {
  it("maps each known bracket to its tier label", () => {
    expect(formatTierLabel("1900+")).toBe("Top Tier");
    expect(formatTierLabel("1700-1900")).toBe("Advanced");
    expect(formatTierLabel("1500-1700")).toBe("Intermediate");
    expect(formatTierLabel("1300-1500")).toBe("Developing · Provisional");
  });

  it("returns an empty string for an unknown bracket", () => {
    expect(formatTierLabel("9000+")).toBe("");
  });
});

describe("formatBracketRange", () => {
  it("converts the hyphen to an en dash", () => {
    expect(formatBracketRange("1700-1900")).toBe("1700–1900");
  });

  it("leaves the open-ended top bracket untouched", () => {
    expect(formatBracketRange("1900+")).toBe("1900+");
  });
});

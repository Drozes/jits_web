/**
 * `matches.duration_seconds` is the configured clock, so match detail labels
 * it as a round length instead of a bare "10:00" (jits-32ah).
 *
 * Source: apps/mobile/components/match-detail/match-meta-row.tsx
 */
import { formatRoundLength } from "@/components/match-detail/match-meta-row";

describe("formatRoundLength", () => {
  it.each([
    [600, "10 MIN ROUND"],
    [300, "5 MIN ROUND"],
    [60, "1 MIN ROUND"],
    [185, "3:05 ROUND"],
    [45, "0:45 ROUND"],
  ])("%s seconds reads %s", (seconds, expected) => {
    expect(formatRoundLength(seconds)).toBe(expected);
  });

  it.each([null, undefined, 0, -5, Number.NaN])("hides a missing clock (%s)", (value) => {
    expect(formatRoundLength(value as number | null | undefined)).toBeNull();
  });
});

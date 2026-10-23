/**
 * The face-off's stakes-free division gap (timekeeper mode A28): the same
 * buckets as jr_be `get_weight_division` (`20260217000000`), inclusive upper
 * bounds in lbs.
 */
import { weightDivision, weightDivisionGap } from "@/lib/match-flow/weight-division";

describe("weightDivision", () => {
  it.each([
    [100, 0],
    [122.5, 0],
    [122.6, 1],
    [136, 1],
    [136.1, 2],
    [149, 2],
    [162, 3],
    [175.5, 4],
    [175.6, 5],
    [188.5, 5],
    [202, 6],
    [215, 7],
    [215.1, 8],
    [400, 8],
  ])("%p lbs is division %p", (lbs, division) => {
    expect(weightDivision(lbs)).toBe(division);
  });
});

describe("weightDivisionGap", () => {
  it("is 0 inside one division, either order", () => {
    expect(weightDivisionGap(170, 172.5)).toBe(0);
    expect(weightDivisionGap(172.5, 170)).toBe(0);
  });

  it("counts the divisions between the two weights", () => {
    expect(weightDivisionGap(170, 180)).toBe(1);
    expect(weightDivisionGap(180, 170)).toBe(1);
    expect(weightDivisionGap(120, 220)).toBe(8);
  });

  it("a bound belongs to the lighter division", () => {
    expect(weightDivisionGap(175.5, 175.6)).toBe(1);
    expect(weightDivisionGap(175, 175.5)).toBe(0);
  });
});

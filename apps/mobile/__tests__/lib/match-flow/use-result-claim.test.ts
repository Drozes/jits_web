import { winningClaim } from "@/lib/match-flow/use-result-claim";

describe("winningClaim", () => {
  it("the earlier claim stands", () => {
    expect(winningClaim({ athleteId: "b", at: 1 }, { athleteId: "a", at: 2 }).athleteId).toBe("b");
  });
  it("an exact tie goes to the lower athlete id, the same on both phones", () => {
    const x = { athleteId: "a", at: 5 };
    const y = { athleteId: "b", at: 5 };
    expect(winningClaim(x, y)).toBe(x);
    expect(winningClaim(y, x)).toBe(x);
  });
});

import { matchDetailHref } from "@/lib/match-detail/href";

describe("matchDetailHref", () => {
  it("builds the pushed match detail route", () => {
    expect(matchDetailHref("m-1")).toBe("/(app)/match-detail/m-1");
  });
});

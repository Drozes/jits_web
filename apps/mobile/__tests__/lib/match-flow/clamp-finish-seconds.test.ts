import { clampFinishSeconds } from "@/lib/match-flow/clamp-finish-seconds";

describe("clampFinishSeconds", () => {
  it("passes an in-range clock through", () => {
    expect(clampFinishSeconds(270, 600)).toBe(270);
  });
  it("raises zero to 1 (the BE rejects <= 0)", () => {
    expect(clampFinishSeconds(0, 600)).toBe(1);
  });
  it("caps an overshoot at the duration", () => {
    expect(clampFinishSeconds(602, 600)).toBe(600);
  });
});

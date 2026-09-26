import { describe, it, expect } from "vitest";
import { matchRowLabel } from "./match-row-label";

describe("matchRowLabel", () => {
  it("ranked rows carry outcome and signed delta", () => {
    expect(matchRowLabel("Demo Red", "win", "ranked", 12)).toBe("Open match vs Demo Red, win, +12");
    expect(matchRowLabel("Demo Red", "loss", "ranked", -9)).toBe("Open match vs Demo Red, loss, -9");
    expect(matchRowLabel("Demo Red", "draw", "ranked", 0)).toBe("Open match vs Demo Red, draw, 0");
  });
  it("casual rows and unknown deltas omit the delta; unknown outcomes are dropped", () => {
    expect(matchRowLabel("Demo Red", "win", "casual", 12)).toBe("Open match vs Demo Red, win");
    expect(matchRowLabel("Demo Red", "win", "ranked", null)).toBe("Open match vs Demo Red, win");
    expect(matchRowLabel("Demo Red", null, undefined, undefined)).toBe("Open match vs Demo Red");
  });
});

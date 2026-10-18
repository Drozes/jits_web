import { describe, expect, it } from "vitest";
import { BLOCK_TIERS, ONELINE_TIERS } from "./hero-lockup";
import { pickTier } from "./lockup-tier";

const FRAC = 0.3477;
/** The set width (CSS px) whose crown is `crownPx` device px at `dpr`. */
const widthFor = (crownPx: number, dpr = 1) => crownPx / FRAC / dpr;

describe("pickTier", () => {
  it("one-line: detail from 175 device px of crown, fine from 112, small below", () => {
    expect(pickTier(widthFor(175), FRAC, 1, ONELINE_TIERS)).toBe("detail");
    expect(pickTier(widthFor(174), FRAC, 1, ONELINE_TIERS)).toBe("fine");
    expect(pickTier(widthFor(112), FRAC, 1, ONELINE_TIERS)).toBe("fine");
    expect(pickTier(widthFor(111), FRAC, 1, ONELINE_TIERS)).toBe("small");
  });

  it("block: b3 from 108 device px, b3sm below", () => {
    expect(pickTier(108, 1, 1, BLOCK_TIERS)).toBe("b3");
    expect(pickTier(107, 1, 1, BLOCK_TIERS)).toBe("b3sm");
  });

  it("scales by device pixel ratio", () => {
    expect(pickTier(60, 1, 1, BLOCK_TIERS)).toBe("b3sm");
    expect(pickTier(60, 1, 3, BLOCK_TIERS)).toBe("b3");
    expect(pickTier(400, FRAC, 1, ONELINE_TIERS)).toBe("fine");
    expect(pickTier(400, FRAC, 3, ONELINE_TIERS)).toBe("detail");
  });
});

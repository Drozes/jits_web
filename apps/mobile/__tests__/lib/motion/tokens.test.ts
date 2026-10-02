/**
 * Motion tokens (Adding Flare, jits-pddd.1): the Motion Rule values, and
 * the odometer roll, LIVE pulse and fight easing follow them so the
 * app keeps one rhythm.
 */
import { duration, tempo, spring, PRESS_SCALE, BRAND_EASE_OUT_CURVE, easing } from "@/lib/motion";
import { ROLL_MS } from "@/components/ui/elo-system/rolling-number";
import { FIGHT_EASING } from "@/components/match-flow/fight/fight-tokens";

describe("motion tokens", () => {
  it("declares the Motion Rule durations", () => {
    expect(duration).toEqual({
      instant: 100,
      fast: 240,
      base: 480,
      slow: 720,
      pulse: 1400,
      ember: 2400,
      shimmer: 1400,
    });
  });

  it("declares the LIVE pulse tempo, slower when quiet and faster when busy", () => {
    expect(tempo).toEqual({ quiet: 3000, normal: 1600, busy: 800 });
  });

  it("declares the press and select springs and the press scale", () => {
    expect(spring.press).toEqual({ damping: 18, stiffness: 300 });
    expect(spring.select).toEqual({ damping: 14, stiffness: 260 });
    expect(PRESS_SCALE).toBe(0.97);
  });

  it("exposes the brand ease-out curve and Reanimated easings", () => {
    expect(BRAND_EASE_OUT_CURVE).toEqual([0.22, 1, 0.36, 1]);
    expect(easing.brandOut).toBeDefined();
    expect(easing.outCubic).toBeDefined();
  });

  it("keeps the odometer roll within the slow ceiling and the fight easing on the tokens", () => {
    // The odometer roll replaced the 480ms tick (slice D); no dedicated token.
    expect(ROLL_MS).toBeGreaterThanOrEqual(duration.base);
    expect(ROLL_MS).toBeLessThanOrEqual(duration.slow);
    expect(FIGHT_EASING).toBe(BRAND_EASE_OUT_CURVE);
  });
});

import { describe, expect, it } from "vitest";
import { TICK_PATTERN } from "./landing.test-utils";
import { formatTick, nextTick, sampleTick, TICKER_WEIGHTS } from "./ticker-samples";

/** Deterministic PRNG (mulberry32). */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("ticker samples", () => {
  it("formats exactly: weight class, outcome word, arrow and size", () => {
    expect(formatTick({ lbs: 175.5, outcome: "WIN", delta: 14 })).toBe("175.5 LBS · WIN ▲14");
    expect(formatTick({ lbs: 162, outcome: "DRAW", delta: 2 })).toBe("162 LBS · DRAW ▲2");
    expect(formatTick({ lbs: 188.5, outcome: "LOSS", delta: -9 })).toBe("188.5 LBS · LOSS ▼9");
    expect(formatTick({ lbs: 136, outcome: "DRAW", delta: -1 })).toBe("136 LBS · DRAW ▼1");
  });

  it("stays in range over 10,000 seeded draws, with 40/40/20 outcomes and no zero", () => {
    const random = seeded(42);
    const counts = { WIN: 0, LOSS: 0, DRAW: 0 };
    for (let i = 0; i < 10_000; i++) {
      const s = sampleTick(random);
      counts[s.outcome]++;
      expect(s.delta).not.toBe(0);
      if (s.outcome === "WIN") expect(s.delta).toBeGreaterThan(0);
      if (s.outcome === "LOSS") expect(s.delta).toBeLessThan(0);
      expect(formatTick(s)).toMatch(TICK_PATTERN);
    }
    expect(Math.abs(counts.WIN / 100 - 40)).toBeLessThanOrEqual(2);
    expect(Math.abs(counts.LOSS / 100 - 40)).toBeLessThanOrEqual(2);
    expect(Math.abs(counts.DRAW / 100 - 20)).toBeLessThanOrEqual(2);
  });

  it("never names anyone or a belt", () => {
    const random = seeded(7);
    for (let i = 0; i < 500; i++) expect(formatTick(sampleTick(random))).not.toMatch(/WHITE|BLUE|PURPLE|BROWN|BLACK|[a-z]/);
  });

  it("keeps edge values of random in range", () => {
    for (const v of [0, 0.999999]) {
      const s = sampleTick(() => v);
      expect(formatTick(s)).toMatch(TICK_PATTERN);
      expect(TICKER_WEIGHTS).toContain(s.lbs);
    }
  });

  it("never repeats the previous tick, even with a stuck random", () => {
    const random = seeded(3);
    let prev = nextTick(null, random);
    for (let i = 0; i < 2_000; i++) {
      const next = nextTick(prev, random);
      expect(formatTick(next)).not.toBe(formatTick(prev));
      prev = next;
    }
    const stuck = () => 0.5;
    const first = nextTick(null, stuck);
    expect(formatTick(nextTick(first, stuck))).not.toBe(formatTick(first));
  });
});

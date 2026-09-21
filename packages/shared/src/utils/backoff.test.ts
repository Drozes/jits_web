import { describe, expect, it } from "vitest";
import { backoffDelayMs } from "./backoff";

const OPTS = { baseMs: 1_000, maxMs: 30_000 };

describe("backoffDelayMs", () => {
  it("doubles the ceiling per attempt", () => {
    // random() === 1 yields the ceiling exactly.
    const top = (attempt: number) => backoffDelayMs(attempt, { ...OPTS, random: () => 1 });
    expect(top(1)).toBe(1_000);
    expect(top(2)).toBe(2_000);
    expect(top(3)).toBe(4_000);
    expect(top(4)).toBe(8_000);
  });

  it("never returns zero, which is what the old two-immediate-attempts loop did", () => {
    // Full jitter (`random() * ceiling`) would return 0 here and retry
    // instantly against the link that just failed. Equal jitter floors at
    // half the ceiling.
    for (let attempt = 1; attempt <= 8; attempt++) {
      expect(backoffDelayMs(attempt, { ...OPTS, random: () => 0 })).toBe(
        Math.min(OPTS.maxMs, OPTS.baseMs * 2 ** (attempt - 1)) / 2,
      );
    }
  });

  it("stays inside [ceiling / 2, ceiling] for any random value", () => {
    for (const r of [0, 0.01, 0.25, 0.5, 0.75, 0.999, 1]) {
      for (let attempt = 1; attempt <= 6; attempt++) {
        const ceiling = Math.min(OPTS.maxMs, OPTS.baseMs * 2 ** (attempt - 1));
        const delay = backoffDelayMs(attempt, { ...OPTS, random: () => r });
        expect(delay).toBeGreaterThanOrEqual(ceiling / 2);
        expect(delay).toBeLessThanOrEqual(ceiling);
      }
    }
  });

  it("caps at maxMs however long the retry chain gets", () => {
    expect(backoffDelayMs(50, { ...OPTS, random: () => 1 })).toBe(30_000);
    expect(backoffDelayMs(50, { ...OPTS, random: () => 0 })).toBe(15_000);
  });

  it("does not produce NaN at absurd attempt counts", () => {
    // `2 ** 1024` is Infinity and `Infinity * 0` is NaN, which setTimeout
    // treats as "fire immediately" -- the exact bug being avoided.
    const delay = backoffDelayMs(5_000, { ...OPTS, random: () => 0 });
    expect(Number.isFinite(delay)).toBe(true);
    expect(delay).toBe(15_000);
  });

  it("clamps attempt 0 and negatives to the first attempt's window", () => {
    expect(backoffDelayMs(0, { ...OPTS, random: () => 1 })).toBe(1_000);
    expect(backoffDelayMs(-3, { ...OPTS, random: () => 1 })).toBe(1_000);
  });

  it("spreads a fleet of clients rather than retrying in lockstep", () => {
    // The point of jitter: 200 devices that failed on the same congested
    // gym wifi must not all come back at the same millisecond.
    const delays = new Set(
      Array.from({ length: 200 }, () => backoffDelayMs(3, { ...OPTS })),
    );
    expect(delays.size).toBeGreaterThan(50);
  });
});

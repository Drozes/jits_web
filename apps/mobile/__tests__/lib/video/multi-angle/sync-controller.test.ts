import {
  DEADBAND_S,
  DriftFilter,
  FRAME_S,
  GAIN,
  HARD_SEEK_HIDDEN_S,
  HARD_SEEK_VISIBLE_S,
  MAX_NUDGE,
  ResidualStats,
  SEEK_SETTLE_MS,
  correctionFor,
  extrapolate,
} from "@/lib/video/multi-angle/sync-controller";

describe("correctionFor (drift correction math)", () => {
  it("holds at the base rate inside one frame", () => {
    expect(correctionFor(0, 1, true)).toEqual({ kind: "hold", rate: 1 });
    expect(correctionFor(DEADBAND_S, 0.5, false)).toEqual({ kind: "hold", rate: 0.5 });
    expect(correctionFor(-FRAME_S * 0.9, 1, true)).toEqual({ kind: "hold", rate: 1 });
  });

  it("slows a slave that runs ahead and speeds one that lags, proportionally", () => {
    const ahead = correctionFor(0.06, 1, true);
    expect(ahead.kind).toBe("nudge");
    if (ahead.kind === "nudge") expect(ahead.rate).toBeCloseTo(1 - 0.06 * GAIN, 6);
    const behind = correctionFor(-0.06, 1, true);
    if (behind.kind === "nudge") expect(behind.rate).toBeCloseTo(1 + 0.06 * GAIN, 6);
  });

  it("nudges relative to the athlete's speed (slow motion stays slow)", () => {
    const c = correctionFor(0.06, 0.25, true);
    expect(c.kind).toBe("nudge");
    if (c.kind === "nudge") expect(c.rate).toBeCloseTo(0.25 * (1 - 0.06 * GAIN), 6);
  });

  it("clamps the nudge to +-MAX_NUDGE", () => {
    const c = correctionFor(0.2, 1, true);
    expect(c).toEqual({ kind: "nudge", rate: 1 - MAX_NUDGE });
    const d = correctionFor(-0.2, 1, true);
    expect(d).toEqual({ kind: "nudge", rate: 1 + MAX_NUDGE });
  });

  it("re-seeks past the threshold: later for the visible angle than a hidden one", () => {
    expect(correctionFor(HARD_SEEK_HIDDEN_S, 1, false)).toEqual({ kind: "seek" });
    expect(correctionFor(HARD_SEEK_HIDDEN_S, 1, true).kind).toBe("nudge");
    expect(correctionFor(HARD_SEEK_VISIBLE_S, 1, true)).toEqual({ kind: "seek" });
    expect(correctionFor(-2, 1, true)).toEqual({ kind: "seek" });
  });

  it("re-seeks on a non-finite error", () => {
    expect(correctionFor(Number.NaN, 1, true)).toEqual({ kind: "seek" });
  });
});

describe("extrapolate", () => {
  it("advances a playing sample by elapsed time times the rate", () => {
    expect(extrapolate({ t: 10, at: 1000 }, 1500, true, 1)).toBeCloseTo(10.5, 6);
    expect(extrapolate({ t: 10, at: 1000 }, 1500, true, 0.5)).toBeCloseTo(10.25, 6);
  });
  it("holds a paused sample and has nothing without one", () => {
    expect(extrapolate({ t: 10, at: 1000 }, 9000, false, 1)).toBe(10);
    expect(extrapolate(null, 0, true, 1)).toBeNull();
  });
});

describe("DriftFilter", () => {
  it("smooths as the median of the last three samples (a jitter spike is ignored)", () => {
    const f = new DriftFilter();
    expect(f.push(0.02, 0)).toBe(0.02);
    expect(f.push(0.3, 1)).toBe(0.3); // two samples: the upper median
    expect(f.push(0.03, 2)).toBe(0.03);
    expect(f.push(0.04, 3)).toBe(0.04);
  });
  it("settles after a seek: no verdict until SEEK_SETTLE_MS, with a fresh history", () => {
    const f = new DriftFilter();
    f.push(0.5, 0);
    f.seeked(100);
    expect(f.push(0.4, 100 + SEEK_SETTLE_MS - 1)).toBeNull();
    expect(f.push(0.01, 100 + SEEK_SETTLE_MS)).toBe(0.01);
  });
});

describe("ResidualStats", () => {
  it("reports absolute-ms percentiles", () => {
    const r = new ResidualStats();
    for (let i = 1; i <= 100; i += 1) r.add((i % 2 ? 1 : -1) * i / 1000);
    expect(r.count).toBe(100);
    expect(r.percentile(50)).toBe(50);
    expect(r.percentile(95)).toBe(95);
  });
  it("is null when empty and keeps a bounded sample", () => {
    const r = new ResidualStats(3);
    expect(r.percentile(50)).toBeNull();
    [0.001, 0.002, 0.003, 0.1].forEach((v) => r.add(v));
    expect(r.count).toBe(3);
    expect(r.percentile(100)).toBe(100);
  });
});

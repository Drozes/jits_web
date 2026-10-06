import {
  ABANDON_TIMEOUT_MS,
  FAILURE_ABANDON_REASONS,
  IN_STEP_SAMPLES,
  KEEP_WATCHING_CAP_MS,
  LEAD_SAFETY,
  MAX_HIDDEN_RESEEKS,
  MAX_RETARGETS,
  clampIncoming,
  decideChase,
  decideStart,
  incomingTarget,
  isDecoderError,
  mapToIncoming,
  networkClassOf,
  rampGains,
  retryNeedsResign,
  waitUntilTarget,
} from "@/lib/match-detail/keep-watching";
import { FRAME_S, HARD_SEEK_HIDDEN_S, MAX_NUDGE, SWAP_MAX_ERROR_S } from "@/lib/video/multi-angle/sync-controller";

/** The keep-watching planner (jits-xfvd.19, contract 07 sections 3 and 4): pure. */
describe("keep-watching planner", () => {
  it("classes networks: wifi and ethernet fast, 4G and 5G cellular, everything else slow", () => {
    expect(networkClassOf("wifi")).toBe("fast");
    expect(networkClassOf("ethernet")).toBe("fast");
    expect(networkClassOf("cellular_5g")).toBe("cellular");
    expect(networkClassOf("cellular_4g")).toBe("cellular");
    expect(networkClassOf("cellular_3g")).toBe("slow");
    expect(networkClassOf("unknown")).toBe("slow");
    expect(networkClassOf(null)).toBe("slow");
  });

  it("the abandon timeout is always past the cap", () => {
    for (const cls of ["fast", "cellular", "slow"] as const) expect(ABANDON_TIMEOUT_MS[cls]).toBeGreaterThan(KEEP_WATCHING_CAP_MS[cls]);
    expect([...FAILURE_ABANDON_REASONS].sort()).toEqual(["decoder_error", "load_error", "sign_failed", "timeout"]);
  });

  describe("t0", () => {
    it("maps A's time through the offsets and adds the lead in media time (lead * rate)", () => {
      // B started 2 s after A: A 10 s is B 8 s; a 1 s lead at 1x lands at 9.
      expect(incomingTarget({ aNowS: 10, leadS: 1, rate: 1, fromOffsetMs: 0, toOffsetMs: 2000, durationBS: 400 })).toEqual({ t0S: 9, covered: true });
      // Slow motion: the same wall lead is less media.
      expect(incomingTarget({ aNowS: 10, leadS: 1, rate: 0.25, fromOffsetMs: 0, toOffsetMs: 2000, durationBS: 400 }).t0S).toBeCloseTo(8.25);
      // 2x: more media.
      expect(incomingTarget({ aNowS: 10, leadS: 1, rate: 2, fromOffsetMs: 0, toOffsetMs: 2000, durationBS: 400 }).t0S).toBe(10);
      // Paused: exact, fractional, never floored.
      expect(incomingTarget({ aNowS: 10.37, leadS: 0, rate: 1, fromOffsetMs: 500, toOffsetMs: 0, durationBS: null }).t0S).toBeCloseTo(10.87);
    });

    it("unknown offsets map one to one", () => {
      expect(mapToIncoming(12.5, null, 300)).toBe(12.5);
      expect(mapToIncoming(12.5, 100, 300)).toBeCloseTo(12.3);
    });

    it("an angle that does not cover the moment clamps to its edge (covered false)", () => {
      // B started 30 s after A: A 10 s is before B's first frame.
      expect(incomingTarget({ aNowS: 10, leadS: 1, rate: 1, fromOffsetMs: 0, toOffsetMs: 30000, durationBS: 400 })).toEqual({ t0S: 0, covered: false });
      // Past B's end: 0.5 s short of it.
      expect(incomingTarget({ aNowS: 120, leadS: 1, rate: 1, fromOffsetMs: 0, toOffsetMs: 0, durationBS: 60 })).toEqual({ t0S: 59.5, covered: false });
      expect(clampIncoming(30, null)).toEqual({ t: 30, covered: true });
    });
  });

  describe("start decision (3.3 step 3)", () => {
    const base = { startLatencyS: 0.12, retargets: 0, mappedANowS: 10, leadS: 1, readyMs: 600, rate: 1, durationBS: 400 };

    it("waits in wall seconds: (t0 - mapped A) / rate", () => {
      expect(waitUntilTarget(11, 10, 1)).toBe(1);
      expect(waitUntilTarget(11, 10, 2)).toBe(0.5);
      expect(waitUntilTarget(9, 10, 1)).toBe(-1);
    });

    it("schedules play() a start latency before A reaches t0", () => {
      expect(decideStart({ ...base, waitS: 0.62 })).toEqual({ kind: "schedule", inMs: expect.closeTo(500, 5) });
      expect(decideStart({ ...base, waitS: 0.12 })).toEqual({ kind: "schedule", inMs: 0 });
    });

    it("late: retargets ahead by at least what the load took, at most MAX_RETARGETS times, then chases", () => {
      const late = decideStart({ ...base, waitS: 0.05, readyMs: 2000 });
      // max(lead 1, 1.3 * 2 + 0.2 = 2.8) ahead of A.
      expect(late).toEqual({ kind: "retarget", t0S: expect.closeTo(10 + LEAD_SAFETY * 2 + 0.2, 6) });
      expect(decideStart({ ...base, waitS: 0.05, readyMs: 100 })).toEqual({ kind: "retarget", t0S: 11 });
      expect(decideStart({ ...base, waitS: -1, retargets: MAX_RETARGETS })).toEqual({ kind: "chase" });
    });

    it("a retarget never aims past B's end", () => {
      expect(decideStart({ ...base, waitS: -1, mappedANowS: 399.8, durationBS: 400 })).toEqual({ kind: "retarget", t0S: 399.5 });
    });
  });

  describe("chase (3.3 steps 4 and 5)", () => {
    const base = { inStep: 0, rate: 1, hiddenReseeks: 0, mappedANowS: 20, startLatencyS: 0.12, elapsedMs: 1000, capMs: 4000, approximate: false };

    it("lands after IN_STEP_SAMPLES consecutive samples within 2 frames", () => {
      const first = decideChase({ ...base, errorS: SWAP_MAX_ERROR_S * 0.9 });
      expect(first).toEqual({ kind: "hold", inStep: 1 });
      expect(IN_STEP_SAMPLES).toBe(2);
      expect(decideChase({ ...base, errorS: -FRAME_S, inStep: 1 })).toEqual({ kind: "land", errorS: -FRAME_S, byCap: false });
    });

    it("nudges a mid error (and the count restarts)", () => {
      const d = decideChase({ ...base, errorS: 0.09, inStep: 1 });
      expect(d.kind).toBe("nudge");
      expect((d as { rate: number }).rate).toBeCloseTo(1 * (1 - Math.min(MAX_NUDGE, 0.09 * 0.5)));
      // B behind: faster.
      expect((decideChase({ ...base, errorS: -0.09 }) as { rate: number }).rate).toBeGreaterThan(1);
    });

    it("re-seeks a big error to A plus a start latency, bounded by MAX_HIDDEN_RESEEKS, then nudges", () => {
      expect(decideChase({ ...base, errorS: HARD_SEEK_HIDDEN_S + 0.5, rate: 2 })).toEqual({ kind: "reseek", toS: 20 + 0.12 * 2 });
      const spent = decideChase({ ...base, errorS: 1, hiddenReseeks: MAX_HIDDEN_RESEEKS });
      expect(spent).toEqual({ kind: "nudge", rate: 1 - MAX_NUDGE });
    });

    it("[cap] lands with the leftover error at the cap (D2)", () => {
      expect(decideChase({ ...base, errorS: 0.2, elapsedMs: 4000 })).toEqual({ kind: "land", errorS: 0.2, byCap: true });
      expect(decideChase({ ...base, errorS: 0.01, elapsedMs: 4100 })).toEqual({ kind: "land", errorS: 0.01, byCap: true });
    });

    it("an approximate angle lands without a sync check", () => {
      expect(decideChase({ ...base, errorS: 0.4, approximate: true })).toEqual({ kind: "land", errorS: 0.4, byCap: false });
    });
  });

  it("equal-power ramp: gains trace cos/sin and hold constant power", () => {
    expect(rampGains(0, 6)).toEqual({ from: 1, to: 0 });
    const end = rampGains(6, 6);
    expect(end.from).toBeCloseTo(0);
    expect(end.to).toBeCloseTo(1);
    for (let k = 0; k <= 6; k++) {
      const g = rampGains(k, 6);
      expect(g.from ** 2 + g.to ** 2).toBeCloseTo(1);
    }
    expect(rampGains(3, 6).from).toBeCloseTo(Math.SQRT1_2);
  });

  it("[retry] re-signs only an old URL or an auth or expiry failure", () => {
    const t = 1_000_000_000;
    expect(retryNeedsResign(t - 31 * 60_000, t, "network")).toBe(true);
    expect(retryNeedsResign(t - 5 * 60_000, t, "network")).toBe(false);
    expect(retryNeedsResign(t, t, "HTTP 403 Forbidden")).toBe(true);
    expect(retryNeedsResign(t, t, "status 401")).toBe(true);
    expect(retryNeedsResign(t, t, "400 bad request")).toBe(true);
    expect(retryNeedsResign(t, t, "error 4031")).toBe(false);
    expect(retryNeedsResign(t, t, null)).toBe(false);
  });

  it("D7: an Android codec or decoder message is a decoder error; iOS never", () => {
    expect(isDecoderError("android", "MediaCodec failed")).toBe(true);
    expect(isDecoderError("android", "Decoder init failed")).toBe(true);
    expect(isDecoderError("android", "unsupported codec")).toBe(true);
    expect(isDecoderError("android", "403")).toBe(false);
    expect(isDecoderError("ios", "decoder")).toBe(false);
    expect(isDecoderError("android", null)).toBe(false);
  });
});

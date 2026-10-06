import { INITIAL_LEAD_S, LEAD_MAX_S, LEAD_MIN_S, START_LATENCY_INITIAL_S } from "@/lib/match-detail/keep-watching";
import {
  __resetSwitchLeadStoreForTests,
  keepWatchingUnsupported,
  leadFor,
  markKeepWatchingUnsupported,
  recordSwitchTiming,
  startLatencyFor,
} from "@/lib/match-detail/switch-lead-store";

/** The adaptive lead (jits-xfvd.19, contract 07 section 3.2). */
describe("switch lead store", () => {
  beforeEach(() => __resetSwitchLeadStoreForTests());

  it("starts at the initial lead and start latency per network class", () => {
    expect(leadFor("fast")).toBe(INITIAL_LEAD_S.fast);
    expect(leadFor("cellular")).toBe(INITIAL_LEAD_S.cellular);
    expect(leadFor("slow")).toBe(INITIAL_LEAD_S.slow);
    expect(startLatencyFor("fast")).toBe(START_LATENCY_INITIAL_S);
  });

  it("lead = 1.3 * EWMA(ready) + 0.2, per class, EWMA alpha 0.3", () => {
    recordSwitchTiming("fast", { readyMs: 500, startLatencyMs: 100 });
    expect(leadFor("fast")).toBeCloseTo(1.3 * 0.5 + 0.2);
    recordSwitchTiming("fast", { readyMs: 1500, startLatencyMs: 200 });
    // 0.3 * 1.5 + 0.7 * 0.5 = 0.8
    expect(leadFor("fast")).toBeCloseTo(1.3 * 0.8 + 0.2);
    expect(startLatencyFor("fast")).toBeCloseTo(0.3 * 0.2 + 0.7 * 0.1);
    // The other classes are untouched.
    expect(leadFor("cellular")).toBe(INITIAL_LEAD_S.cellular);
  });

  it("clamps the lead to [0.6, 5] s", () => {
    recordSwitchTiming("cellular", { readyMs: 50, startLatencyMs: null });
    expect(leadFor("cellular")).toBe(LEAD_MIN_S);
    recordSwitchTiming("slow", { readyMs: 9000, startLatencyMs: null });
    expect(leadFor("slow")).toBe(LEAD_MAX_S);
    // No start-latency sample: still the initial.
    expect(startLatencyFor("slow")).toBe(START_LATENCY_INITIAL_S);
  });

  it("ignores junk samples", () => {
    recordSwitchTiming("fast", { readyMs: Number.NaN, startLatencyMs: -5 });
    expect(leadFor("fast")).toBe(INITIAL_LEAD_S.fast);
    expect(startLatencyFor("fast")).toBe(START_LATENCY_INITIAL_S);
  });

  it("holds the Android decoder latch for the app run (D7)", () => {
    expect(keepWatchingUnsupported()).toBe(false);
    markKeepWatchingUnsupported();
    expect(keepWatchingUnsupported()).toBe(true);
    __resetSwitchLeadStoreForTests();
    expect(keepWatchingUnsupported()).toBe(false);
  });
});

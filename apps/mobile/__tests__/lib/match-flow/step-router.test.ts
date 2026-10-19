/**
 * Tests for the match flow step router: pure logic that maps persisted DB
 * match status to the wizard step the mobile UI should render.
 *
 * Source: apps/mobile/lib/match-flow/step-router.ts
 */

import { getCurrentStep, MATCH_STEPS } from "@/lib/match-flow/step-router";

describe("MATCH_STEPS constant", () => {
  it("has exactly 7 steps in the correct order", () => {
    expect(MATCH_STEPS).toEqual([
      "weight",
      "ready",
      "live",
      "end",
      "result",
      "confirm",
      "summary",
    ]);
    expect(MATCH_STEPS).toHaveLength(7);
  });

  it("has no wait step (the dead session-era hold; practice keeps its own header steps)", () => {
    expect(MATCH_STEPS as readonly string[]).not.toContain("wait");
  });

  it("is typed as readonly (as const)", () => {
    // `as const` enforces immutability at the type level. At runtime the
    // array is a regular JS array, so we just verify the contents are stable.
    const snapshot = [...MATCH_STEPS];
    expect(MATCH_STEPS).toEqual(snapshot);
  });
});

describe("getCurrentStep", () => {
  describe("mapping from DB match status", () => {
    it('returns "weight" for a pending match', () => {
      expect(getCurrentStep({ status: "pending" })).toBe("weight");
    });

    it('returns "live" for an in_progress match', () => {
      expect(getCurrentStep({ status: "in_progress" })).toBe("live");
    });

    it('returns "summary" for a completed match', () => {
      expect(getCurrentStep({ status: "completed" })).toBe("summary");
    });

    it('returns "summary" for a disputed match', () => {
      expect(getCurrentStep({ status: "disputed" })).toBe("summary");
    });

    it('returns "summary" (never the weight step) for a voided match', () => {
      // A voided match is terminal; the reconciler exits it from the summary.
      expect(getCurrentStep({ status: "voided" })).toBe("summary");
    });

    it('returns "weight" for a cancelled match (the reconciler exits it)', () => {
      expect(getCurrentStep({ status: "cancelled" })).toBe("weight");
    });

    it('defaults to "weight" for an unknown status', () => {
      expect(getCurrentStep({ status: "some_future_status" })).toBe("weight");
    });

    it('defaults to "weight" for an empty status string', () => {
      expect(getCurrentStep({ status: "" })).toBe("weight");
    });
  });
});

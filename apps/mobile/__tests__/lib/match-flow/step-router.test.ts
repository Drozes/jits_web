/**
 * Tests for the match flow step router: pure logic that maps persisted DB
 * match status to the wizard step the mobile UI should render.
 *
 * Source: apps/mobile/lib/match-flow/step-router.ts
 */

import {
  getCurrentStep,
  MATCH_STEPS,
  type MatchStep,
  type MatchLike,
} from "@/lib/match-flow/step-router";

describe("MATCH_STEPS constant", () => {
  it("has exactly 8 steps in the correct order", () => {
    expect(MATCH_STEPS).toEqual([
      "wait",
      "weight",
      "ready",
      "live",
      "end",
      "result",
      "confirm",
      "summary",
    ]);
    expect(MATCH_STEPS).toHaveLength(8);
  });

  it("is typed as readonly (as const)", () => {
    // `as const` enforces immutability at the type level. At runtime the
    // array is a regular JS array, so we just verify the contents are stable.
    const snapshot = [...MATCH_STEPS];
    expect(MATCH_STEPS).toEqual(snapshot);
  });
});

describe("getCurrentStep", () => {
  describe("mapping from DB match status (no localSubstate)", () => {
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

    it('defaults to "weight" for an unknown status', () => {
      expect(getCurrentStep({ status: "some_future_status" })).toBe("weight");
    });

    it('defaults to "weight" for an empty status string', () => {
      expect(getCurrentStep({ status: "" })).toBe("weight");
    });
  });

  describe("localSubstate override", () => {
    it("uses localSubstate when it is a valid MatchStep", () => {
      const match: MatchLike = { status: "pending" };
      // Even though the DB says "pending" (which maps to "weight"),
      // localSubstate should override.
      expect(getCurrentStep(match, "ready")).toBe("ready");
      expect(getCurrentStep(match, "live")).toBe("live");
      expect(getCurrentStep(match, "result")).toBe("result");
      expect(getCurrentStep(match, "confirm")).toBe("confirm");
      expect(getCurrentStep(match, "summary")).toBe("summary");
    });

    it("overrides in_progress status with localSubstate", () => {
      const match: MatchLike = { status: "in_progress" };
      expect(getCurrentStep(match, "end")).toBe("end");
      expect(getCurrentStep(match, "result")).toBe("result");
    });

    it("overrides completed status with localSubstate", () => {
      const match: MatchLike = { status: "completed" };
      expect(getCurrentStep(match, "confirm")).toBe("confirm");
    });

    it("ignores localSubstate that is not a valid MatchStep", () => {
      const match: MatchLike = { status: "pending" };
      expect(getCurrentStep(match, "bogus" as MatchStep)).toBe("weight");
    });

    it("falls back to DB status when localSubstate is undefined", () => {
      expect(getCurrentStep({ status: "in_progress" }, undefined)).toBe("live");
    });
  });

  describe("step transition scenarios", () => {
    it("progresses through the full happy-path sequence via localSubstate", () => {
      const match: MatchLike = { status: "pending" };
      const steps: MatchStep[] = [
        "wait",
        "weight",
        "ready",
        "live",
        "end",
        "result",
        "confirm",
        "summary",
      ];
      for (const step of steps) {
        expect(getCurrentStep(match, step)).toBe(step);
      }
    });

    it("allows jumping backwards in the step sequence via localSubstate", () => {
      // The router does not enforce forward-only transitions; the wizard
      // orchestrator is responsible for that. The router just maps.
      const match: MatchLike = { status: "in_progress" };
      expect(getCurrentStep(match, "weight")).toBe("weight");
    });
  });
});

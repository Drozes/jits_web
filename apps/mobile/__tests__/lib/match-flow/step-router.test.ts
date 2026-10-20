/**
 * Tests for the match flow step router: pure logic that maps persisted DB
 * match status to the wizard step the mobile UI should render.
 *
 * Source: apps/mobile/lib/match-flow/step-router.ts
 */

import { getCurrentStep, MATCH_STEPS } from "@/lib/match-flow/step-router";

describe("MATCH_STEPS constant", () => {
  it("has exactly 8 steps in the correct order (timekeeper mode adds crew first, spec 6.2)", () => {
    expect(MATCH_STEPS).toEqual([
      "crew",
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

// ---- timekeeper mode (spec 6.2; TEST-PLAN 3.2, M1) ----

describe("getCurrentStep: the two-athlete flow ignores the timekeeper-mode keys", () => {
  const SELF_RUN = { mode: "self_run" as const, viewer: "challenger" as const, me: { athleteId: "me-1" } };

  it.each(["pending", "in_progress", "completed", "disputed", "voided", "cancelled", "weird"])(
    "%s maps as without roles",
    (status) => {
      const tkKeys = { status, timekeeper_id: "tk-1", ended_at: "2026-10-20T10:00:00Z" };
      expect(getCurrentStep(tkKeys, SELF_RUN, { ready: [{ athleteId: "me-1" }] })).toBe(getCurrentStep({ status }));
      expect(getCurrentStep({ status }, null, null)).toBe(getCurrentStep({ status }));
    },
  );

  it("never mounts on crew", () => {
    for (const status of ["pending", "in_progress", "completed", "disputed", "voided", "cancelled", "weird"]) {
      expect(getCurrentStep({ status, timekeeper_id: null }, SELF_RUN)).not.toBe("crew");
    }
  });
});

describe("getCurrentStep: timekeeper mode, one row per (server state, viewer)", () => {
  const ATHLETE = { mode: "timekeeper" as const, viewer: "opponent" as const, me: { athleteId: "me-1" } };
  const TIMEKEEPER = { mode: "timekeeper" as const, viewer: "timekeeper" as const, me: null };
  const READY_ME = { ready: [{ athleteId: "me-1" }] };
  const READY_OTHER = { ready: [{ athleteId: "opp-1" }] };
  const ENDED = "2026-10-20T10:05:00Z";

  // [label, match, tkState, athlete step, timekeeper step]
  const ROWS: [string, { status: string; timekeeper_id?: string | null; ended_at?: string | null }, { ready: { athleteId: string }[] } | null, string, string][] = [
    ["pending, no timekeeper", { status: "pending", timekeeper_id: null }, null, "crew", "weight"],
    ["pending, seated, state not read yet", { status: "pending", timekeeper_id: "tk-1" }, null, "weight", "weight"],
    ["pending, seated, I am not ready", { status: "pending", timekeeper_id: "tk-1" }, READY_OTHER, "weight", "weight"],
    ["pending, seated, I am ready", { status: "pending", timekeeper_id: "tk-1" }, READY_ME, "ready", "weight"],
    ["in_progress, clock running", { status: "in_progress", timekeeper_id: "tk-1", ended_at: null }, null, "live", "live"],
    ["in_progress, clock ended", { status: "in_progress", timekeeper_id: "tk-1", ended_at: ENDED }, null, "result", "result"],
    ["completed", { status: "completed", timekeeper_id: "tk-1" }, null, "summary", "summary"],
    ["disputed", { status: "disputed", timekeeper_id: "tk-1" }, null, "summary", "summary"],
    ["voided", { status: "voided", timekeeper_id: "tk-1" }, null, "summary", "summary"],
    ["cancelled (the first snapshot exits it)", { status: "cancelled", timekeeper_id: null }, null, "crew", "weight"],
  ];

  it.each(ROWS)("%s: athlete %#", (_label, match, tkState, athleteStep) => {
    expect(getCurrentStep(match, ATHLETE, tkState)).toBe(athleteStep);
  });

  it.each(ROWS)("%s: timekeeper %#", (_label, match, tkState, _athleteStep, timekeeperStep) => {
    expect(getCurrentStep(match, TIMEKEEPER, tkState)).toBe(timekeeperStep);
  });
});

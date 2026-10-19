/**
 * The pure half of the match reconciler (lib/match-flow/reconcile.ts): what
 * a fetched DB snapshot means for the wizard. Covers every status mapping,
 * the never-backwards rule, the one initial correction, the poll schedule,
 * the stale-read guard and the verdict rebuilt from a missed broadcast.
 * Beads: jits-wfpo, jits-bh2v, jits-vh7m, jits-bmei, jits-mzfu.
 */
import {
  isStatusRegression,
  planReconcile,
  pollIntervalFor,
  resultFromOutcome,
  targetFor,
  type MatchSnapshot,
} from "@/lib/match-flow/reconcile";
import { MATCH_STEPS, type MatchStep } from "@/lib/match-flow/step-router";
import { deriveMatchRoles } from "@/lib/match-flow/match-roles";
import type { MatchDetails } from "@jits/shared/api/queries";

const ME = "me-1";
const OPP = "opp-1";

/** A two-athlete match; `first` is listed first (the challenger until BE-G). */
function matchOf(first: string, second: string): MatchDetails {
  const p = (id: string) => ({ athlete_id: id, display_name: id, current_elo: 1500, current_weight: 170, profile_photo_url: null, role: "competitor", outcome: null, elo_before: null, elo_after: null, elo_delta: 0, weight_division_gap: null });
  return { participants: [p(first), p(second)] } as unknown as MatchDetails;
}

/** ME's roles in a match ME challenged, as the wizard derives them. */
const ROLES = deriveMatchRoles(matchOf(ME, OPP), ME)!;

function snap(status: string, confirmedAthleteIds: string[] | null = []): MatchSnapshot {
  return { status, confirmedAthleteIds };
}

function plan(current: MatchStep, s: MatchSnapshot, initial = false) {
  return planReconcile({ current, snapshot: s, roles: ROLES, initial });
}

describe("targetFor: what each status implies", () => {
  it("cancelled -> exit", () => {
    expect(targetFor(snap("cancelled"), ROLES)).toBe("exit");
  });
  it("voided -> exit (terminal, like cancelled)", () => {
    expect(targetFor(snap("voided"), ROLES)).toBe("exit");
  });
  it("pending -> no opinion (stay pre-live)", () => {
    expect(targetFor(snap("pending"), ROLES)).toBeNull();
  });
  it("in_progress -> live", () => {
    expect(targetFor(snap("in_progress"), ROLES)).toBe("live");
  });
  it("completed with nobody confirmed -> confirm (completed is set at RECORD time)", () => {
    expect(targetFor(snap("completed", []), ROLES)).toBe("confirm");
  });
  it("completed with only one side confirmed -> confirm", () => {
    expect(targetFor(snap("completed", [ME]), ROLES)).toBe("confirm");
    expect(targetFor(snap("completed", [OPP]), ROLES)).toBe("confirm");
  });
  it("completed with both confirmed -> summary", () => {
    expect(targetFor(snap("completed", [OPP, ME]), ROLES)).toBe("summary");
  });
  it("completed with unknown confirmations -> confirm", () => {
    expect(targetFor(snap("completed", null), ROLES)).toBe("confirm");
  });
  it("disputed -> summary, whoever disputed", () => {
    expect(targetFor(snap("disputed", []), ROLES)).toBe("summary");
  });
  it("an unknown status -> no opinion", () => {
    expect(targetFor(snap("weird"), ROLES)).toBeNull();
  });
});

describe("targetFor with roles: one row per (status, confirmations, viewer), today's outputs", () => {
  const STRANGER = "someone-else";
  // [status, confirmations, the step today's flow goes to]
  const ROWS: [string, string[] | null, MatchStep | "exit" | null][] = [
    ["pending", [], null],
    ["in_progress", [], "live"],
    ["completed", [], "confirm"],
    ["completed", null, "confirm"],
    ["completed", [ME], "confirm"],
    ["completed", [OPP], "confirm"],
    ["completed", [STRANGER, ME], "confirm"],
    ["completed", [ME, OPP], "summary"],
    ["completed", [OPP, ME], "summary"],
    ["disputed", [], "summary"],
    ["cancelled", [], "exit"],
    ["voided", [ME, OPP], "exit"],
    ["weird", [], null],
  ];
  const VIEWERS = {
    challenger: deriveMatchRoles(matchOf(ME, OPP), ME)!,
    opponent: deriveMatchRoles(matchOf(OPP, ME), ME)!,
  };

  it("derives the viewer each row runs as", () => {
    expect(VIEWERS.challenger.viewer).toBe("challenger");
    expect(VIEWERS.opponent.viewer).toBe("opponent");
  });

  for (const [viewer, roles] of Object.entries(VIEWERS)) {
    it.each(ROWS)(`${viewer}: %s with %j -> %s`, (status, confirmed, expected) => {
      expect(targetFor(snap(status, confirmed), roles)).toBe(expected);
    });
  }

  it("the initial summary -> confirm correction reads the viewer's own confirmation, as either athlete", () => {
    for (const roles of Object.values(VIEWERS)) {
      const initial = (ids: string[]) =>
        planReconcile({ current: "summary", snapshot: snap("completed", ids), roles, initial: true });
      expect(initial([OPP])).toEqual({ type: "goto", step: "confirm" });
      expect(initial([ME])).toEqual({ type: "none" });
    }
  });
});

describe("planReconcile", () => {
  it("exits a cancelled match from any pre-live step (jits-bh2v)", () => {
    for (const step of ["weight", "ready"] as const) {
      expect(plan(step, snap("cancelled"))).toEqual({ type: "exit", reason: "cancelled" });
    }
  });

  it("does not exit a finished wizard that is already on the summary", () => {
    expect(plan("summary", snap("cancelled"))).toEqual({ type: "none" });
  });

  it("exits a voided match from every step, the summary included", () => {
    // voided = an admin voided a disputed result (ELO reverted): the summary's
    // verdict and rating change are no longer true, so it leaves too.
    for (const step of MATCH_STEPS) {
      expect(plan(step, snap("voided"))).toEqual({ type: "exit", reason: "voided" });
      expect(plan(step, snap("voided"), true)).toEqual({ type: "exit", reason: "voided" });
    }
  });

  it("stays put on pending", () => {
    expect(plan("weight", snap("pending"))).toEqual({ type: "none" });
    expect(plan("ready", snap("pending"))).toEqual({ type: "none" });
  });

  it("moves a ready athlete who missed timer_started to live", () => {
    expect(plan("ready", snap("in_progress"))).toEqual({ type: "goto", step: "live" });
  });

  it("leaves end/result alone while the match is still in_progress (nobody recorded yet)", () => {
    expect(plan("end", snap("in_progress"))).toEqual({ type: "none" });
    expect(plan("result", snap("in_progress"))).toEqual({ type: "none" });
  });

  it("moves a stranded result step to confirm once the opponent recorded (jits-vh7m, jits-mzfu)", () => {
    expect(plan("result", snap("completed", []))).toEqual({ type: "goto", step: "confirm" });
  });

  it("moves a live step straight to confirm when match_ended and the result were both missed", () => {
    expect(plan("live", snap("completed", []))).toEqual({ type: "goto", step: "confirm" });
  });

  it("keeps a confirmer waiting while only they have confirmed", () => {
    expect(plan("confirm", snap("completed", [ME]))).toEqual({ type: "none" });
  });

  it("moves a waiting confirmer to summary once both rows exist (jits-bmei)", () => {
    expect(plan("confirm", snap("completed", [ME, OPP]))).toEqual({ type: "goto", step: "summary" });
  });

  it("moves the non-disputer to summary (jits-wfpo)", () => {
    expect(plan("confirm", snap("disputed", []))).toEqual({ type: "goto", step: "summary" });
    expect(plan("result", snap("disputed", []))).toEqual({ type: "goto", step: "summary" });
  });

  describe("never backwards (a stale read cannot undo a newer broadcast-driven step)", () => {
    it.each<[MatchStep, string]>([
      ["live", "pending"],
      ["result", "pending"],
      ["confirm", "in_progress"],
      ["summary", "in_progress"],
      ["summary", "completed"],
    ])("from %s, a %s snapshot does nothing", (current, status) => {
      expect(plan(current, snap(status, []))).toEqual({ type: "none" });
    });

    it("never produces a goto to an earlier or equal step for any status", () => {
      const statuses = ["pending", "in_progress", "completed", "disputed", "cancelled", "voided"];
      const confirmSets: (string[] | null)[] = [null, [], [ME], [OPP], [ME, OPP]];
      for (const current of MATCH_STEPS) {
        for (const status of statuses) {
          for (const ids of confirmSets) {
            const a = plan(current, snap(status, ids));
            if (a.type === "goto") {
              expect(MATCH_STEPS.indexOf(a.step)).toBeGreaterThan(MATCH_STEPS.indexOf(current));
            }
          }
        }
      }
    });
  });

  describe("the one initial correction (summary -> confirm)", () => {
    it("sends an athlete who never confirmed back to confirm on the first snapshot", () => {
      expect(plan("summary", snap("completed", [OPP]), true)).toEqual({ type: "goto", step: "confirm" });
      expect(plan("summary", snap("completed", []), true)).toEqual({ type: "goto", step: "confirm" });
    });

    it("does not when this athlete already confirmed", () => {
      expect(plan("summary", snap("completed", [ME]), true)).toEqual({ type: "none" });
    });

    it("does not when the confirmations are unknown", () => {
      expect(plan("summary", snap("completed", null), true)).toEqual({ type: "none" });
    });

    it("does not after the first snapshot", () => {
      expect(plan("summary", snap("completed", []), false)).toEqual({ type: "none" });
    });

    it("does not for a disputed match", () => {
      expect(plan("summary", snap("disputed", []), true)).toEqual({ type: "none" });
    });
  });
});

describe("pollIntervalFor: poll only where the athlete waits on the other side", () => {
  it.each<MatchStep>(["ready", "result", "confirm"])("%s polls every few seconds", (step) => {
    const ms = pollIntervalFor(step);
    expect(ms).not.toBeNull();
    expect(ms!).toBeGreaterThanOrEqual(3_000);
    expect(ms!).toBeLessThanOrEqual(5_000);
  });

  it("live polls slowly", () => {
    expect(pollIntervalFor("live")).toBeGreaterThan(pollIntervalFor("confirm")!);
  });

  it.each<MatchStep | null>(["weight", "end", "summary", null])("%s never polls", (step) => {
    expect(pollIntervalFor(step)).toBeNull();
  });
});

describe("isStatusRegression", () => {
  it("flags an older status replacing a newer one", () => {
    expect(isStatusRegression("completed", "in_progress")).toBe(true);
    expect(isStatusRegression("in_progress", "pending")).toBe(true);
    expect(isStatusRegression("cancelled", "pending")).toBe(true);
    // A stale disputed read cannot un-void a match.
    expect(isStatusRegression("voided", "disputed")).toBe(true);
    expect(isStatusRegression("voided", "completed")).toBe(true);
  });
  it("lets voided replace the dispute it resolves", () => {
    expect(isStatusRegression("disputed", "voided")).toBe(false);
  });
  it("allows forward moves and same-rank swaps", () => {
    expect(isStatusRegression("pending", "in_progress")).toBe(false);
    expect(isStatusRegression("completed", "disputed")).toBe(false);
    expect(isStatusRegression("disputed", "completed")).toBe(false);
    expect(isStatusRegression("completed", "completed")).toBe(false);
  });
  it("never blocks an unknown status", () => {
    expect(isStatusRegression("completed", "weird")).toBe(false);
  });
});

describe("resultFromOutcome: the verdict when result_submitted was missed", () => {
  it("rebuilds win / loss / draw from this athlete's stamped outcome", () => {
    expect(resultFromOutcome("win", ME, OPP)).toEqual({ result: "submission", winnerId: ME });
    expect(resultFromOutcome("loss", ME, OPP)).toEqual({ result: "submission", winnerId: OPP });
    expect(resultFromOutcome("draw", ME, OPP)).toEqual({ result: "draw" });
  });
  it("is null before an outcome is stamped", () => {
    expect(resultFromOutcome(null, ME, OPP)).toBeNull();
  });
});

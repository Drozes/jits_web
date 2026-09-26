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

const ME = "me-1";
const OPP = "opp-1";

function snap(status: string, confirmedAthleteIds: string[] | null = []): MatchSnapshot {
  return { status, confirmedAthleteIds };
}

function plan(current: MatchStep, s: MatchSnapshot, initial = false) {
  return planReconcile({ current, snapshot: s, currentAthleteId: ME, opponentId: OPP, initial });
}

describe("targetFor: what each status implies", () => {
  it("cancelled -> exit", () => {
    expect(targetFor(snap("cancelled"), ME, OPP)).toBe("exit");
  });
  it("voided -> exit (terminal, like cancelled)", () => {
    expect(targetFor(snap("voided"), ME, OPP)).toBe("exit");
  });
  it("pending -> no opinion (stay pre-live)", () => {
    expect(targetFor(snap("pending"), ME, OPP)).toBeNull();
  });
  it("in_progress -> live", () => {
    expect(targetFor(snap("in_progress"), ME, OPP)).toBe("live");
  });
  it("completed with nobody confirmed -> confirm (completed is set at RECORD time)", () => {
    expect(targetFor(snap("completed", []), ME, OPP)).toBe("confirm");
  });
  it("completed with only one side confirmed -> confirm", () => {
    expect(targetFor(snap("completed", [ME]), ME, OPP)).toBe("confirm");
    expect(targetFor(snap("completed", [OPP]), ME, OPP)).toBe("confirm");
  });
  it("completed with both confirmed -> summary", () => {
    expect(targetFor(snap("completed", [OPP, ME]), ME, OPP)).toBe("summary");
  });
  it("completed with unknown confirmations -> confirm", () => {
    expect(targetFor(snap("completed", null), ME, OPP)).toBe("confirm");
  });
  it("disputed -> summary, whoever disputed", () => {
    expect(targetFor(snap("disputed", []), ME, OPP)).toBe("summary");
  });
  it("an unknown status -> no opinion", () => {
    expect(targetFor(snap("weird"), ME, OPP)).toBeNull();
  });
});

describe("planReconcile", () => {
  it("exits a cancelled match from any pre-live step (jits-bh2v)", () => {
    for (const step of ["wait", "weight", "ready"] as const) {
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

  it.each<MatchStep | null>(["wait", "weight", "end", "summary", null])("%s never polls", (step) => {
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

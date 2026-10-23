/**
 * The verdict's outcome for this athlete (lib/match-flow/compute-own-outcome.ts,
 * moved out of the wizard unchanged): the stamped row wins, else the result
 * broadcast decides, else there is none yet.
 */
import { computeOwnOutcome } from "@/lib/match-flow/compute-own-outcome";

const ME = { athleteId: "me-1", outcome: null };

describe("computeOwnOutcome", () => {
  it.each(["win", "loss", "draw"] as const)("a stamped %s wins over the broadcast", (outcome) => {
    expect(computeOwnOutcome({ ...ME, outcome }, { result: "submission", winnerId: "opp-1" })).toBe(outcome);
  });

  it("with nothing stamped, the broadcast decides", () => {
    expect(computeOwnOutcome(ME, { result: "draw" })).toBe("draw");
    expect(computeOwnOutcome(ME, { result: "submission", winnerId: "me-1" })).toBe("win");
    expect(computeOwnOutcome(ME, { result: "submission", winnerId: "opp-1" })).toBe("loss");
  });

  it("with neither, there is no outcome yet", () => {
    expect(computeOwnOutcome(ME, null)).toBeNull();
  });
});

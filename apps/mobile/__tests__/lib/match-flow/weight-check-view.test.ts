/**
 * The face-off's pure weight-check view (`deriveWeightCheckView`, split out
 * of use-faceoff.ts in timekeeper mode PR3): what each DB state means for
 * this athlete, with no checks at all being inert and never gating the start.
 */
import type { MatchWeightChecks, WeightCheck, WeightCheckStatus } from "@jits/shared/api/match-weight-checks";
import type { WeightChecksHandle, WeightChecksStatus } from "@/lib/match-flow/use-match-weight-checks";
import { deriveWeightCheckView } from "@/lib/match-flow/weight-check-view";

const ME = "me-1";
const OPP = "opp-1";

function check(checkerId: string, status: WeightCheckStatus, over: Partial<WeightCheck> = {}): WeightCheck {
  return {
    checkerId,
    subjectId: checkerId === ME ? OPP : ME,
    status,
    weightSeen: null,
    flagCount: status === "flagged" ? 1 : 0,
    flaggedAt: status === "flagged" ? "2026-10-19T12:00:00.000Z" : null,
    reweighedAt: null,
    updatedAt: null,
    ...over,
  };
}

function handle(
  status: WeightChecksStatus,
  state: Partial<MatchWeightChecks> & { checks?: WeightCheck[] } | null = null,
): WeightChecksHandle {
  return {
    status,
    state: state
      ? { matchId: "M1", required: false, blocked: false, canStart: true, weights: {}, checks: [], ...state }
      : null,
    refetch: () => undefined,
    apply: () => undefined,
  };
}

describe("no checks for this match", () => {
  it.each(["unavailable", "idle"] as const)("%s: inert, and the start is never gated here", (status) => {
    const v = deriveWeightCheckView(handle(status), ME);
    expect(v).toEqual({
      active: false,
      loading: false,
      mine: null,
      theirs: null,
      blocked: false,
      canStart: true,
      needsMyVerdict: false,
      opponentReweighed: false,
      myFlagOpen: false,
      mustReweigh: false,
      awaitingTheirRecheck: false,
      awaitingTheirCheck: false,
    });
  });

  it("loading: active, and the start waits for the first read", () => {
    const v = deriveWeightCheckView(handle("loading"), ME);
    expect([v.active, v.loading, v.canStart]).toEqual([true, true, false]);
  });
});

describe("with checks", () => {
  it("splits mine (of the opponent) from theirs (of me)", () => {
    const mine = check(ME, "pending");
    const theirs = check(OPP, "confirmed");
    const v = deriveWeightCheckView(handle("ready", { checks: [theirs, mine] }), ME);
    expect(v.mine).toBe(mine);
    expect(v.theirs).toBe(theirs);
    expect(v.needsMyVerdict).toBe(true);
  });

  it("takes blocked and canStart from the server", () => {
    const v = deriveWeightCheckView(handle("ready", { blocked: true, canStart: false }), ME);
    expect([v.active, v.blocked, v.canStart]).toEqual([true, true, false]);
  });

  it("my open flag offers Withdraw until they re-weigh, then asks for my verdict again", () => {
    const flagged = check(ME, "flagged");
    expect(deriveWeightCheckView(handle("ready", { checks: [flagged] }), ME)).toMatchObject({
      myFlagOpen: true,
      needsMyVerdict: false,
      opponentReweighed: false,
    });
    const reweighed = check(ME, "flagged", { reweighedAt: "2026-10-19T12:01:00.000Z" });
    expect(deriveWeightCheckView(handle("ready", { checks: [reweighed] }), ME)).toMatchObject({
      myFlagOpen: false,
      needsMyVerdict: true,
      opponentReweighed: true,
    });
  });

  it("their flag of me asks me to re-weigh; after I do, I wait on their recheck", () => {
    expect(deriveWeightCheckView(handle("ready", { checks: [check(OPP, "flagged")] }), ME)).toMatchObject({
      mustReweigh: true,
      awaitingTheirRecheck: false,
    });
    const after = check(OPP, "flagged", { reweighedAt: "2026-10-19T12:01:00.000Z" });
    expect(deriveWeightCheckView(handle("ready", { checks: [after] }), ME)).toMatchObject({
      mustReweigh: false,
      awaitingTheirRecheck: true,
    });
    expect(deriveWeightCheckView(handle("ready", { checks: [check(OPP, "recheck")] }), ME).awaitingTheirRecheck).toBe(true);
  });

  it("their pending check only holds me up while pending checks are required", () => {
    const pending = [check(OPP, "pending")];
    expect(deriveWeightCheckView(handle("ready", { checks: pending }), ME).awaitingTheirCheck).toBe(false);
    expect(deriveWeightCheckView(handle("ready", { checks: pending, required: true }), ME).awaitingTheirCheck).toBe(true);
  });
});

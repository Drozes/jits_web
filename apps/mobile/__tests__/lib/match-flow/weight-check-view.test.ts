/**
 * The face-off's pure weight-check view (`deriveWeightCheckView`, split out
 * of use-faceoff.ts in timekeeper mode PR3): what each DB state means for
 * this athlete, with no checks at all being inert and never gating the start.
 * Slice M3 adds its `weightVerdicts` input (only "opponent" judges the
 * opponent; the default keeps every case above it) and the timekeeper-mode
 * derivations: the athletes' merged ready line and the timekeeper's rows.
 */
import type { MatchWeightChecks, WeightCheck, WeightCheckStatus } from "@jits/shared/api/match-weight-checks";
import type { WeightChecksHandle, WeightChecksStatus } from "@/lib/match-flow/use-match-weight-checks";
import {
  deriveAthleteTimekeeperState,
  deriveTimekeeperRows,
  deriveWeightCheckView,
  timekeeperOwesVerdict,
} from "@/lib/match-flow/weight-check-view";
import type { TimekeeperCheckStatus } from "@jits/shared/api/timekeeper";

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

describe("the weightVerdicts input (timekeeper mode ARCHITECTURE 2.3)", () => {
  const flagged = handle("ready", { checks: [check(OPP, "flagged"), check(ME, "pending")], blocked: true, canStart: false });

  it("defaults to the opponent check, exactly as shipped", () => {
    expect(deriveWeightCheckView(flagged, ME)).toEqual(deriveWeightCheckView(flagged, ME, "opponent"));
    expect(deriveWeightCheckView(flagged, ME, "opponent")).toMatchObject({ active: true, mustReweigh: true, canStart: false });
  });

  it.each(["both_athletes", "none"] as const)("%s judges no opponent: inert, never gating a start", (weightVerdicts) => {
    expect(deriveWeightCheckView(flagged, ME, weightVerdicts)).toEqual(deriveWeightCheckView(handle("unavailable"), ME));
  });
});

const TK_STATE = (over: {
  ready?: string[];
  checks?: [string, TimekeeperCheckStatus][];
  timeoutAt?: string | null;
} = {}) => ({
  ready: (over.ready ?? []).map((athleteId) => ({ athleteId, readyAt: "2026-10-21T12:00:00.000Z" })),
  timekeeperChecks: (over.checks ?? []).map(([subjectId, status]) => ({ subjectId, status })),
  timeoutAt: over.timeoutAt === undefined ? "2026-10-21T12:10:00.000Z" : over.timeoutAt,
});

describe("deriveAthleteTimekeeperState (TK-F1 to TK-F7, TK-D9)", () => {
  const base = { meId: ME, opponentId: OPP, timekeeperName: "J. Cruz" };

  it("before the first state read: nobody ready, nothing confirmed, no timeout", () => {
    expect(deriveAthleteTimekeeperState({ ...base, state: null, checksWeights: true })).toEqual({
      name: "J. Cruz",
      checksWeights: true,
      weightsConfirmed: false,
      flaggedMe: false,
      meReady: false,
      opponentReady: false,
      timeoutAt: null,
    });
  });

  it("ready is the server's rows, each athlete on their own", () => {
    const s = deriveAthleteTimekeeperState({ ...base, state: TK_STATE({ ready: [OPP] }), checksWeights: false });
    expect(s).toMatchObject({ meReady: false, opponentReady: true, timeoutAt: "2026-10-21T12:10:00.000Z" });
    expect(deriveAthleteTimekeeperState({ ...base, state: TK_STATE({ ready: [ME, OPP] }), checksWeights: false })).toMatchObject({
      meReady: true,
      opponentReady: true,
    });
  });

  it("weights confirmed only with the sub-flag on and both of the timekeeper's checks confirmed (TK-F2, TK-F3)", () => {
    const one = TK_STATE({ checks: [[ME, "confirmed"]] });
    const both = TK_STATE({ checks: [[ME, "confirmed"], [OPP, "confirmed"]] });
    expect(deriveAthleteTimekeeperState({ ...base, state: one, checksWeights: true }).weightsConfirmed).toBe(false);
    expect(deriveAthleteTimekeeperState({ ...base, state: both, checksWeights: true }).weightsConfirmed).toBe(true);
    expect(deriveAthleteTimekeeperState({ ...base, state: both, checksWeights: false }).weightsConfirmed).toBe(false);
  });

  it("the timekeeper's flag on me asks for a re-weigh (TK-F7); a flag on the opponent does not; a recheck clears it", () => {
    expect(deriveAthleteTimekeeperState({ ...base, state: TK_STATE({ checks: [[ME, "flagged"]] }), checksWeights: true }).flaggedMe).toBe(true);
    expect(deriveAthleteTimekeeperState({ ...base, state: TK_STATE({ checks: [[OPP, "flagged"]] }), checksWeights: true }).flaggedMe).toBe(false);
    expect(deriveAthleteTimekeeperState({ ...base, state: TK_STATE({ checks: [[ME, "recheck"]] }), checksWeights: true }).flaggedMe).toBe(false);
  });
});

describe("deriveTimekeeperRows (TK-K1 to TK-K5; sub-flag off and on, A19)", () => {
  const athletes = [
    { athleteId: "ch-1", shortName: "M. Reyes" },
    { athleteId: "op-1", shortName: "D. Okafor" },
  ] as const;
  const weights = [
    { athleteId: "ch-1", lbs: 168 },
    { athleteId: "op-1", lbs: null },
  ];

  it("one row per athlete, challenger first, on the rated weights and the server's ready rows", () => {
    const rows = deriveTimekeeperRows({ athletes, ratedWeights: weights, state: TK_STATE({ ready: ["op-1"] }), weightVerdicts: "both_athletes" });
    expect(rows.map((r) => [r.athleteId, r.shortName, r.weightLbs, r.ready])).toEqual([
      ["ch-1", "M. Reyes", 168, false],
      ["op-1", "D. Okafor", null, true],
    ]);
  });

  it("sub-flag on: a verdict is offered only with a rated weight to quote and none standing", () => {
    const at = (checks: [string, TimekeeperCheckStatus][]) =>
      deriveTimekeeperRows({ athletes, ratedWeights: weights, state: TK_STATE({ checks }), weightVerdicts: "both_athletes" });
    expect(at([]).map((r) => [r.canJudge, r.canWithdraw])).toEqual([
      [true, false],
      [false, false], // no rated weight yet
    ]);
    expect(at([["ch-1", "confirmed"]])[0]).toMatchObject({ check: "confirmed", canJudge: false, canWithdraw: false });
    expect(at([["ch-1", "flagged"]])[0]).toMatchObject({ check: "flagged", canJudge: false, canWithdraw: true });
    expect(at([["ch-1", "recheck"]])[0]).toMatchObject({ check: "recheck", canJudge: true, canWithdraw: false });
  });

  it("sub-flag off: no verdicts at all, whatever the state holds", () => {
    const rows = deriveTimekeeperRows({
      athletes,
      ratedWeights: weights,
      state: TK_STATE({ checks: [["ch-1", "flagged"]] }),
      weightVerdicts: "none",
    });
    expect(rows.map((r) => [r.check, r.canJudge, r.canWithdraw])).toEqual([
      [null, false, false],
      [null, false, false],
    ]);
    expect(timekeeperOwesVerdict(rows, "none")).toBe(false);
  });

  it("the timekeeper owes a verdict until both are confirmed (sub-flag on only)", () => {
    const rows = (checks: [string, TimekeeperCheckStatus][]) =>
      deriveTimekeeperRows({ athletes, ratedWeights: weights, state: TK_STATE({ checks }), weightVerdicts: "both_athletes" });
    expect(timekeeperOwesVerdict(rows([]), "both_athletes")).toBe(true);
    expect(timekeeperOwesVerdict(rows([["ch-1", "confirmed"]]), "both_athletes")).toBe(true);
    expect(timekeeperOwesVerdict(rows([["ch-1", "confirmed"], ["op-1", "confirmed"]]), "both_athletes")).toBe(false);
  });
});

/**
 * `isAllowedBackward` (lib/match-flow/step-transitions.ts): the only
 * backward steps beyond the initial correction (timekeeper mode spec 6.2,
 * A5, A8; TEST-PLAN 3.2, M1). The truth table: every (from, to) pair, for an
 * athlete and the timekeeper of a timekeeper-mode match and for a
 * two-athlete match, against the snapshots that prove or do not prove a move.
 */
import { isAllowedBackward } from "@/lib/match-flow/step-transitions";
import type { MatchSnapshot, ReconcileRoles } from "@/lib/match-flow/reconcile";
import { MATCH_STEPS, type MatchStep } from "@/lib/match-flow/step-router";

const ME = "me-1";
const OPP = "opp-1";
const athletes = [{ athleteId: ME }, { athleteId: OPP }] as const;

const TK_ATHLETE: ReconcileRoles = { mode: "timekeeper", viewer: "opponent", me: { athleteId: ME }, athletes };
const TK_TIMEKEEPER: ReconcileRoles = { mode: "timekeeper", viewer: "timekeeper", me: null, athletes };
const SELF_RUN: ReconcileRoles = { mode: "self_run", viewer: "challenger", me: { athleteId: ME }, athletes };
/** The match-loop bot's roles: no mode, the two-athlete flow. */
const BOT: ReconcileRoles = { me: { athleteId: ME }, athletes };

/** Pending, nobody seated: a pre-start drop-out (A5). */
const DROPPED: MatchSnapshot = { status: "pending", confirmedAthleteIds: [], timekeeperId: null };
/** Completed, edited after the verdict was reached on count 0, my confirmation gone (A8). */
const EDITED: MatchSnapshot = {
  status: "completed",
  confirmedAthleteIds: [OPP],
  timekeeperId: "tk-1",
  resultEditCount: 1,
  summaryEditCount: 0,
};

const pairs = MATCH_STEPS.flatMap((from) => MATCH_STEPS.map((to) => [from, to] as [MatchStep, MatchStep]));

describe("isAllowedBackward", () => {
  it("allows weight or ready back to crew for a timekeeper-mode athlete after a pre-start drop-out", () => {
    expect(isAllowedBackward("weight", "crew", DROPPED, TK_ATHLETE)).toBe(true);
    expect(isAllowedBackward("ready", "crew", DROPPED, TK_ATHLETE)).toBe(true);
  });

  it("allows summary back to confirm for a timekeeper-mode athlete after an edit reset their confirmation", () => {
    expect(isAllowedBackward("summary", "confirm", EDITED, TK_ATHLETE)).toBe(true);
  });

  it("allows nothing else for a timekeeper-mode athlete, whatever the snapshot", () => {
    for (const [from, to] of pairs) {
      const expected = (to === "crew" && (from === "weight" || from === "ready")) || (from === "summary" && to === "confirm");
      if (expected) continue;
      for (const s of [DROPPED, EDITED]) expect(isAllowedBackward(from, to, s, TK_ATHLETE)).toBe(false);
    }
  });

  it.each([
    ["the timekeeper", TK_TIMEKEEPER],
    ["a two-athlete match", SELF_RUN],
    ["the match-loop bot (no mode)", BOT],
  ])("allows nothing at all for %s", (_label, roles) => {
    for (const [from, to] of pairs) {
      for (const s of [DROPPED, EDITED]) expect(isAllowedBackward(from, to, s, roles)).toBe(false);
    }
  });

  describe("back to crew needs the drop-out in the snapshot", () => {
    it.each<[string, MatchSnapshot]>([
      ["a timekeeper is seated", { ...DROPPED, timekeeperId: "tk-1" }],
      ["the match started", { ...DROPPED, status: "in_progress" }],
      ["the match was cancelled", { ...DROPPED, status: "cancelled" }],
    ])("not when %s", (_label, s) => {
      expect(isAllowedBackward("weight", "crew", s, TK_ATHLETE)).toBe(false);
      expect(isAllowedBackward("ready", "crew", s, TK_ATHLETE)).toBe(false);
    });
  });

  describe("back to confirm needs the edit and the reset in the snapshot", () => {
    it.each<[string, MatchSnapshot]>([
      ["no edit since the verdict was reached", { ...EDITED, summaryEditCount: 1 }],
      ["the wizard has no summary baseline", { ...EDITED, summaryEditCount: undefined }],
      ["no edit at all", { ...EDITED, resultEditCount: 0, summaryEditCount: 0 }],
      ["my confirmation still stands", { ...EDITED, confirmedAthleteIds: [ME, OPP] }],
      ["the confirmations are unknown", { ...EDITED, confirmedAthleteIds: null }],
      ["the match is disputed", { ...EDITED, status: "disputed" }],
    ])("not when %s", (_label, s) => {
      expect(isAllowedBackward("summary", "confirm", s, TK_ATHLETE)).toBe(false);
    });

    // The baseline is the count the verdict was reached on, not the last read's: a read that
    // cannot prove the reset leaves it, and the next consistent read proves the same edit.
    it.each<[string, MatchSnapshot]>([
      ["a read that straddles the edit (count grew, my confirmation still listed)", { ...EDITED, confirmedAthleteIds: [ME] }],
      ["a read whose confirmations failed", { ...EDITED, confirmedAthleteIds: null }],
    ])("%s does not use the edit up", (_label, inconclusive) => {
      expect(isAllowedBackward("summary", "confirm", inconclusive, TK_ATHLETE)).toBe(false);
      expect(isAllowedBackward("summary", "confirm", { ...inconclusive, confirmedAthleteIds: [] }, TK_ATHLETE)).toBe(true);
    });

    it("a later edit is proven against the same baseline", () => {
      expect(isAllowedBackward("summary", "confirm", { ...EDITED, resultEditCount: 2 }, TK_ATHLETE)).toBe(true);
    });
  });
});

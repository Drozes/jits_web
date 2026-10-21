/**
 * What the face-off shows for the weight checks, derived purely from the
 * checks in hand (timekeeper mode ARCHITECTURE 2.3, "Weight-check view").
 *
 *  - `deriveWeightCheckView`: an athlete's check of the opponent and the
 *    opponent's check of them (jr_be-ahn.4), in both modes; the face-off hook
 *    adds the two actions and the busy flag. Its `weightVerdicts` input is the
 *    viewer's capability (`roles.caps`): "opponent" (every athlete, both
 *    modes, the default) judges the opponent as shipped; any other value
 *    judges no opponent, so the view is inert and never gates a start.
 *  - Timekeeper mode, from the server's state (`get_timekeeper_match_state`):
 *    `deriveAthleteTimekeeperState`, the merged ready line an athlete sees
 *    (the server's ready rows, the timekeeper's checks, the face-off
 *    timeout), and `deriveTimekeeperRows`, the timekeeper's row per athlete
 *    (verdicts only with `weightVerdicts` "both_athletes", the sub-flag
 *    snapshot, A19).
 */
import {
  checksFor,
  reweighedSinceFlag,
  type WeightCheck,
  type WeightVerdict,
} from "@jits/shared/api/match-weight-checks";
import type { TimekeeperCheckStatus, TimekeeperMatchState } from "@jits/shared/api/timekeeper";
import type { MatchAthleteView, MatchCaps } from "./match-roles";
import type { WeightChecksHandle } from "./use-match-weight-checks";

/** The weight-check state the face-off renders (no actions). */
export interface WeightCheckState {
  /** False when the match has none (no challenge, older backend). */
  active: boolean;
  /** The first read is still in flight. */
  loading: boolean;
  /** My check of the opponent, and the opponent's check of me. */
  mine: WeightCheck | null;
  theirs: WeightCheck | null;
  /** A check is flagged or awaiting a recheck: the match is on hold. */
  blocked: boolean;
  /** The weight gate lets the match start (always true when inactive). */
  canStart: boolean;
  /** I still owe a verdict on the opponent's (current) weight. */
  needsMyVerdict: boolean;
  /** The opponent re-weighed since I flagged, or since I confirmed. */
  opponentReweighed: boolean;
  /** I flagged, and they have not re-weighed since: offer Withdraw. */
  myFlagOpen: boolean;
  /** The opponent flagged me and I have not re-weighed since. */
  mustReweigh: boolean;
  /** I re-weighed; the opponent has yet to check the new weight. */
  awaitingTheirRecheck: boolean;
  /** Pending checks block the start (rollout flag on) and theirs is pending. */
  awaitingTheirCheck: boolean;
}

/**
 * What the face-off shows for the weight checks. `active` is false when the
 * match has none (no challenge, older backend): everything else is then
 * inert and the start is never gated here.
 */
export interface WeightCheckView extends WeightCheckState {
  busy: boolean;
  check: (verdict: WeightVerdict) => Promise<void>;
  /** Re-weigh for this match; false when refused. */
  reweigh: (lbs: number) => Promise<boolean>;
}

/** No opponent to judge: inert, and the start is never gated here. */
const NO_OPPONENT_CHECK: WeightCheckState = {
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
};

/** The face-off's weight-check state for this athlete. */
export function deriveWeightCheckView(
  checks: WeightChecksHandle,
  meId: string,
  weightVerdicts: MatchCaps["weightVerdicts"] = "opponent",
): WeightCheckState {
  if (weightVerdicts !== "opponent") return NO_OPPONENT_CHECK;
  const { mine, theirs } = checksFor(checks.state, meId);
  return {
    active: checks.status === "ready" || checks.status === "loading",
    loading: checks.status === "loading",
    mine,
    theirs,
    blocked: checks.status === "ready" && !!checks.state?.blocked,
    canStart: checks.status === "ready" ? !!checks.state?.canStart : checks.status !== "loading",
    needsMyVerdict: mine?.status === "pending" || mine?.status === "recheck" || reweighedSinceFlag(mine),
    opponentReweighed: mine?.status === "recheck" || reweighedSinceFlag(mine),
    myFlagOpen: mine?.status === "flagged" && !reweighedSinceFlag(mine),
    mustReweigh: theirs?.status === "flagged" && !reweighedSinceFlag(theirs),
    awaitingTheirRecheck: theirs?.status === "recheck" || reweighedSinceFlag(theirs),
    awaitingTheirCheck: !!checks.state?.required && theirs?.status === "pending",
  };
}

// ---------------------------------------------------------------------------
// Timekeeper mode (spec 4.2 Weigh-in, Ready, Start; COPY-DECK B5, B6)
// ---------------------------------------------------------------------------

type FaceoffState = Pick<TimekeeperMatchState, "ready" | "timekeeperChecks" | "timeoutAt">;

function verdictOn(state: Pick<TimekeeperMatchState, "timekeeperChecks"> | null, athleteId: string) {
  return state?.timekeeperChecks.find((c) => c.subjectId === athleteId)?.status ?? null;
}

function isReady(state: Pick<TimekeeperMatchState, "ready"> | null, athleteId: string): boolean {
  return !!state?.ready.some((r) => r.athleteId === athleteId);
}

/** What a timekeeper-mode athlete's face-off shows from the server (TK-F1 to TK-F7, TK-D9). */
export interface AthleteTimekeeperState {
  /** The seated timekeeper's short name ("J. Cruz"); empty until the match read names them. */
  name: string;
  /** The timekeeper checks both weights (the match's sub-flag snapshot, A19). */
  checksWeights: boolean;
  /** The timekeeper confirmed both athletes' weights (TK-F3; TK-F2 until then). */
  weightsConfirmed: boolean;
  /** The timekeeper flagged this athlete's weight (TK-F7); a re-weigh voids it. */
  flaggedMe: boolean;
  /** The server has this athlete ready (`match_ready`; ready is server state, Q2). */
  meReady: boolean;
  opponentReady: boolean;
  /** When the face-off becomes a no contest (TK-D9, A26); null until the state names it. */
  timeoutAt: string | null;
}

export function deriveAthleteTimekeeperState(p: {
  /** Null until the first state read lands. */
  state: FaceoffState | null;
  meId: string;
  opponentId: string;
  timekeeperName: string;
  checksWeights: boolean;
}): AthleteTimekeeperState {
  return {
    name: p.timekeeperName,
    checksWeights: p.checksWeights,
    weightsConfirmed:
      p.checksWeights && verdictOn(p.state, p.meId) === "confirmed" && verdictOn(p.state, p.opponentId) === "confirmed",
    flaggedMe: verdictOn(p.state, p.meId) === "flagged",
    meReady: isReady(p.state, p.meId),
    opponentReady: isReady(p.state, p.opponentId),
    timeoutAt: p.state?.timeoutAt ?? null,
  };
}

/** One athlete as the timekeeper's face-off shows them (TK-K1 to TK-K5). */
export interface TimekeeperAthleteRow {
  athleteId: string;
  shortName: string;
  /** The rated weight (PM26); null until the state names one. Never the profile weight. */
  weightLbs: number | null;
  ready: boolean;
  /** The timekeeper's verdict on this athlete; null while not checked. */
  check: TimekeeperCheckStatus | null;
  /** Offer Confirm / Doesn't look right: the timekeeper judges, there is a rated weight to quote, and no verdict stands. */
  canJudge: boolean;
  /** The timekeeper's own flag is open: offer Withdraw flag. */
  canWithdraw: boolean;
}

/** The timekeeper's rows, in `athletes` order (challenger first). */
export function deriveTimekeeperRows(p: {
  athletes: readonly Pick<MatchAthleteView, "athleteId" | "shortName">[];
  /** The rated weights, by athlete (`stepSeams(...).ratedWeights`). */
  ratedWeights: readonly { athleteId: string; lbs: number | null }[];
  state: Pick<TimekeeperMatchState, "ready" | "timekeeperChecks"> | null;
  weightVerdicts: MatchCaps["weightVerdicts"];
}): TimekeeperAthleteRow[] {
  const judges = p.weightVerdicts === "both_athletes";
  return p.athletes.map((a) => {
    const weightLbs = p.ratedWeights.find((w) => w.athleteId === a.athleteId)?.lbs ?? null;
    const check = judges ? verdictOn(p.state, a.athleteId) : null;
    return {
      athleteId: a.athleteId,
      shortName: a.shortName,
      weightLbs,
      ready: isReady(p.state, a.athleteId),
      check,
      // A verdict quotes the rated weight (the server refuses any other), so none without one.
      canJudge: judges && weightLbs != null && check !== "confirmed" && check !== "flagged",
      canWithdraw: judges && check === "flagged",
    };
  });
}

/** The timekeeper still owes a verdict on someone (the start blockers then read TK-K8). */
export function timekeeperOwesVerdict(rows: readonly TimekeeperAthleteRow[], weightVerdicts: MatchCaps["weightVerdicts"]): boolean {
  return weightVerdicts === "both_athletes" && rows.some((r) => r.check !== "confirmed");
}

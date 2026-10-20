/**
 * Mode and role, derived ONCE per match snapshot (timekeeper mode,
 * ARCHITECTURE 2.1). Every hook, step and control reads `MatchRoles`, never
 * `requires_timekeeper` or the participant array (clean-code rules M-R1 and
 * M-R2): this module is the only place that pairs "me" with "the other one",
 * and the only place that reads the mode.
 *
 * Two first-class modes, decided by the backend at match creation:
 *  - self_run (`requires_timekeeper` missing or false): today's two-athlete
 *    flow, for every two-athlete match and every older backend;
 *  - timekeeper (`requires_timekeeper` true): a seated timekeeper runs the
 *    match; the athletes and the timekeeper each get their capability row.
 * The interfaces are the shape ARCHITECTURE 2.1 records as built (jits-o47s.25:
 * no `stillUrl`, `weightDivisionGap` added). The capture capabilities
 * (`recordingOrientation`, `captureLens`) join from M9's
 * `capture-policy.ts` (ARCHITECTURE 2.8), never from here.
 *
 * Pure: the match-loop harness imports `reconcile.ts`, which imports this
 * file's types, and runs outside React Native. Import only types and other
 * pure modules here, by relative path.
 */
import type { MatchDetails, MatchParticipant } from "@jits/shared/api/queries";
import { shortName } from "./short-name";

/** Decided by the backend at match creation (`matches.requires_timekeeper`). */
export type MatchMode = "self_run" | "timekeeper";
export type ViewerRole = "challenger" | "opponent" | "timekeeper";
export type AthleteOutcome = "win" | "loss" | "draw";

/** One athlete of the match: the one athlete shape the match flow reads. */
export interface MatchAthleteView {
  athleteId: string;
  displayName: string;
  /** "Mina Park" -> "M. Park". */
  shortName: string;
  currentElo: number | null;
  /**
   * The profile weight (`current_weight`, lbs). An athlete's rated weights
   * come from `useWizardWeights`; the timekeeper's step pair carries the
   * rated weights here instead (`stepSeams`, PM26).
   */
  weightLbs: number | null;
  photoUrl: string | null;
  /** The stamped outcome; null until a result is recorded. */
  outcome: AthleteOutcome | null;
  eloBefore: number | null;
  eloAfter: number | null;
  eloDelta: number | null;
  /** BE-stamped IBJJF division gap: informational since Rating V9 (no number depends on it). */
  weightDivisionGap: number | null;
  isChallenger: boolean;
}

/**
 * What this viewer may do in this match. Components read these, never the
 * mode or the viewer role (M-R3). The capture capabilities
 * (`recordingOrientation`, `captureLens`) join from `capture-policy.ts`
 * (ARCHITECTURE 2.8).
 */
export interface MatchCaps {
  /** Both athletes ready starts the match (no Start button). */
  readonly autoStart: boolean;
  /** This viewer starts the match. */
  readonly canStart: boolean;
  readonly canPauseEnd: boolean;
  readonly endVia: "broadcast" | "end_match_clock" | null;
  /** claim: first to start records; sole: only this viewer records; wait: someone else records. */
  readonly resultEntry: "claim" | "sole" | "wait";
  /** The server confirms the recorder's side with the result (B2). */
  readonly recorderAutoConfirmed: boolean;
  readonly canConfirm: boolean;
  readonly canEditResult: boolean;
  readonly leave: "cancel_for_all" | "timekeeper_seat" | "none";
  readonly recordingRequired: boolean;
  readonly readyPolicy: "broadcast" | "server_merged";
  readonly weightVerdicts: "opponent" | "both_athletes" | "none";
  readonly showsRatingOnConfirm: boolean;
  readonly submissionLayout: "chips" | "list";
}

export interface MatchRoles {
  mode: MatchMode;
  viewer: ViewerRole;
  /** Null for the timekeeper. */
  me: MatchAthleteView | null;
  /** Null for the timekeeper. */
  opponent: MatchAthleteView | null;
  /** Challenger first. */
  athletes: readonly [MatchAthleteView, MatchAthleteView];
  /** The seated timekeeper (timekeeper mode only); null while nobody is seated. */
  timekeeper: { id: string; name: string; shortName: string } | null;
  caps: MatchCaps;
}

/** Today's flow: two athletes run the match themselves. */
const SELF_RUN_CAPS: MatchCaps = {
  autoStart: true,
  canStart: false,
  canPauseEnd: true,
  endVia: "broadcast",
  resultEntry: "claim",
  recorderAutoConfirmed: true,
  canConfirm: true,
  canEditResult: false,
  leave: "cancel_for_all",
  recordingRequired: false,
  readyPolicy: "broadcast",
  weightVerdicts: "opponent",
  // The confirm step shows YOUR RATING today; owner decision A25 removes it (slice M5).
  showsRatingOnConfirm: true,
  submissionLayout: "chips",
};

/** Timekeeper mode, either athlete: the timekeeper starts, runs the clock and records. */
const TIMEKEEPER_MODE_ATHLETE_CAPS: MatchCaps = {
  autoStart: false,
  canStart: false,
  canPauseEnd: false,
  endVia: null,
  resultEntry: "wait",
  recorderAutoConfirmed: false,
  canConfirm: true,
  canEditResult: false,
  leave: "cancel_for_all",
  recordingRequired: false,
  readyPolicy: "server_merged",
  weightVerdicts: "opponent",
  showsRatingOnConfirm: false,
  submissionLayout: "chips",
};

/** Timekeeper mode, the seated timekeeper. */
const TIMEKEEPER_CAPS: MatchCaps = {
  autoStart: false,
  canStart: true,
  canPauseEnd: true,
  endVia: "end_match_clock",
  resultEntry: "sole",
  recorderAutoConfirmed: false,
  canConfirm: false,
  // A8, A24: still subject to the server's 30-minute window.
  canEditResult: true,
  leave: "timekeeper_seat",
  recordingRequired: true,
  readyPolicy: "server_merged",
  // A19: the per-athlete verdicts only when the match snapshot asks for them.
  weightVerdicts: "both_athletes",
  showsRatingOnConfirm: false,
  submissionLayout: "list",
};

const TIMEKEEPER_NO_WEIGHT_CHECK_CAPS: MatchCaps = { ...TIMEKEEPER_CAPS, weightVerdicts: "none" };

function asOutcome(outcome: string | null | undefined): AthleteOutcome | null {
  return outcome === "win" || outcome === "loss" || outcome === "draw" ? outcome : null;
}

function toMatchAthleteView(p: MatchParticipant, isChallenger: boolean): MatchAthleteView {
  return {
    athleteId: p.athlete_id,
    displayName: p.display_name,
    shortName: shortName(p.display_name),
    currentElo: p.current_elo ?? null,
    weightLbs: p.current_weight ?? null,
    photoUrl: p.profile_photo_url ?? null,
    outcome: asOutcome(p.outcome),
    eloBefore: p.elo_before ?? null,
    eloAfter: p.elo_after ?? null,
    eloDelta: p.elo_delta ?? null,
    weightDivisionGap: p.weight_division_gap ?? null,
    isChallenger,
  };
}

/** The one read of the mode (M-R1): missing means the two-athlete flow. */
function modeOf(match: MatchDetails): MatchMode {
  return match.requires_timekeeper === true ? "timekeeper" : "self_run";
}

/**
 * Which of the two athletes challenged: `challenger_id` when the backend
 * names one of them (BE-G), else the first participant stands in (an older
 * backend; nothing in the two-athlete flow depends on it, jits-o47s.24).
 */
function challengerIdOf(match: MatchDetails, a: MatchParticipant, b: MatchParticipant): string {
  const named = match.challenger_id;
  if (named && (named === a.athlete_id || named === b.athlete_id)) return named;
  return match.participants[0].athlete_id;
}

function seatedTimekeeper(match: MatchDetails): MatchRoles["timekeeper"] {
  if (!match.timekeeper_id) return null;
  const name = match.timekeeper?.id === match.timekeeper_id ? match.timekeeper.display_name : "";
  return { id: match.timekeeper_id, name, shortName: name ? shortName(name) : "" };
}

function athleteRoles(match: MatchDetails, mode: MatchMode, mine: MatchParticipant, theirs: MatchParticipant): MatchRoles {
  const challengerId = challengerIdOf(match, mine, theirs);
  const me = toMatchAthleteView(mine, mine.athlete_id === challengerId);
  const opponent = toMatchAthleteView(theirs, theirs.athlete_id === challengerId);
  return {
    mode,
    viewer: me.isChallenger ? "challenger" : "opponent",
    me,
    opponent,
    athletes: me.isChallenger ? [me, opponent] : [opponent, me],
    timekeeper: mode === "timekeeper" ? seatedTimekeeper(match) : null,
    caps: mode === "timekeeper" ? TIMEKEEPER_MODE_ATHLETE_CAPS : SELF_RUN_CAPS,
  };
}

function timekeeperRoles(match: MatchDetails): MatchRoles | null {
  const [a, b] = match.participants;
  if (!a || !b) return null;
  const challengerId = challengerIdOf(match, a, b);
  const first = toMatchAthleteView(a, a.athlete_id === challengerId);
  const second = toMatchAthleteView(b, b.athlete_id === challengerId);
  return {
    mode: "timekeeper",
    viewer: "timekeeper",
    me: null,
    opponent: null,
    athletes: second.isChallenger ? [second, first] : [first, second],
    timekeeper: seatedTimekeeper(match),
    caps: match.tk_weight_check_required === true ? TIMEKEEPER_CAPS : TIMEKEEPER_NO_WEIGHT_CHECK_CAPS,
  };
}

/**
 * The viewer's roles in this match, or null for a viewer who is neither one
 * of its two athletes nor its seated timekeeper (the wizard's "Not a
 * participant"). A two-athlete match's record-only timekeeper (the code
 * join) stays null, as before: only a timekeeper-mode match has a
 * timekeeper role, and the mode is never read from `timekeeper_id` (B-R5).
 */
export function deriveMatchRoles(match: MatchDetails, viewerId: string): MatchRoles | null {
  const mode = modeOf(match);
  const mine = match.participants.find((p) => p.athlete_id === viewerId);
  if (mine) {
    const theirs = match.participants.find((p) => p.athlete_id !== viewerId);
    return theirs ? athleteRoles(match, mode, mine, theirs) : null;
  }
  if (mode === "timekeeper" && match.timekeeper_id === viewerId) return timekeeperRoles(match);
  return null;
}

/**
 * Mode and role, derived ONCE per match snapshot (timekeeper mode,
 * ARCHITECTURE 2.1). Every hook, step and control reads `MatchRoles`, never
 * `requires_timekeeper` or the participant array (clean-code rules M-R1 and
 * M-R2): this module is the only place that pairs "me" with "the other one".
 *
 * Only the self-run mode (today's two-athlete flow) is derived here yet. The
 * timekeeper values of `MatchMode`, `ViewerRole`, `timekeeper` and the
 * capabilities are typed so the timekeeper slice (M1) adds its rows without
 * changing this shape; nothing reaches them before it does.
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
  /** The profile weight (`current_weight`, lbs); the rated weights come from `useWizardWeights`. */
  weightLbs: number | null;
  photoUrl: string | null;
  /** The stamped outcome; null until a result is recorded. */
  outcome: AthleteOutcome | null;
  eloBefore: number | null;
  eloAfter: number | null;
  eloDelta: number | null;
  /** BE-stamped IBJJF division gap used for the phantom-ELO adjustment. */
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

/**
 * The viewer's roles in this match, or null for a viewer who is not one of
 * its two athletes (the wizard's "Not a participant").
 */
export function deriveMatchRoles(match: MatchDetails, viewerId: string): MatchRoles | null {
  const mine = match.participants.find((p) => p.athlete_id === viewerId);
  const theirs = match.participants.find((p) => p.athlete_id !== viewerId);
  if (!mine || !theirs) return null;
  // `get_match_details` names the challenger once BE-G ships (`challenger_id`,
  // read from M1 on). Until then the first participant stands in: nothing in
  // the self-run flow depends on which athlete challenged.
  const challengerId = match.participants[0].athlete_id;
  const me = toMatchAthleteView(mine, mine.athlete_id === challengerId);
  const opponent = toMatchAthleteView(theirs, theirs.athlete_id === challengerId);
  return {
    mode: "self_run",
    viewer: me.isChallenger ? "challenger" : "opponent",
    me,
    opponent,
    athletes: me.isChallenger ? [me, opponent] : [opponent, me],
    timekeeper: null,
    caps: SELF_RUN_CAPS,
  };
}

/**
 * What the face-off shows for the opponent weight checks (jr_be-ahn.4),
 * derived purely from the DB checks in hand and this athlete's id. Split out
 * of `use-faceoff.ts` (timekeeper mode ARCHITECTURE 2.3, "Weight-check
 * view"): the face-off hook adds the two actions and the busy flag.
 */
import {
  checksFor,
  reweighedSinceFlag,
  type WeightCheck,
  type WeightVerdict,
} from "@jits/shared/api/match-weight-checks";
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

/** The face-off's weight-check state for this athlete. */
export function deriveWeightCheckView(checks: WeightChecksHandle, meId: string): WeightCheckState {
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

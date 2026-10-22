/**
 * What the step renderer hands the result and confirm steps and the verdict
 * beyond the policy seams (`step-seams.ts`), read from the match in hand
 * (timekeeper mode slice M5). Pure, so the renderer only spreads them and the
 * rules live here, tested on their own.
 *
 * A two-athlete match gets the steps' defaults (no final clock, no stall, no
 * timekeeper result), so its result and confirm steps and its verdict read
 * exactly as before; the one input both modes get is the confirm's match
 * length (A25: the confirm shows the winner, how it ended and the match
 * length, no rating).
 */
import type { MatchDetails } from "@jits/shared/api/queries";
import type { TimekeeperMatchState } from "@jits/shared/api/timekeeper";
import type { BroadcastResult } from "@jits/shared/hooks/use-session-match-sync";
import type { MatchExtras } from "./match-extras";
import type { MatchRoles } from "./match-roles";
import { resultFromRoles } from "./reconcile";

/** The result step's timekeeper-mode inputs (`ResultStep`'s `finalElapsedS`, `reviewPending`). */
export interface ResultStepInputs {
  /**
   * The clock the timekeeper ended the match on (`matches.final_elapsed_s`):
   * the form's bound, its prefill and the ENDED AT line. Null in a
   * two-athlete match.
   */
  finalElapsedS: number | null;
  /** The timekeeper's result stalled into admin review (A6): TK-D8, TK-D10. */
  reviewPending: boolean;
}

export function resultStepInputs(
  match: Pick<MatchDetails, "final_elapsed_s">,
  tkState: Pick<TimekeeperMatchState, "reviewPending"> | null,
): ResultStepInputs {
  return { finalElapsedS: match.final_elapsed_s ?? null, reviewPending: tkState?.reviewPending === true };
}

/**
 * Timekeeper mode (A8, R18): the timekeeper recorded this result and can
 * still edit it. The confirm carries the edit count it confirms at, and the
 * header follows who recorded it and whether it was edited.
 */
export interface TimekeeperResult {
  /** `matches.result_edit_count` of the result on screen. */
  editCount: number;
  /** An admin recorded the stalled result (TK-R5b, PM19). */
  recordedByAdmin: boolean;
  /**
   * The result as the match in hand has it now (an edit changes it, A8);
   * null or omitted before the result is read, when this phone's own copy
   * stands in.
   */
  result?: BroadcastResult | null;
}

/** The confirm step's inputs beyond the seams (`ConfirmStep`'s `timekeeperResult`, `matchLengthSeconds`). */
export interface ConfirmStepInputs {
  /** Only for an athlete whose result the timekeeper records; undefined, the two-athlete confirm. */
  timekeeperResult: TimekeeperResult | undefined;
  /**
   * The clock when the match ended: the server's (timekeeper mode), else this
   * phone's reading at the end (a draw rebuilt from the DB has no other).
   */
  matchLengthSeconds: number | null;
}

export function confirmStepInputs(
  match: Pick<MatchDetails, "final_elapsed_s" | "result_edit_count" | "result_recorded_by_admin">,
  roles: Pick<MatchRoles, "me" | "opponent" | "athletes" | "caps">,
  initialFinishSeconds?: number,
): ConfirmStepInputs {
  // Someone else (the timekeeper) records this athlete's result: it can be edited under them.
  const recordedByTimekeeper = roles.caps.resultEntry === "wait";
  return {
    timekeeperResult: recordedByTimekeeper
      ? {
          editCount: match.result_edit_count ?? 0,
          recordedByAdmin: match.result_recorded_by_admin === true,
          result: resultFromRoles(roles),
        }
      : undefined,
    matchLengthSeconds: match.final_elapsed_s ?? initialFinishSeconds ?? null,
  };
}

/** The verdict's result inputs (`VerdictStep`'s `submissionName`, `finishTimeSeconds`, `resultType`). */
export interface VerdictStepInputs {
  submissionName: string | null;
  finishTimeSeconds: number | null;
  resultType: BroadcastResult["result"] | null;
}

/**
 * The result the verdict names. A two-athlete match: the match in hand's
 * finish, else this phone's copy of the result, exactly as before
 * (`submissionName` is the renderer's: the match's name, else the
 * catalogue's for this phone's code).
 *
 * An athlete whose result the timekeeper records: the match in hand's
 * result whenever it has one. A result edit (A8) changes it under this
 * phone's first copy, which the wizard keeps, so that copy stands in only
 * before the match has a result (as on the confirm step and the
 * timekeeper's done screen).
 */
export function verdictStepInputs(
  roles: Pick<MatchRoles, "me" | "opponent" | "athletes" | "caps">,
  resultData: BroadcastResult | null,
  extras: Pick<MatchExtras, "submissionName" | "finishTimeSeconds">,
  submissionName: string | null,
): VerdictStepInputs {
  const fromMatch = roles.caps.resultEntry === "wait" ? resultFromRoles(roles) : null;
  if (fromMatch) {
    return { submissionName: extras.submissionName, finishTimeSeconds: extras.finishTimeSeconds, resultType: fromMatch.result };
  }
  return {
    submissionName,
    finishTimeSeconds: extras.finishTimeSeconds ?? resultData?.finishTimeSeconds ?? null,
    resultType: resultData?.result ?? null,
  };
}

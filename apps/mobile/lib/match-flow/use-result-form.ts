import * as React from "react";
import { isFinishTimeValid, parseFinishTime } from "./parse-finish-time";
import { useFinishTimeField } from "./use-finish-time-field";

export type ResultOutcome = "submission" | "draw";

/** What the result form submits (the shape `useRecordResult().submit` takes). */
export interface ResultSubmission {
  outcome: ResultOutcome;
  /** The winner's athlete id; "" for a draw. */
  winnerId: string;
  /** The finish's submission type code; "" for a draw. */
  submissionCode: string;
  /** The finish time as typed (`mm:ss` or seconds); parse it with `parseFinishTime`. */
  finishTimeStr: string;
}

/** A recorded result to start the form from (the timekeeper's edit, A8). */
export interface ResultFormInitial {
  outcome: ResultOutcome;
  winnerId: string;
  submissionCode: string;
  finishTimeSeconds: number | null;
}

interface UseResultFormParams {
  /** The clock reading to prefill the finish time with (shown as FROM MATCH CLOCK). */
  prefillSeconds?: number;
  /** The latest finish time the form accepts: the final clock, else the match length. */
  boundSeconds: number;
  /** Start from a recorded result instead of an empty form (its finish is not "from the clock"). */
  initial?: ResultFormInitial | null;
  /**
   * An edit of `initial` (the timekeeper's, A8): the form submits only once
   * its value differs from it. The server takes an unchanged save as an edit
   * all the same (a new count, both confirmations deleted, both athletes
   * asked to confirm again), with nothing changed.
   */
  requireChange?: boolean;
  /**
   * Asked before a winner or Draw is picked; false keeps the form as it is.
   * The claim-first entry claims the form here (`useResultClaim().claimNow`).
   */
  beforePick?: () => boolean;
}

/**
 * The result form's state: the outcome, the winner, the finish and its time,
 * and whether that adds up to a result the server takes. Held by whoever
 * renders the form, so a claim-first result step keeps a half-filled form
 * across a waiting view (exactly as before the form was extracted), and the
 * standalone `ResultForm` (the admin record, M10) holds its own.
 *
 * The rule is the server's: a draw needs nothing more; a submission needs a
 * winner, a finish and a finish time from 0:01 to the bound. The practice
 * match (components/practice/practice-result.tsx) mirrors it; keep them in
 * step. An edit (`requireChange`) also needs a change from `initial`.
 */
export function useResultForm({ prefillSeconds, boundSeconds, initial = null, requireChange = false, beforePick }: UseResultFormParams) {
  const [outcome, setOutcome] = React.useState<ResultOutcome | null>(initial?.outcome ?? null);
  const [winnerId, setWinnerId] = React.useState(initial?.winnerId ?? "");
  const [submissionCode, setSubmissionCode] = React.useState(initial?.submissionCode ?? "");
  const finish = useFinishTimeField(initial ? (initial.finishTimeSeconds ?? undefined) : prefillSeconds);

  const finishValid = isFinishTimeValid(finish.finishTimeStr, boundSeconds);
  const finishProvided = finish.finishTimeStr.trim() !== "";
  const addsUp =
    outcome === "draw" ||
    (outcome === "submission" && winnerId !== "" && submissionCode !== "" && finishProvided && finishValid);
  const unchanged =
    requireChange && initial != null && sameResult(initial, { outcome, winnerId, submissionCode, finishTimeStr: finish.finishTimeStr });
  const canSubmit = addsUp && !unchanged;

  function pickWinner(id: string) {
    if (beforePick && !beforePick()) return;
    setOutcome("submission");
    setWinnerId(id);
  }
  function pickDraw() {
    if (beforePick && !beforePick()) return;
    setOutcome("draw");
    setWinnerId("");
  }
  function reset() {
    setOutcome(null);
    setWinnerId("");
  }
  /** The result to submit, or null while the form does not add up. */
  function value(): ResultSubmission | null {
    if (!outcome || !canSubmit) return null;
    return { outcome, winnerId, submissionCode, finishTimeStr: finish.finishTimeStr };
  }

  return {
    outcome,
    winnerId,
    submissionCode,
    setSubmissionCode,
    finishTimeStr: finish.finishTimeStr,
    onFinishChange: finish.onChange,
    // A recorded finish being edited did not come from the clock.
    finishFromClock: finish.fromClock && initial == null,
    finishInvalid: finishProvided && !finishValid,
    canSubmit,
    pickWinner,
    pickDraw,
    reset,
    value,
  };
}

/**
 * The form's value is the recorded result: the same outcome and, for a
 * submission, the same winner, finish and finish time (as seconds, so
 * `1:35` and `01:35` are the same time).
 */
function sameResult(
  initial: ResultFormInitial,
  v: { outcome: ResultOutcome | null; winnerId: string; submissionCode: string; finishTimeStr: string },
): boolean {
  if (v.outcome !== initial.outcome) return false;
  if (v.outcome === "draw") return true;
  return (
    v.winnerId === initial.winnerId &&
    v.submissionCode === initial.submissionCode &&
    parseFinishTime(v.finishTimeStr) === initial.finishTimeSeconds
  );
}

export type ResultFormState = ReturnType<typeof useResultForm>;

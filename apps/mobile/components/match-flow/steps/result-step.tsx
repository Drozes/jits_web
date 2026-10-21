import * as React from "react";
import { useRecordResult, type RecordedMeta } from "@/lib/match-flow/use-record-result";
import { useResultClaim } from "@/lib/match-flow/use-result-claim";
import { useResultForm } from "@/lib/match-flow/use-result-form";
import { TIMEKEEPER_COPY } from "@/lib/match-flow/timekeeper-copy";
import type { BroadcastResult } from "@jits/shared/hooks/use-session-match-sync";
import type { SubmissionType } from "@jits/shared/types/submission-type";
import { shortName } from "../fight/fight-ui";
import { ResultFormView, type ResultAthlete, type SubmissionLayout } from "./result-form";
import { ResultWaiting } from "./result-waiting";

interface ResultStepBaseProps {
  matchId: string;
  /** Match length in seconds; finish time can't exceed it. */
  durationSeconds: number;
  /** Match clock at End Match; prefills the (still editable) finish time. */
  initialFinishSeconds?: number;
  me: ResultAthlete;
  opponent: ResultAthlete;
  submissionTypes: SubmissionType[];
  onRecorded: (result: BroadcastResult, meta: RecordedMeta) => void;
  /** How the finishes are offered (`SubmissionPicker`). Default "chips". */
  submissionLayout?: SubmissionLayout;
  /**
   * Timekeeper mode: the clock the timekeeper ended the match on
   * (`matches.final_elapsed_s`). The server refuses a finish time past it,
   * so it is the form's bound, and it is the ENDED AT and the prefill (the
   * server's reading wins over this phone's). Null in a two-athlete match,
   * which then reads exactly as before.
   */
  finalElapsedS?: number | null;
  /**
   * Timekeeper mode: the result stalled and an admin will review the match
   * (`get_timekeeper_match_state.review_pending`, A6). The waiting athletes
   * see TK-D8; the timekeeper's form says TK-D10.
   */
  reviewPending?: boolean;
}

/**
 * How this viewer enters the result (`MatchCaps.resultEntry`, timekeeper
 * mode ARCHITECTURE 2.3):
 *  - "claim" (the default, today): either athlete may record, claim-first;
 *  - "sole": only this viewer records (the timekeeper), so nothing is
 *    claimed or waited on, and the tiles name the athletes without YOU /
 *    OPPONENT (TK-R1 under the form);
 *  - "wait": `recorderName` records; this phone waits, with no take-over.
 *    A blank name is no name (jits-o47s.27): the role (TK-F1), never the
 *    two-athlete "Opponent" fallback.
 */
type ResultEntryProps =
  | { entryPolicy?: "claim" | "sole"; recorderName?: undefined }
  | { entryPolicy: "wait"; recorderName: string };

type ResultStepProps = ResultStepBaseProps & ResultEntryProps;

/**
 * The result step: record the result, claim-first by default (`entryPolicy`).
 * The first athlete to start (tap a winner or Draw) claims the form; the
 * other phone shows a live "recording the result" view and cannot open it,
 * until a result lands (they move on to confirm) or the claim goes quiet for
 * 20 s (the form unlocks).
 *
 * Winner = two big tiles plus Draw; then the finishes (eight one-tap chips
 * with the full catalogue search, or the full scrollable list, A12) and the
 * finish time prefilled from the clock.
 */
export function ResultStep(props: ResultStepProps) {
  const { matchId, durationSeconds, initialFinishSeconds, me, opponent, submissionTypes, onRecorded, submissionLayout } = props;
  const { finalElapsedS = null, reviewPending = false } = props;
  const policy = props.entryPolicy ?? "claim";
  // Only claim-first entry claims the form or hears the other side's claims.
  const claims = policy === "claim";
  // The server's final clock when there is one (timekeeper mode), else this phone's reading.
  const endedAtSeconds = finalElapsedS ?? initialFinishSeconds;
  const boundSeconds = finalElapsedS ?? durationSeconds;

  const remoteClaimRef = React.useRef<((athleteId: string, at: number, supersedes: number | null) => void) | null>(null);
  const { loading, submit, broadcastResultClaimed } = useRecordResult({
    matchId,
    onRecorded,
    currentAthleteId: me.athleteId,
    onResultClaimed: (athleteId, at, supersedes) => remoteClaimRef.current?.(athleteId, at, supersedes),
  });
  const claim = useResultClaim({ meId: me.athleteId, broadcast: broadcastResultClaimed });
  remoteClaimRef.current = claims ? claim.onRemoteClaim : null;
  // Held here, not in the form, so a half-filled form survives a waiting view.
  const form = useResultForm({ prefillSeconds: endedAtSeconds, boundSeconds, beforePick: claims ? claim.claimNow : undefined });

  if (props.entryPolicy === "wait") {
    const recorder = props.recorderName.trim() || TIMEKEEPER_COPY["TK-F1"];
    return (
      <ResultWaiting
        claimer={{ displayName: recorder }}
        me={me}
        opponent={opponent}
        durationSeconds={durationSeconds}
        endedAtSeconds={endedAtSeconds}
        notice={reviewPending ? TIMEKEEPER_COPY["TK-D8"](shortName(recorder)) : null}
      />
    );
  }

  if (claim.state === "theirs") {
    const claimer = claim.claimerId === opponent.athleteId ? opponent : me;
    return (
      <ResultWaiting
        claimer={claimer}
        me={me}
        opponent={opponent}
        durationSeconds={durationSeconds}
        endedAtSeconds={endedAtSeconds}
        onTakeOver={claim.canTakeOver ? claim.takeOver : undefined}
      />
    );
  }

  const sole = policy === "sole";
  const kicker = sole
    ? TIMEKEEPER_COPY["TK-R1"]({ a: shortName(me.displayName), b: shortName(opponent.displayName) })
    : claim.state === "mine"
      ? `You're recording for both of you. ${shortName(opponent.displayName)} sees this live.`
      : null;

  return (
    <ResultFormView
      form={form}
      athletes={[me, opponent]}
      roleTags={!sole}
      boundSeconds={boundSeconds}
      endedAtSeconds={endedAtSeconds}
      submissionTypes={submissionTypes}
      submissionLayout={submissionLayout}
      busy={loading}
      onSubmit={(value) => void submit(value)}
      copy={{ kicker, notice: sole && reviewPending ? TIMEKEEPER_COPY["TK-D10"] : null }}
    />
  );
}

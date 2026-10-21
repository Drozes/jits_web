import * as React from "react";
import * as Haptics from "expo-haptics";
import { toast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase/client";
import { recordMatchResult } from "@jits/shared/api/mutations";
import type { BroadcastResult } from "@jits/shared/hooks/use-session-match-sync";
import { settleWithin } from "@jits/shared/hooks/session-match-channel";
import { mutationQueue, isQueuedResult } from "@/lib/network/mutation-queue";
import { parseFinishTime } from "./parse-finish-time";
import { matchHaptics } from "./use-haptics";
import { SEND_GRACE_MS, useMatchSyncContext, useStepMatchSync } from "./match-sync-context";
import { CONFIRM_COPY } from "./confirm-copy";
import { useSendCeiling } from "./send-timing";

export interface RecordedMeta {
  /**
   * The server confirmed the recorder's side with the result (jr_be B2), so
   * this athlete skips the confirm step. False when the opponent's result
   * arrived instead, when the write was queued offline, or on an older
   * backend that does not auto-confirm.
   */
  recorderConfirmed: boolean;
}

interface UseRecordResultParams {
  matchId: string;
  onRecorded: (result: BroadcastResult, meta: RecordedMeta) => void;
  /** This athlete; announced as confirmed when the server auto-confirmed. */
  currentAthleteId?: string;
  /** The opponent claimed the result form (claim-first entry). */
  onResultClaimed?: (athleteId: string, claimedAt: number, supersedes: number | null) => void;
}

interface SubmitParams {
  outcome: "submission" | "draw";
  winnerId?: string;
  submissionCode?: string;
  finishTimeStr?: string;
}

/**
 * Wraps `recordMatchResult` with debounce, broadcast, error toasts, and
 * the broadcast listener for the opponent's submission. Pulled out of
 * the result step so the step keeps only its form and its claim handling.
 *
 * The mutation runs through `mutationQueue` so a flaky-network record
 * isn't lost: when offline, the call is queued under a stable per-match
 * key and the wizard advances optimistically; the queue auto-flushes on
 * reconnect (see `lib/network/mutation-queue.ts`).
 *
 * Timekeeper mode (the step channels carry `timekeeperModeSelfId`; spec 10,
 * ARCHITECTURE M-R8): the timekeeper's `result_submitted` names them
 * (`actor_id`), and a received one only re-reads the match, never moves this
 * phone by itself: the completed match the read brings moves the athletes to
 * confirm. A refused record toasts the shipped title with no DomainError
 * message (M-R4), and with `Check your connection and try again.` (PM29).
 * The record is bounded (`SEND_CEILING_MS`, PM29: the result step has no
 * exit and the timekeeper's Leave is refused once the clock ended), so a
 * dead socket ends as that failure instead of a busy button forever; a reply
 * after the ceiling, or after the step unmounted, is dropped (the reads show
 * a late landing). A refusal that means the match moved on (MATCH_NOT_PENDING:
 * this phone's own earlier send landed, or an admin recorded or voided the
 * stalled match) shows no toast: the re-read moves the screen to the done
 * screen or the exit. A two-athlete match sends and handles it exactly as
 * before.
 */
export function useRecordResult({ matchId, onRecorded, currentAthleteId, onResultClaimed }: UseRecordResultParams) {
  const [loading, setLoading] = React.useState(false);
  const recordedRef = React.useRef(false);
  const ceiling = useSendCeiling();

  const { reconcileNow, timekeeperModeSelfId } = useMatchSyncContext();
  const sync = useStepMatchSync({
    matchId,
    onResultSubmitted: (r) => {
      if (recordedRef.current) return;
      if (timekeeperModeSelfId) {
        reconcileNow();
        return;
      }
      recordedRef.current = true;
      onRecorded(r, { recorderConfirmed: false });
    },
    onResultClaimed: (athleteId, claimedAt, supersedes) => onResultClaimed?.(athleteId, claimedAt, supersedes),
  });

  const submit = React.useCallback(
    async ({ outcome, winnerId, submissionCode, finishTimeStr }: SubmitParams) => {
      if (recordedRef.current) return;
      setLoading(true);
      const finishSeconds = finishTimeStr ? parseFinishTime(finishTimeStr) : null;
      // Route through the offline-tolerant queue. When online this runs
      // immediately and returns the real `Result`; when offline, the queue
      // resolves with a `QueuedResult` sentinel and replays on reconnect.
      const call = mutationQueue.enqueue(`record-result:${matchId}`, () =>
        recordMatchResult(supabase, {
          matchId,
          result: outcome,
          winnerId: outcome === "submission" ? winnerId : undefined,
          submissionTypeCode: outcome === "submission" ? submissionCode : undefined,
          finishTimeSeconds:
            outcome === "submission" && finishSeconds != null ? finishSeconds : undefined,
        }),
      );
      // Timekeeper mode: bounded by the ceiling, and silent once the step has gone (PM29).
      const res = timekeeperModeSelfId ? await ceiling.within(call) : await call;
      if (!res.ok) {
        setLoading(false);
        if (timekeeperModeSelfId && res.error.code === "MATCH_NOT_PENDING") {
          // Moved on: the match is no longer in progress. The read shows why.
          reconcileNow();
          return;
        }
        void matchHaptics.error();
        // Timekeeper mode shows no DomainError message (M-R4, spec 14.9 X1): the
        // shared table maps its refusals to two-athlete words; it shows the
        // guidance instead (PM29). The two-athlete toast keeps its shipped description.
        toast.error(timekeeperModeSelfId ? { text1: "Couldn't record result", description: CONFIRM_COPY.checkConnection } : { text1: "Couldn't record result", description: res.error.message });
        // The usual cause is that the opponent recorded first and their
        // result_submitted never arrived: re-read the match now so the
        // wizard moves on instead of offering a form that cannot succeed.
        reconcileNow();
        return;
      }
      const queued = isQueuedResult(res.data);
      recordedRef.current = true;
      // Success only once the server has it; a result queued offline is not
      // recorded yet, so it gets a light acknowledgement instead.
      if (queued) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      } else {
        void matchHaptics.resultRecorded();
      }
      const broadcast: BroadcastResult = {
        result: outcome,
        winnerId: outcome === "submission" ? winnerId : undefined,
        submissionCode: outcome === "submission" ? submissionCode : undefined,
        finishTimeSeconds: finishSeconds ?? undefined,
      };
      // onRecorded unmounts this step, and with it the channel, so the
      // broadcast used to be torn down a millisecond after it was queued
      // and the opponent sat on the result step (jits-mzfu). Wait for the
      // server's ack, bounded. Offline there is nothing to wait for: the
      // opponent's wizard picks the result up from the DB (reconciler) once
      // the queued write lands.
      const recorderConfirmed = !queued && (res.data as { recorder_confirmed?: boolean }).recorder_confirmed === true;
      // Timekeeper mode names its actor (spec 10); a two-athlete send is unchanged.
      const sent = timekeeperModeSelfId
        ? sync.broadcastResultSubmitted(broadcast, timekeeperModeSelfId)
        : sync.broadcastResultSubmitted(broadcast);
      // The server confirmed this side too: tell the opponent's confirm step
      // now, so it shows this athlete confirmed without waiting on a poll.
      const confirmedSent =
        recorderConfirmed && currentAthleteId ? sync.broadcastResultConfirmed(currentAthleteId) : undefined;
      if (!queued) await settleWithin(confirmedSent ? Promise.all([sent, confirmedSent]) : sent, SEND_GRACE_MS);
      if (queued) {
        toast.success({
          text1: "Saved locally",
          description: "Result will sync when you're back online.",
        });
      }
      onRecorded(broadcast, { recorderConfirmed });
    },
    [matchId, onRecorded, sync, reconcileNow, currentAthleteId, timekeeperModeSelfId, ceiling],
  );

  return { loading, submit, broadcastResultClaimed: sync.broadcastResultClaimed };
}

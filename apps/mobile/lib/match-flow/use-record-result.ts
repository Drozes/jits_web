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

interface UseRecordResultParams {
  matchId: string;
  onRecorded: (result: BroadcastResult) => void;
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
 * the result step to keep the visual component below 100 lines.
 *
 * The mutation runs through `mutationQueue` so a flaky-network record
 * isn't lost: when offline, the call is queued under a stable per-match
 * key and the wizard advances optimistically; the queue auto-flushes on
 * reconnect (see `lib/network/mutation-queue.ts`).
 */
export function useRecordResult({ matchId, onRecorded }: UseRecordResultParams) {
  const [loading, setLoading] = React.useState(false);
  const recordedRef = React.useRef(false);

  const { reconcileNow } = useMatchSyncContext();
  const sync = useStepMatchSync({
    matchId,
    onResultSubmitted: (r) => {
      if (recordedRef.current) return;
      recordedRef.current = true;
      onRecorded(r);
    },
  });

  const submit = React.useCallback(
    async ({ outcome, winnerId, submissionCode, finishTimeStr }: SubmitParams) => {
      if (recordedRef.current) return;
      setLoading(true);
      const finishSeconds = finishTimeStr ? parseFinishTime(finishTimeStr) : null;
      // Route through the offline-tolerant queue. When online this runs
      // immediately and returns the real `Result`; when offline, the queue
      // resolves with a `QueuedResult` sentinel and replays on reconnect.
      const res = await mutationQueue.enqueue(`record-result:${matchId}`, () =>
        recordMatchResult(supabase, {
          matchId,
          result: outcome,
          winnerId: outcome === "submission" ? winnerId : undefined,
          submissionTypeCode: outcome === "submission" ? submissionCode : undefined,
          finishTimeSeconds:
            outcome === "submission" && finishSeconds != null ? finishSeconds : undefined,
        }),
      );
      if (!res.ok) {
        setLoading(false);
        void matchHaptics.error();
        toast.error({ text1: "Couldn't record result", description: res.error.message });
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
      const sent = sync.broadcastResultSubmitted(broadcast);
      if (!queued) await settleWithin(sent, SEND_GRACE_MS);
      if (queued) {
        toast.success({
          text1: "Saved locally",
          description: "Result will sync when you're back online.",
        });
      }
      onRecorded(broadcast);
    },
    [matchId, onRecorded, sync, reconcileNow],
  );

  return { loading, submit };
}

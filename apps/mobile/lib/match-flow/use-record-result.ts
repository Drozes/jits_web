import * as React from "react";
import { toast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase/client";
import { recordMatchResult } from "@jits/shared/api/mutations";
import {
  useSessionMatchSync,
  type BroadcastResult,
} from "@jits/shared/hooks/use-session-match-sync";
import { mutationQueue, isQueuedResult } from "@/lib/network/mutation-queue";
import { parseFinishTime } from "./parse-finish-time";

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

  const sync = useSessionMatchSync({
    supabase,
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
        toast.error({ text1: "Couldn't record result", description: res.error.message });
        return;
      }
      const queued = isQueuedResult(res.data);
      recordedRef.current = true;
      const broadcast: BroadcastResult = {
        result: outcome,
        winnerId: outcome === "submission" ? winnerId : undefined,
        submissionCode: outcome === "submission" ? submissionCode : undefined,
        finishTimeSeconds: finishSeconds ?? undefined,
      };
      // Broadcast may noop while offline; the opponent will pick up the
      // result via postgres-changes when our queued write actually lands.
      sync.broadcastResultSubmitted(broadcast);
      if (queued) {
        toast.success({
          text1: "Saved locally",
          description: "Result will sync when you're back online.",
        });
      }
      onRecorded(broadcast);
    },
    [matchId, onRecorded, sync],
  );

  return { loading, submit };
}

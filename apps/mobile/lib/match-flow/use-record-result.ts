import * as React from "react";
import { toast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase/client";
import { recordMatchResult } from "@jits/shared/api/mutations";
import {
  useSessionMatchSync,
  type BroadcastResult,
} from "@jits/shared/hooks/use-session-match-sync";
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
      const res = await recordMatchResult(supabase, {
        matchId,
        result: outcome,
        winnerId: outcome === "submission" ? winnerId : undefined,
        submissionTypeCode: outcome === "submission" ? submissionCode : undefined,
        finishTimeSeconds:
          outcome === "submission" && finishSeconds != null ? finishSeconds : undefined,
      });
      if (!res.ok) {
        setLoading(false);
        toast.error({ text1: "Couldn't record result", description: res.error.message });
        return;
      }
      recordedRef.current = true;
      const broadcast: BroadcastResult = {
        result: outcome,
        winnerId: outcome === "submission" ? winnerId : undefined,
        submissionCode: outcome === "submission" ? submissionCode : undefined,
        finishTimeSeconds: finishSeconds ?? undefined,
      };
      sync.broadcastResultSubmitted(broadcast);
      onRecorded(broadcast);
    },
    [matchId, onRecorded, sync],
  );

  return { loading, submit };
}

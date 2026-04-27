import * as React from "react";
import { toast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase/client";
import { endMatch, pauseMatch, resumeMatch } from "@jits/shared/api/mutations";
import type { useSessionMatchSync } from "@jits/shared/hooks/use-session-match-sync";
import type { useSessionMatchTimer } from "@jits/shared/hooks/use-session-match-timer";

type Sync = ReturnType<typeof useSessionMatchSync>;
type Timer = ReturnType<typeof useSessionMatchTimer>;
type Action = "pause" | "resume" | "end";

interface UseLiveControlsParams {
  matchId: string;
  timer: Timer;
  sync: Sync;
  endedRef: React.MutableRefObject<boolean>;
  onEnded: () => void;
}

/**
 * Encapsulates the three live-match buttons (pause, resume, end) plus
 * busy-state debouncing and toast error surfaces. Splitting this out of
 * the live-step keeps the visual component below 100 lines.
 */
export function useLiveControls({ matchId, timer, sync, endedRef, onEnded }: UseLiveControlsParams) {
  const [busy, setBusy] = React.useState<Action | null>(null);

  const handleEnd = React.useCallback(async () => {
    if (endedRef.current || busy) return;
    endedRef.current = true;
    setBusy("end");
    const res = await endMatch(supabase, matchId);
    setBusy(null);
    if (!res.ok) {
      endedRef.current = false;
      toast.error({ text1: "Couldn't end match", description: res.error.message });
      return;
    }
    sync.broadcastMatchEnded();
    onEnded();
  }, [busy, endedRef, matchId, onEnded, sync]);

  const handlePauseResume = React.useCallback(async () => {
    if (busy || endedRef.current) return;
    if (timer.paused) {
      setBusy("resume");
      const res = await resumeMatch(supabase, matchId);
      setBusy(null);
      if (!res.ok) {
        toast.error({ text1: "Couldn't resume", description: res.error.message });
        return;
      }
      timer.syncFromBroadcast({ type: "resumed", totalPausedDuration: res.data.total_paused_duration });
      sync.broadcastTimerResumed(res.data.total_paused_duration);
    } else {
      setBusy("pause");
      const res = await pauseMatch(supabase, matchId);
      setBusy(null);
      if (!res.ok) {
        toast.error({ text1: "Couldn't pause", description: res.error.message });
        return;
      }
      timer.syncFromBroadcast({ type: "paused", pausedAt: res.data.paused_at });
      sync.broadcastTimerPaused(res.data.paused_at);
    }
  }, [busy, endedRef, matchId, sync, timer]);

  return { busy, handleEnd, handlePauseResume };
}

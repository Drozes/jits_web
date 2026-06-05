import * as React from "react";
import { toast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase/client";
import { pauseMatch, resumeMatch } from "@jits/shared/api/mutations";
import type { useSessionMatchSync } from "@jits/shared/hooks/use-session-match-sync";
import type { useSessionMatchTimer } from "@jits/shared/hooks/use-session-match-timer";

type Sync = ReturnType<typeof useSessionMatchSync>;
type Timer = ReturnType<typeof useSessionMatchTimer>;
type Action = "pause" | "resume";

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

  const handleEnd = React.useCallback(() => {
    if (endedRef.current || busy) return;
    endedRef.current = true;
    // Do NOT call end_match here. end_match flips the match to 'completed',
    // but record_match_result (the next step) requires status='in_progress'
    // and would fail with invalid_status, so the result + ELO would never be
    // recorded (jits-ait). The match stays 'in_progress' through result entry;
    // record_match_result is what completes it (and the
    // trg_release_session_participants trigger still releases participants on
    // the in_progress -> completed transition). This mirrors the web flow,
    // which goes start -> record with no end_match in between. We only need to
    // stop the local timer, tell the opponent, and advance to result entry.
    sync.broadcastMatchEnded();
    onEnded();
  }, [busy, endedRef, onEnded, sync]);

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

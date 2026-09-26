import * as React from "react";
import { toast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase/client";
import { pauseMatch, resumeMatch } from "@jits/shared/api/mutations";
import { getMatchDetails } from "@jits/shared/api/queries";
import type { useSessionMatchSync } from "@jits/shared/hooks/use-session-match-sync";
// From the protocol module, not the hook module: tests mock the hook module.
import { settleWithin } from "@jits/shared/hooks/session-match-channel";
import { SEND_GRACE_MS } from "./match-sync-context";
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
    //
    // Advancing unmounts this step and removes the channel carrying
    // match_ended, so let the broadcast leave the device first (bounded):
    // a lost match_ended strands the opponent on the live timer
    // (jits-mzfu). `busy` disables the controls meanwhile.
    setBusy("end");
    void settleWithin(sync.broadcastMatchEnded(), SEND_GRACE_MS).then(() => {
      setBusy(null);
      onEnded();
    });
  }, [busy, endedRef, onEnded, sync]);

  const handlePauseResume = React.useCallback(async () => {
    if (busy || endedRef.current) return;
    if (timer.paused) {
      setBusy("resume");
      const res = await resumeMatch(supabase, matchId);
      setBusy(null);
      if (!res.ok && res.error.code === "MATCH_NOT_PAUSED") {
        // The match is already running (a resume we missed, e.g. the
        // opponent's broadcast was lost). Take the running state from the
        // DB rather than leaving this timer paused behind an error toast.
        const fresh = await getMatchDetails(supabase, matchId);
        if (fresh && fresh.status === "in_progress" && !fresh.paused_at) {
          timer.syncFromBroadcast({
            type: "resumed",
            totalPausedDuration: fresh.total_paused_duration,
          });
          return;
        }
      }
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
      if (!res.ok && res.error.code === "MATCH_NOT_IN_PROGRESS") {
        // pause_match maps "already paused" here (as well as a match that is
        // no longer running). Mirror of the resume recovery above: if the DB
        // says it is paused, this device missed the opponent's pause, so
        // apply it through the tracked timer instead of toasting. No
        // broadcast: the opponent paused it and already knows.
        const fresh = await getMatchDetails(supabase, matchId);
        if (fresh && fresh.status === "in_progress" && fresh.paused_at) {
          timer.syncFromBroadcast({ type: "paused", pausedAt: fresh.paused_at });
          return;
        }
      }
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

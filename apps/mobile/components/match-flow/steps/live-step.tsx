import * as React from "react";
import { View } from "react-native";
import { supabase } from "@/lib/supabase/client";
import { useSessionMatchSync } from "@jits/shared/hooks/use-session-match-sync";
import { useSessionMatchTimer } from "@jits/shared/hooks/use-session-match-timer";
import { useLiveControls } from "@/lib/match-flow/use-live-controls";
import { TimerDisplay } from "./timer-display";
import { LiveControls } from "./live-controls";

interface LiveStepProps {
  matchId: string;
  matchType: "ranked" | "casual";
  durationSeconds: number;
  startedAt: string;
  pausedAt: string | null;
  totalPausedDuration: number;
  /** Advance to the result step. Called after end_match completes or
   * after we receive a `match_ended` broadcast from the opponent. */
  onEnded: () => void;
}

/**
 * Step 4 -- live timer with pause/resume/end controls. Uses shared timer
 * hook for tick logic, shared sync hook for cross-device broadcasts, and
 * local `useLiveControls` to encapsulate the mutation + debounce logic.
 *
 * Note (Phase 5 polish): video recording and screen wake-lock are NOT
 * wired here. Web uses `useVideoRecorder` + `navigator.wakeLock`; mobile
 * needs `expo-camera` + `expo-keep-awake` which are not yet installed.
 */
export function LiveStep(props: LiveStepProps) {
  const { matchId, matchType, durationSeconds, startedAt, pausedAt, totalPausedDuration, onEnded } = props;
  const endedRef = React.useRef(false);
  const expiryFiredRef = React.useRef(false);

  const timer = useSessionMatchTimer({ durationSeconds, startedAt, pausedAt, totalPausedDuration });
  const sync = useSessionMatchSync({
    supabase,
    matchId,
    onTimerPaused: (p) => timer.syncFromBroadcast({ type: "paused", pausedAt: p }),
    onTimerResumed: (d) => timer.syncFromBroadcast({ type: "resumed", totalPausedDuration: d }),
    onMatchEnded: () => {
      if (endedRef.current) return;
      endedRef.current = true;
      onEnded();
    },
  });

  const { busy, handleEnd, handlePauseResume } = useLiveControls({
    matchId,
    timer,
    sync,
    endedRef,
    onEnded,
  });

  // Auto-end on time expiry, mirroring web
  React.useEffect(() => {
    if (timer.remaining === 0 && timer.running && !expiryFiredRef.current) {
      expiryFiredRef.current = true;
      const t = setTimeout(() => {
        if (!endedRef.current) void handleEnd();
      }, 1000);
      return () => clearTimeout(t);
    }
  }, [timer.remaining, timer.running, handleEnd]);

  return (
    <View className="items-center gap-5 px-1 py-6">
      <TimerDisplay
        formatted={timer.formatted}
        remaining={timer.remaining}
        paused={timer.paused}
        matchType={matchType}
      />
      <LiveControls
        paused={timer.paused}
        disabled={busy !== null || endedRef.current}
        onPauseResume={handlePauseResume}
        onEnd={handleEnd}
      />
    </View>
  );
}

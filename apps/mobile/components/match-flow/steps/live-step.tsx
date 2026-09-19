import * as React from "react";
import { View } from "react-native";
import { supabase } from "@/lib/supabase/client";
import { useSessionMatchSync } from "@jits/shared/hooks/use-session-match-sync";
import { useSessionMatchTimer } from "@jits/shared/hooks/use-session-match-timer";
import { useLiveControls } from "@/lib/match-flow/use-live-controls";
import { useMatchKeepAwake } from "@/lib/match-flow/use-keep-awake";
import { matchHaptics } from "@/lib/match-flow/use-haptics";
import type { UseVideoRecorderReturn } from "@/lib/video/use-video-recorder";
import { AUTO_END_DELAY_MS } from "@/lib/video/recording-limits";
import { TimerDisplay } from "./timer-display";
import { LiveControls } from "./live-controls";

interface LiveStepProps {
  matchId: string;
  matchType: "ranked" | "casual";
  durationSeconds: number;
  startedAt: string;
  pausedAt: string | null;
  totalPausedDuration: number;
  /**
   * The wizard's recorder, owned by `MatchRecorderProvider` ABOVE the step
   * boundary. It is deliberately not created here: ending a match unmounts
   * this step in the same tick and the upload only starts after that, so a
   * recorder scoped to this step could never report its own outcome
   * (jits-od3). The viewfinder and the status chip live up there too.
   */
  recorder: UseVideoRecorderReturn;
  /** Advance to the result step. Called after end_match completes or
   * after we receive a `match_ended` broadcast from the opponent. */
  onEnded: () => void;
}

const TIME_WARNING_SECONDS = 10;

/**
 * Step 4: live timer with pause / resume / end controls. Auto-starts the
 * wizard's recorder on entry and stops it on end. Activates the screen
 * wake-lock for the duration of the step and fires haptics on key events
 * (match start, time-warning, match end).
 *
 * The viewfinder and the upload status chip are rendered by the wizard,
 * not here: the camera has to be warm BEFORE this step mounts, and the
 * upload outcome arrives AFTER it unmounts, so neither can be scoped to
 * this step (jits-2zpe, jits-od3).
 *
 * Recording is best-effort: if the user denies camera access, the match
 * runs as before and the wizard's camera slot explains the fallback.
 *
 * ELO design system: timekeeper-view (D7 wireframe lines 1213-1238).
 * The camera viewfinder sits up top (wizard-level), then the hero mono
 * timer, then pause / end controls.
 */
export function LiveStep(props: LiveStepProps) {
  const {
    matchId,
    matchType,
    durationSeconds,
    startedAt,
    pausedAt,
    totalPausedDuration,
    recorder,
    onEnded,
  } = props;
  const endedRef = React.useRef(false);
  const expiryFiredRef = React.useRef(false);
  const startHapticFiredRef = React.useRef(false);
  const warnHapticFiredRef = React.useRef(false);
  const recordingStartedRef = React.useRef(false);

  useMatchKeepAwake(true);

  const timer = useSessionMatchTimer({ durationSeconds, startedAt, pausedAt, totalPausedDuration });
  const sync = useSessionMatchSync({
    supabase,
    matchId,
    onTimerPaused: (p) => timer.syncFromBroadcast({ type: "paused", pausedAt: p }),
    onTimerResumed: (d) =>
      timer.syncFromBroadcast({ type: "resumed", totalPausedDuration: d }),
    onMatchEnded: () => {
      if (endedRef.current) return;
      endedRef.current = true;
      void recorder.stop();
      onEnded();
    },
  });

  const wrappedOnEnded = React.useCallback(() => {
    void recorder.stop();
    void matchHaptics.matchEnd();
    onEnded();
  }, [recorder, onEnded]);

  const { busy, handleEnd, handlePauseResume } = useLiveControls({
    matchId,
    timer,
    sync,
    endedRef,
    onEnded: wrappedOnEnded,
  });

  // Fire match-start haptic once when the step mounts
  React.useEffect(() => {
    if (startHapticFiredRef.current) return;
    startHapticFiredRef.current = true;
    void matchHaptics.matchStart();
  }, []);

  // Auto-start recording once the camera ref is ready and permission is
  // granted. We retry on permission flip via the dep array.
  React.useEffect(() => {
    if (recordingStartedRef.current) return;
    if (!recorder.permission?.granted) return;
    recordingStartedRef.current = true;
    void recorder.start();
  }, [recorder.permission?.granted, recorder]);

  // Time-warning haptic once at <= 10s remaining
  React.useEffect(() => {
    if (warnHapticFiredRef.current) return;
    if (timer.running && timer.remaining > 0 && timer.remaining <= TIME_WARNING_SECONDS) {
      warnHapticFiredRef.current = true;
      void matchHaptics.timeWarning();
    }
  }, [timer.remaining, timer.running]);

  // Auto-end on time expiry, mirroring web
  React.useEffect(() => {
    if (timer.remaining === 0 && timer.running && !expiryFiredRef.current) {
      expiryFiredRef.current = true;
      const t = setTimeout(() => {
        if (!endedRef.current) void handleEnd();
      }, AUTO_END_DELAY_MS);
      return () => clearTimeout(t);
    }
  }, [timer.remaining, timer.running, handleEnd]);

  return (
    <View className="items-center gap-5 px-1 py-2">
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

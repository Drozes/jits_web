import * as React from "react";
import { View } from "react-native";
import { supabase } from "@/lib/supabase/client";
import { useSessionMatchSync } from "@jits/shared/hooks/use-session-match-sync";
import { useSessionMatchTimer } from "@jits/shared/hooks/use-session-match-timer";
import { useLiveControls } from "@/lib/match-flow/use-live-controls";
import { useMatchKeepAwake } from "@/lib/match-flow/use-keep-awake";
import { matchHaptics } from "@/lib/match-flow/use-haptics";
import { useVideoRecorder } from "@/lib/video/use-video-recorder";
import { TimerDisplay } from "./timer-display";
import { LiveControls } from "./live-controls";
import { CameraOverlay } from "../camera-overlay";
import { UploadProgressBanner } from "../upload-progress-banner";

interface LiveStepProps {
  matchId: string;
  matchType: "ranked" | "casual";
  durationSeconds: number;
  startedAt: string;
  pausedAt: string | null;
  totalPausedDuration: number;
  /**
   * Current athlete's `athletes.id` for setting `match_videos.uploaded_by`
   * per BE contract §2.1 + §8.1. May be null briefly during AuthProvider
   * hydration; recorder will surface an error state until populated.
   */
  uploaderAthleteId: string | null;
  /** Advance to the result step. Called after end_match completes or
   * after we receive a `match_ended` broadcast from the opponent. */
  onEnded: () => void;
}

const TIME_WARNING_SECONDS = 10;

/**
 * Step 4 -- live timer with pause/resume/end controls. Mounts a camera
 * preview, auto-starts recording on entry, auto-stops on end. Activates
 * the screen wake-lock for the duration of the step and fires haptics
 * on key events (match start, time-warning, match end).
 *
 * Recording is best-effort: if the user denies camera access, the match
 * runs as before and a small banner explains the fallback.
 */
export function LiveStep(props: LiveStepProps) {
  const { matchId, matchType, durationSeconds, startedAt, pausedAt, totalPausedDuration, uploaderAthleteId, onEnded } = props;
  const endedRef = React.useRef(false);
  const expiryFiredRef = React.useRef(false);
  const startHapticFiredRef = React.useRef(false);
  const warnHapticFiredRef = React.useRef(false);
  const recordingStartedRef = React.useRef(false);

  useMatchKeepAwake(true);

  const recorder = useVideoRecorder(matchId, uploaderAthleteId);
  const timer = useSessionMatchTimer({ durationSeconds, startedAt, pausedAt, totalPausedDuration });
  const sync = useSessionMatchSync({
    supabase,
    matchId,
    onTimerPaused: (p) => timer.syncFromBroadcast({ type: "paused", pausedAt: p }),
    onTimerResumed: (d) => timer.syncFromBroadcast({ type: "resumed", totalPausedDuration: d }),
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
      }, 1000);
      return () => clearTimeout(t);
    }
  }, [timer.remaining, timer.running, handleEnd]);

  return (
    <View className="items-center gap-4 px-1 py-4">
      <CameraOverlay
        cameraRef={recorder.cameraRef}
        permissionGranted={recorder.permission?.granted ?? false}
        permissionCanAskAgain={recorder.permission?.canAskAgain ?? true}
        onRequestPermission={() => void recorder.requestPermission()}
        recording={recorder.state === "recording"}
      />
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
      <UploadProgressBanner state={recorder.state} error={recorder.error} />
    </View>
  );
}

import * as React from "react";
import { View } from "react-native";
import { useSessionMatchTimer } from "@jits/shared/hooks/use-session-match-timer";
import { TimerDisplay } from "@/components/match-flow/steps/timer-display";
import { LiveControls } from "@/components/match-flow/steps/live-controls";
import { useMatchRecorder } from "@/components/match-flow/match-recorder-context";
import { matchHaptics } from "@/lib/match-flow/use-haptics";
import { AUTO_END_DELAY_MS } from "@/lib/video/recording-limits";
import { PRACTICE_BOT_NAME, PRACTICE_DURATION_SECONDS } from "@/lib/practice/constants";

/**
 * The practice clock: the real timer hook and leaves, paused and resumed
 * locally instead of over the match channel. Recording starts on mount (if
 * the camera is allowed) and stops on End Match or when the clock runs out,
 * exactly like a real match. The clip is never uploaded.
 */
export function PracticeLive({ onEnd }: { onEnd: (finishSeconds: number) => void }) {
  const recorder = useMatchRecorder();
  const [startedAt] = React.useState(() => new Date().toISOString());
  const timer = useSessionMatchTimer({
    durationSeconds: PRACTICE_DURATION_SECONDS,
    startedAt,
    pausedAt: null,
    totalPausedDuration: 0,
  });
  const pausedAtRef = React.useRef<number | null>(null);
  const totalPausedRef = React.useRef(0);
  const endedRef = React.useRef(false);
  // Same capture as the real live step: the clock at the end, clamped to 1..duration.
  const elapsedRef = React.useRef(timer.elapsed);
  elapsedRef.current = timer.elapsed;
  const recordingStartedRef = React.useRef(false);

  React.useEffect(() => {
    void matchHaptics.matchStart();
  }, []);

  React.useEffect(() => {
    if (recordingStartedRef.current || !recorder.permission?.granted) return;
    recordingStartedRef.current = true;
    void recorder.start();
  }, [recorder]);

  const end = React.useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    void recorder.stop();
    void matchHaptics.matchEnd();
    onEnd(Math.min(PRACTICE_DURATION_SECONDS, Math.max(1, elapsedRef.current)));
  }, [recorder, onEnd]);

  const pauseResume = React.useCallback(() => {
    if (pausedAtRef.current == null) {
      pausedAtRef.current = Date.now();
      timer.syncFromBroadcast({ type: "paused", pausedAt: new Date(pausedAtRef.current).toISOString() });
      return;
    }
    totalPausedRef.current += Math.floor((Date.now() - pausedAtRef.current) / 1000);
    pausedAtRef.current = null;
    timer.syncFromBroadcast({ type: "resumed", totalPausedDuration: totalPausedRef.current });
  }, [timer]);

  // Same auto-end as the real live step: at 00:00, unless paused. Read
  // through a ref so a re-render at 00:00 never cancels the armed timeout.
  const endRef = React.useRef(end);
  endRef.current = end;
  const autoEndDue = timer.remaining === 0 && !timer.paused;
  React.useEffect(() => {
    if (!autoEndDue) return;
    const t = setTimeout(() => endRef.current(), AUTO_END_DELAY_MS);
    return () => clearTimeout(t);
  }, [autoEndDue]);

  return (
    <View className="items-center gap-5 px-1 py-2">
      <TimerDisplay
        formatted={timer.formatted}
        remaining={timer.remaining}
        paused={timer.paused}
        matchType="casual"
        kindLabel="Practice"
        opponentName={PRACTICE_BOT_NAME}
      />
      <LiveControls paused={timer.paused} disabled={false} onPauseResume={pauseResume} onEnd={end} />
    </View>
  );
}

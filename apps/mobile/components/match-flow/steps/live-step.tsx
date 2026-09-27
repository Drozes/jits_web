import * as React from "react";
import { StyleSheet, View } from "react-native";
import { useStepMatchSync } from "@/lib/match-flow/match-sync-context";
import { useSessionMatchTimer } from "@jits/shared/hooks/use-session-match-timer";
import { useLiveControls } from "@/lib/match-flow/use-live-controls";
import { usePauseResync } from "@/lib/match-flow/use-pause-resync";
import { matchHaptics } from "@/lib/match-flow/use-haptics";
import { clampFinishSeconds } from "@/lib/match-flow/clamp-finish-seconds";
import type { UseVideoRecorderReturn } from "@/lib/video/use-video-recorder";
import { AUTO_END_DELAY_MS } from "@/lib/video/recording-limits";
import {
  OPPONENT_ENDED_INTERSTITIAL_MS,
  toLiveAthlete,
  type LiveParticipant,
} from "@/lib/match-flow/live-view-state";
import { LiveBroadcast } from "../live/live-broadcast";

interface LiveStepProps {
  matchId: string;
  matchType: "ranked" | "casual";
  /** This device's athlete (left on the athlete bar). */
  me: LiveParticipant;
  /** The opponent (right on the athlete bar, and named if they end it). */
  opponent: LiveParticipant;
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
   * after we receive a `match_ended` broadcast from the opponent, with the
   * match clock at that moment (pause-aware, clamped to 1..duration) so the
   * result step can prefill the finish time. */
  onEnded: (finishSeconds: number) => void;
  /**
   * Record from this phone (the face-off opt-in, decision 5). Default true.
   * False never arms the recorder and shows the no-video plate's "recording
   * off" state instead of the camera.
   */
  recordingEnabled?: boolean;
}

const TIME_WARNING_SECONDS = 10;

/**
 * Step 4: live timer with pause / resume / hold-to-end controls. Auto-starts the
 * wizard's recorder on entry and stops it on end, and fires haptics on key
 * events (match start, time-warning, match end). The screen wake-lock is
 * held by the wizard across ready AND live, so it is not taken here.
 *
 * The viewfinder and the upload status chip are rendered by the wizard,
 * not here: the camera has to be warm BEFORE this step mounts, and the
 * upload outcome arrives AFTER it unmounts, so neither can be scoped to
 * this step (jits-2zpe, jits-od3).
 *
 * Recording is best-effort: if the user denies camera access, the match
 * runs as before and the live screen says there is no video.
 *
 * Layout: the portrait broadcast lower-third (`LiveBroadcast`), drawn over
 * the full-screen camera the wizard renders underneath. Ending takes a
 * 1.2 s hold. When the opponent ends the match, their plate shows for
 * OPPONENT_ENDED_INTERSTITIAL_MS before the END step.
 */
export function LiveStep(props: LiveStepProps) {
  const {
    matchId,
    matchType,
    me,
    opponent,
    durationSeconds,
    startedAt,
    pausedAt,
    totalPausedDuration,
    recorder,
    onEnded,
    recordingEnabled = true,
  } = props;
  const endedRef = React.useRef(false);
  const startHapticFiredRef = React.useRef(false);
  const warnHapticFiredRef = React.useRef(false);
  const recordingStartedRef = React.useRef(false);
  const endHapticFiredRef = React.useRef(false);
  // `endedRef` is the one-shot guard; this state only makes the ended look
  // (ENDING, dimmed buttons) render, since a ref change alone does not.
  const [endedView, setEndedView] = React.useState(false);
  const interstitialTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // R-P8: set when the opponent's match_ended lands; the clock freezes on it.
  const [opponentEnded, setOpponentEnded] = React.useState<{
    name: string;
    finalFormatted: string;
    finalRemaining: number;
  } | null>(null);

  // The final whistle, at most once per mount: a completed hold fires it at
  // completion, and the end that follows (after the broadcast settles) must
  // not fire it a second time.
  const fireEndHaptic = React.useCallback(() => {
    if (endHapticFiredRef.current) return;
    endHapticFiredRef.current = true;
    void matchHaptics.matchEnd();
  }, []);

  // Every pause/resume (tap, broadcast, DB re-read) goes through this timer,
  // which re-applies the DB pause state after a missed broadcast but ignores
  // a read older than a change already applied here.
  const timer = usePauseResync(
    useSessionMatchTimer({ durationSeconds, startedAt, pausedAt, totalPausedDuration }),
    pausedAt,
    totalPausedDuration,
  );
  // The clock at the end moment, clamped to what record_match_result accepts
  // (above 0, at most the duration: auto-end fires a beat after 00:00).
  const elapsedRef = React.useRef(timer.elapsed);
  elapsedRef.current = timer.elapsed;
  const formattedRef = React.useRef(timer.formatted);
  formattedRef.current = timer.formatted;
  const remainingRef = React.useRef(timer.remaining);
  remainingRef.current = timer.remaining;
  const sync = useStepMatchSync({
    matchId,
    onTimerPaused: (p) => timer.syncFromBroadcast({ type: "paused", pausedAt: p }),
    onTimerResumed: (d) =>
      timer.syncFromBroadcast({ type: "resumed", totalPausedDuration: d }),
    // The opponent ended it. Read the finish and stop the recorder NOW,
    // then hold the "opponent ended" plate briefly before the END step.
    onMatchEnded: () => {
      if (endedRef.current) return;
      endedRef.current = true;
      const finish = clampFinishSeconds(elapsedRef.current, durationSeconds);
      void recorder.stop();
      fireEndHaptic();
      setOpponentEnded({
        name: opponent.display_name,
        finalFormatted: formattedRef.current,
        finalRemaining: remainingRef.current,
      });
      interstitialTimerRef.current = setTimeout(() => onEnded(finish), OPPONENT_ENDED_INTERSTITIAL_MS);
    },
  });

  const wrappedOnEnded = React.useCallback(
    (elapsed: number) => {
      void recorder.stop();
      fireEndHaptic();
      setEndedView(true);
      onEnded(clampFinishSeconds(elapsed, durationSeconds));
    },
    [recorder, onEnded, durationSeconds, fireEndHaptic],
  );

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
  //
  // Not on a clock that has already run out. Re-entering the live step of
  // an expired match (reopened from Arena, or a resync landing late) would
  // otherwise record the second or two before auto-end fires and upload it
  // as a success, spending the one (match_id, uploaded_by) video row and an
  // upload-cap slot on a clip of nothing.
  //
  // Nor once the match has ended: a permission grant landing during the
  // opponent-ended interstitial must not start a clip after the stop.
  const expired = timer.remaining === 0;
  React.useEffect(() => {
    if (!recordingEnabled) return;
    if (recordingStartedRef.current || endedRef.current) return;
    if (!recorder.permission?.granted) return;
    if (expired) return;
    recordingStartedRef.current = true;
    void recorder.start();
  }, [recorder.permission?.granted, recorder, expired, recordingEnabled]);

  // Time-warning haptic once at <= 10s remaining, on a ticking clock (not on
  // mounting into a match already paused inside the last 10 s), and never
  // after the end (the clock keeps ticking under the interstitial).
  React.useEffect(() => {
    if (warnHapticFiredRef.current || endedRef.current) return;
    if (timer.running && !timer.paused && timer.remaining > 0 && timer.remaining <= TIME_WARNING_SECONDS) {
      warnHapticFiredRef.current = true;
      void matchHaptics.timeWarning();
    }
  }, [timer.remaining, timer.running, timer.paused]);

  // Auto-end on time expiry, mirroring web. `handleEnd` is a new function
  // on every render (its `sync` and `onEnded` are), and the timer keeps
  // re-rendering every second at 00:00, so it is read through a ref: with it
  // in the deps, the first tick inside AUTO_END_DELAY_MS cancelled the armed
  // timeout and the match sat LIVE at 00:00 forever (jits-2y8i). The effect
  // keys only on whether an auto-end is due, so it arms once and is cancelled
  // only by unmount or by the match stopping being due: a pause at 00:00
  // holds it (the timekeeper stopped the clock on purpose) and resuming
  // re-arms it; an in-flight pause/resume (`busy`) defers it rather than
  // letting `handleEnd` drop it. `endedRef` makes the end one-shot, whether
  // this device ended it or the opponent's `match_ended` arrived first.
  // The practice match (components/practice/practice-live.tsx) mirrors this auto-end.
  const handleEndRef = React.useRef(handleEnd);
  handleEndRef.current = handleEnd;
  const autoEndDue =
    timer.remaining === 0 &&
    timer.running &&
    !timer.paused &&
    busy === null &&
    !endedRef.current;
  React.useEffect(() => {
    if (!autoEndDue) return;
    const t = setTimeout(() => {
      if (!endedRef.current) handleEndRef.current();
    }, AUTO_END_DELAY_MS);
    return () => clearTimeout(t);
  }, [autoEndDue]);

  React.useEffect(
    () => () => {
      if (interstitialTimerRef.current) clearTimeout(interstitialTimerRef.current);
    },
    [],
  );

  // Hold completed (or a screen reader "End match" action): the haptic
  // lands at completion, then the same end path as before.
  const onHoldEnd = React.useCallback(() => {
    if (endedRef.current || busy !== null) return;
    fireEndHaptic();
    setEndedView(true);
    handleEnd();
  }, [busy, fireEndHaptic, handleEnd]);

  const ended = endedRef.current || endedView;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <LiveBroadcast
        kindLabel={matchType === "ranked" ? "RANKED" : "CASUAL"}
        me={toLiveAthlete(me)}
        opponent={toLiveAthlete(opponent)}
        durationSeconds={durationSeconds}
        formatted={timer.formatted}
        remaining={timer.remaining}
        paused={timer.paused}
        recorder={recorder}
        controlsDisabled={busy !== null || ended}
        endPending={busy === "end" || ended}
        onPauseResume={handlePauseResume}
        onEnd={onHoldEnd}
        opponentEnded={opponentEnded}
        recordingOff={!recordingEnabled}
      />
    </View>
  );
}

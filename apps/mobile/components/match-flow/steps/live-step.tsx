import * as React from "react";
import { StyleSheet, View } from "react-native";
import { useSessionMatchTimer } from "@jits/shared/hooks/use-session-match-timer";
import { useLiveControls, type EndVia } from "@/lib/match-flow/use-live-controls";
import { useLiveReceivePolicy } from "@/lib/match-flow/use-live-receive-policy";
import { useLiveAutoEnd } from "@/lib/match-flow/use-live-auto-end";
import type { LiveTimekeeperSeam } from "@/lib/match-flow/step-seams";
import { usePauseResync } from "@/lib/match-flow/use-pause-resync";
import { matchHaptics } from "@/lib/match-flow/use-haptics";
import { clampFinishSeconds } from "@/lib/match-flow/clamp-finish-seconds";
import type { UseVideoRecorderReturn } from "@/lib/video/use-video-recorder";
import { toLiveAthlete, type LiveParticipant } from "@/lib/match-flow/live-view-state";
import { LiveBroadcast, type LiveControls } from "../live/live-broadcast";
import { timekeeperLiveSlots } from "../live/timekeeper-live-plates";
import { liveTimeoutChip } from "../faceoff/timeout-chip";

export interface LiveStepProps {
  matchId: string;
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
  /** Advance to the result step. Called once: after this device's end (the
   * hold or the auto-end) has sent `match_ended` (bounded; no `end_match`,
   * see `useLiveControls`), or after the opponent-ended plate when the
   * opponent's `match_ended` arrives. Passes the match clock at the end
   * moment (pause-aware, clamped to 1..duration) so the result step can
   * prefill the finish time. */
  onEnded: (finishSeconds: number) => void;
  /**
   * Record from this phone (the face-off opt-in, decision 5). Default true.
   * False never arms the recorder and shows the no-video plate's "recording
   * off" state instead of the camera.
   */
  recordingEnabled?: boolean;
  /**
   * Fire the `matchStart` haptic on mount. Default true. The face-off
   * countdown passes false when it has just fired `countdownGo` for the same
   * moment (one haptic per event, Motion Rule).
   */
  startHaptic?: boolean;
  /**
   * Who is named on the ended plate when a `match_ended` arrives from the
   * other side. Default: the opponent (in a self-run match only the two
   * athletes can end it).
   */
  endedByName?: string;
  /** The live screen's pause and end controls (`LiveBroadcast`). Default "full". */
  controls?: LiveControls;
  /** With `controls` "none": shown in the controls' place (default in timekeeper mode: TK-L2). */
  controlsStrip?: React.ReactNode;
  /**
   * How this phone ends the clock (`roles.caps.endVia`; timekeeper mode
   * ARCHITECTURE 2.3 "End"). Default "broadcast": today's two-athlete end.
   * "end_match_clock": the timekeeper's end, on the server first. null: a
   * timekeeper-mode athlete, who never ends the clock (no auto-end at 00:00:
   * the timekeeper's phone, or the server at full time, ends it).
   *
   * Anything but "broadcast" means the clock is server-run, so a received
   * pause, resume or end never changes this screen by itself (M-R8): it
   * re-reads the DB at once, and the read applies the pause or moves the
   * wizard on (a read that shows a no contest stops the recorder before the
   * wizard's exit). On an athlete's phone (null), the seated timekeeper's end
   * (`actor_id` equal to `timekeeper.id`) also freezes the clock on the
   * ended plate meanwhile (spec 4.2 End, PM1), with `endedByName`, until the
   * DB confirms the end or shows the clock still running, which undoes it
   * (`useLiveReceivePolicy`); the read that shows the end freezes it too,
   * broadcast or not, on the server's final clock, and the wizard keeps this
   * step on screen for a moment after it moves on (`useLiveEndHold`). The
   * timekeeper's own phone never freezes on a received end: nobody else
   * ends its clock, and a stray `match_ended` on the public match channel
   * must not lock its controls. On a server-run
   * clock the end haptic marks the confirmed end only: the server's answer
   * to this phone's end, or the read that shows it.
   */
  endVia?: EndVia;
  /** Timekeeper mode with a seated timekeeper (`stepSeams`): TK-L1, TK-L2, TK-D7, TK-D9, TK-L3, TK-K16. */
  timekeeper?: LiveTimekeeperSeam;
  /**
   * Draws the TK-D9 no-contest countdown at `timeoutAt`. Default: M3's chip
   * (`faceoff/timeout-chip.tsx`, `liveTimeoutChip`), read-only, on the
   * on-media ground (jits-o47s.29). It shows only with a seated timekeeper
   * whose state names a timeout, while paused or offline
   * (`timekeeperLiveSlots`), so a two-athlete match never draws it.
   */
  renderTimeoutChip?: (timeoutAt: string) => React.ReactNode;
}

const TIME_WARNING_SECONDS = 10;

/**
 * The live step: live timer with pause / resume / hold-to-end controls.
 * Auto-starts the wizard's recorder on entry and stops it on end, and fires
 * haptics on key events (match start, time-warning, match end). The screen
 * wake-lock is held by the wizard across ready AND live, so it is not taken
 * here.
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
 *
 * Timekeeper mode (spec 4.2 Live and End, 4.3; the `endVia` and
 * `timekeeper` seams): the timekeeper's phone runs the clock (TK-L1, Leave
 * with TK-K16, the server end, TK-L3 when its camera fails); an athlete's
 * phone watches it (TK-L2, TK-D7 while the timekeeper is offline) and never
 * ends it; every phone shows TK-D9 while paused. The DB moves every phone
 * off this step (`ended_at`, or a cancel); see `endVia`. What this step does
 * with received clock events lives in `useLiveReceivePolicy`.
 */
export function LiveStep(props: LiveStepProps) {
  const {
    matchId,
    me,
    opponent,
    durationSeconds,
    startedAt,
    pausedAt,
    totalPausedDuration,
    recorder,
    onEnded,
    recordingEnabled = true,
    startHaptic = true,
    endedByName,
    controls,
    controlsStrip,
    endVia = "broadcast",
    timekeeper,
    renderTimeoutChip = liveTimeoutChip,
  } = props;
  const endedRef = React.useRef(false);
  const startHapticFiredRef = React.useRef(false);
  const warnHapticFiredRef = React.useRef(false);
  const recordingStartedRef = React.useRef(false);
  const endHapticFiredRef = React.useRef(false);

  // The final whistle, at most once per mount: a completed hold fires it at
  // completion, and the end that follows (after the broadcast settles) must
  // not fire it a second time. On a server-run clock it marks the confirmed
  // end only (`wrappedOnEnded`, or the read in `useLiveReceivePolicy`).
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
  // The other side ended it (R-P8), received pauses and resumes, and the DB
  // reads a server-run clock waits on.
  const { sync, opponentEnded } = useLiveReceivePolicy({
    matchId,
    endVia,
    timekeeper,
    endedByName,
    opponentName: opponent.displayName,
    durationSeconds,
    timer,
    recorder,
    endedRef,
    onEnded,
    fireEndHaptic,
  });

  const wrappedOnEnded = React.useCallback(
    (elapsed: number) => {
      void recorder.stop();
      fireEndHaptic();
      onEnded(clampFinishSeconds(elapsed, durationSeconds));
    },
    [recorder, onEnded, durationSeconds, fireEndHaptic],
  );

  const {
    busy,
    ended: endedView,
    handleEnd,
    handlePauseResume,
    handleLeave,
    endFailures,
    canAutoEnd,
  } = useLiveControls({
    matchId,
    timer,
    sync,
    endedRef,
    onEnded: wrappedOnEnded,
    endVia,
    onLeftSeat: () => void recorder.stop(),
  });

  // Fire match-start haptic once when the step mounts
  React.useEffect(() => {
    if (startHapticFiredRef.current) return;
    startHapticFiredRef.current = true;
    if (startHaptic) void matchHaptics.matchStart();
    // Mount-only: the countdown decides once, at GO.
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

  // Auto-end on time expiry (`useLiveAutoEnd`; never on a timekeeper-mode
  // athlete's phone, and bounded retries for a failing server end).
  useLiveAutoEnd({ canAutoEnd, timer, busy, endedRef, handleEnd, endFailures });

  // Hold completed (or a screen reader "End match" action): the haptic
  // lands at completion, then the same end path as before. The
  // timekeeper's server end buzzes only once the server has ended the clock
  // (`wrappedOnEnded`): a failed end must not have buzzed "ended".
  const onHoldEnd = React.useCallback(() => {
    if (endedRef.current || busy !== null) return;
    if (endVia === "broadcast") fireEndHaptic();
    handleEnd();
  }, [busy, endVia, fireEndHaptic, handleEnd]);

  const ended = endedRef.current || endedView;
  const runsClock = controls !== "none";
  const tk = timekeeperLiveSlots({
    timekeeper,
    runsClock,
    paused: timer.paused,
    ended,
    busy: busy !== null,
    // The shipped error plate's state (`deriveLiveView`): the camera is
    // allowed and the recorder failed, so Restart can work. Without the
    // permission, the shipped permission plate stays (one action).
    cameraFailed: runsClock && recordingEnabled && recorder.permission?.granted === true && recorder.state === "error" && !ended,
    onLeave: handleLeave,
    onRestartCamera: () => void recorder.start(),
    renderTimeoutChip,
  });
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <LiveBroadcast
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
        controls={controls}
        controlsStrip={controlsStrip ?? tk.controlsStrip}
        hudExtra={tk.hudExtra}
        banner={tk.banner}
        hideNoVideoPlate={tk.hideNoVideoPlate}
        holdKey={endFailures}
      />
    </View>
  );
}

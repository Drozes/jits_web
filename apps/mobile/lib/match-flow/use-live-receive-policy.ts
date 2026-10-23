import * as React from "react";
import type { useSessionMatchTimer } from "@jits/shared/hooks/use-session-match-timer";
import type { MatchDetails } from "@jits/shared/api/queries";
import type { UseVideoRecorderReturn } from "@/lib/video/use-video-recorder";
import { useMatchSyncContext, useStepMatchSync } from "./match-sync-context";
import { clampFinishSeconds } from "./clamp-finish-seconds";
import { clockRunnerName } from "./clock-runner-name";
import { formatElapsed } from "./format-elapsed";
import { OPPONENT_ENDED_INTERSTITIAL_MS } from "./live-view-state";
import type { LiveTimekeeperSeam } from "./step-seams";
import type { EndVia } from "./use-live-controls";

type Timer = ReturnType<typeof useSessionMatchTimer>;

/** R-P8: the ended plate, with who ended the match and the clock frozen at that moment. */
export interface OpponentEnded {
  name: string;
  finalFormatted: string;
  finalRemaining: number;
}

/**
 * Reads showing the clock still running that undo a broadcast freeze (a
 * server-run clock). The reconciler runs one read at a time, so the first
 * read after the freeze may have left before the end was stamped; the second
 * left after the freeze, when a real end (stamped by `end_match_clock` before
 * its broadcast) is already in the DB.
 */
export const RUNNING_READS_TO_UNFREEZE = 2;

interface LiveReceivePolicyParams {
  matchId: string;
  /** How this phone ends the clock (`LiveStepProps.endVia`); anything but "broadcast" is a server-run clock. */
  endVia: EndVia;
  /** The seated timekeeper (`LiveStepProps.timekeeper`); absent in a two-athlete match. */
  timekeeper: LiveTimekeeperSeam | undefined;
  /** Who a received end names (`LiveStepProps.endedByName`). */
  endedByName: string | undefined;
  /** The opponent's name: who a two-athlete match's received end names by default. */
  opponentName: string;
  durationSeconds: number;
  /** The live step's pause-aware timer (`usePauseResync`). */
  timer: Timer;
  recorder: UseVideoRecorderReturn;
  /** The live step's one-shot end guard. */
  endedRef: React.MutableRefObject<boolean>;
  /** Advance to the result with the finish (a two-athlete match, after the ended plate). */
  onEnded: (finishSeconds: number) => void;
  /** The one-shot end haptic. */
  fireEndHaptic: () => void;
}

/**
 * Whether a received `match_ended` freezes this screen on the ended plate:
 * in a two-athlete match always (the opponent ended it); in timekeeper mode
 * only on an athlete's phone, and only when the seated timekeeper sent it.
 * Every other received end only re-reads (M-R8).
 */
function freezesOnReceivedEnd(endVia: EndVia, timekeeperId: string | undefined, actorId: string | undefined): boolean {
  if (endVia === "broadcast") return true;
  return endVia === null && actorId != null && actorId === timekeeperId;
}

/**
 * Who the ended plate names: `endedByName`, else the opponent (a
 * two-athlete match). A blank name never reaches the plate: in timekeeper
 * mode it is the timekeeper's short name or their role, never the opponent
 * (who did not end it) nor an empty line (jits-o47s.27).
 */
function endedByLabel(endedByName: string | undefined, timekeeper: LiveTimekeeperSeam | undefined, opponentName: string): string {
  if (endedByName?.trim()) return endedByName;
  return timekeeper ? clockRunnerName(timekeeper.name) : opponentName;
}

/** The DB shows the clock's end (timekeeper mode stamps `ended_at`; a result completes the match). */
function dbShowsEnd(m: MatchDetails): boolean {
  return m.ended_at != null || m.status === "completed";
}

/**
 * The ended plate's clock from a read that shows the end: the server's
 * (`final_elapsed_s`, which `end_match_clock` or the server's own end at
 * full time stamped), as remaining time like the live clock. Null when the
 * read carries none.
 */
function serverFinalClock(m: MatchDetails, durationSeconds: number): Omit<OpponentEnded, "name"> | null {
  if (m.final_elapsed_s == null) return null;
  const remaining = Math.max(0, durationSeconds - m.final_elapsed_s);
  return { finalFormatted: formatElapsed(remaining), finalRemaining: remaining };
}

/**
 * What the live step does with the clock events it receives and the DB reads
 * it sees: the step channel (`useStepMatchSync`) and the ended plate.
 *
 * A two-athlete match (`endVia` "broadcast") applies the opponent's pause and
 * resume, and on the opponent's end stops the recorder, fires the end haptic
 * and holds the ended plate for OPPONENT_ENDED_INTERSTITIAL_MS before the
 * result, exactly as it always did.
 *
 * A server-run clock (timekeeper mode) never changes the screen from a
 * broadcast alone (M-R8): a received pause, resume or end re-reads, and the
 * read applies it. On an athlete's phone, the seated timekeeper's end also
 * freezes the clock on the ended plate meanwhile (spec 4.2 End, PM1), and
 * reads that keep showing the clock running (`RUNNING_READS_TO_UNFREEZE`; a
 * stray or forged `match_ended` on the public channel) undo the freeze. The
 * read that shows the end freezes an athlete's phone on the plate whether or
 * not a broadcast came first (a lost broadcast, the server's own end at full
 * time), with the server's final clock (`final_elapsed_s`), and moves the
 * wizard to the result, which keeps this step on screen for
 * OPPONENT_ENDED_INTERSTITIAL_MS (`useLiveEndHold`). The end haptic fires
 * on the read that shows the end, never on a broadcast. A read that shows
 * the match cancelled (a no contest) stops the recorder before the wizard's
 * exit unmounts the camera.
 */
export function useLiveReceivePolicy(p: LiveReceivePolicyParams) {
  const { matchId, endVia, timekeeper, endedByName, opponentName, durationSeconds, timer, recorder, endedRef, onEnded, fireEndHaptic } = p;
  const serverRun = endVia !== "broadcast";
  const { reconcileNow, subscribeSnapshot } = useMatchSyncContext();
  const [opponentEnded, setOpponentEnded] = React.useState<OpponentEnded | null>(null);
  const interstitialTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Reads since a broadcast freeze that showed the clock still running; null while no broadcast freeze waits on the DB. */
  const runningReadsRef = React.useRef<number | null>(null);
  const recorderRef = React.useRef(recorder);
  recorderRef.current = recorder;
  // The clock at the end moment, clamped to what record_match_result accepts.
  const elapsedRef = React.useRef(timer.elapsed);
  elapsedRef.current = timer.elapsed;
  const formattedRef = React.useRef(timer.formatted);
  formattedRef.current = timer.formatted;
  const remainingRef = React.useRef(timer.remaining);
  remainingRef.current = timer.remaining;
  const endedLabelRef = React.useRef("");
  endedLabelRef.current = endedByLabel(endedByName, timekeeper, opponentName);

  // Snapshot listeners run before the wizard acts on the read (a step move
  // or an exit), so this step still sees the read that ends it. A
  // two-athlete match registers nothing here.
  React.useEffect(() => {
    if (!serverRun) return;
    return subscribeSnapshot((m) => {
      if (m.status === "cancelled") {
        endedRef.current = true;
        void recorderRef.current.stop();
        return;
      }
      if (dbShowsEnd(m)) {
        fireEndHaptic();
        // An athlete's phone (it never ends the clock): the ended plate, on
        // the server's clock; a broadcast freeze keeps its own when the read
        // has none. The timekeeper's phone has its own end path.
        if (endVia !== null) return;
        endedRef.current = true;
        runningReadsRef.current = null;
        const server = serverFinalClock(m, durationSeconds);
        setOpponentEnded((prev) =>
          server
            ? { name: endedLabelRef.current, ...server }
            : (prev ?? { name: endedLabelRef.current, finalFormatted: formattedRef.current, finalRemaining: remainingRef.current }),
        );
        return;
      }
      const reads = runningReadsRef.current;
      if (reads == null || m.status !== "in_progress") return;
      if (reads + 1 < RUNNING_READS_TO_UNFREEZE) {
        runningReadsRef.current = reads + 1;
        reconcileNow();
        return;
      }
      runningReadsRef.current = null;
      endedRef.current = false;
      setOpponentEnded(null);
    });
  }, [durationSeconds, endVia, endedRef, fireEndHaptic, reconcileNow, serverRun, subscribeSnapshot]);

  const sync = useStepMatchSync({
    matchId,
    onTimerPaused: (pausedAt) =>
      serverRun ? reconcileNow() : timer.syncFromBroadcast({ type: "paused", pausedAt }),
    onTimerResumed: (total) =>
      serverRun ? reconcileNow() : timer.syncFromBroadcast({ type: "resumed", totalPausedDuration: total }),
    onMatchEnded: (actorId?: string) => {
      if (endedRef.current) return;
      if (!freezesOnReceivedEnd(endVia, timekeeper?.id, actorId)) {
        reconcileNow();
        return;
      }
      endedRef.current = true;
      const finish = clampFinishSeconds(elapsedRef.current, durationSeconds);
      if (!serverRun) {
        void recorder.stop();
        fireEndHaptic();
      }
      setOpponentEnded({
        name: endedLabelRef.current,
        finalFormatted: formattedRef.current,
        finalRemaining: remainingRef.current,
      });
      if (serverRun) {
        // A hint: the DB confirms the end (and moves the wizard) or undoes it.
        runningReadsRef.current = 0;
        reconcileNow();
        return;
      }
      interstitialTimerRef.current = setTimeout(() => onEnded(finish), OPPONENT_ENDED_INTERSTITIAL_MS);
    },
  });

  React.useEffect(
    () => () => {
      if (interstitialTimerRef.current) clearTimeout(interstitialTimerRef.current);
    },
    [],
  );

  return { sync, opponentEnded };
}

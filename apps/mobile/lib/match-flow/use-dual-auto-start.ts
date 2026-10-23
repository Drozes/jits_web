import * as React from "react";
import { toast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase/client";
import { startMatch } from "@jits/shared/api/mutations";
import { getMatchDetails } from "@jits/shared/api/queries";
import type { DomainErrorCode } from "@jits/shared/api/errors";
import { settleWithin } from "@jits/shared/hooks/session-match-channel";
import { SEND_GRACE_MS } from "./match-sync-context";

/** start_match refusals from the weight gate. */
const WEIGHT_GATE_CODES: readonly DomainErrorCode[] = ["WEIGHT_FLAGGED", "WEIGHT_CHECK_PENDING", "WEIGHT_RECHECK_PENDING"];

/**
 * The bounded start retry (owner decision A29, bug jits-l7g3): after a
 * failure that is neither the weight gate nor a lost race, the next attempt
 * waits this long (2 s, then 4 s), and the run stops after the last wait's
 * attempt. Three `start_match` calls at most per run, about 6 s plus the
 * calls themselves: long enough to ride out a blip (a socket reconnecting,
 * a brief server error), short enough that a persistent refusal stops well
 * inside the face-off.
 */
export const START_RETRY_BACKOFF_MS: readonly number[] = [2_000, 4_000];
/** The most `start_match` calls one run makes: the first, then one after each wait. */
export const MAX_START_ATTEMPTS = START_RETRY_BACKOFF_MS.length + 1;

interface DualAutoStartParams {
  matchId: string;
  /**
   * The start policy is this one (`roles.caps.autoStart`). Default true.
   * False (timekeeper mode, where only the timekeeper starts the match) and
   * this hook never calls `start_match`.
   */
  enabled?: boolean;
  myReady: boolean;
  opponentReady: boolean;
  /** The weight gate lets the match start. */
  canStart: boolean;
  /** Set here once a start is under way; the face-off reads it too. */
  startedRef: React.MutableRefObject<boolean>;
  /** Set by Leave: a match this athlete is cancelling is never started. */
  cancelledRef: React.MutableRefObject<boolean>;
  broadcastTimerStarted: (startedAt: string) => Promise<unknown>;
  /** start_match completed here, or the race was lost to a started match. */
  onStarted: (startedAt: string) => void;
  /** The weight gate refused the start: back to the checks. */
  onWeightGate: () => void;
  /** The bounded retry ran out (A29): clear ready, so another run needs a fresh tap. */
  onGaveUp: () => void;
}

/** `ready`: the effect may start. `waiting`: a backoff before the next attempt. `stopped`: the run is over. */
type Run = "ready" | "waiting" | "stopped";

/**
 * The self-run start policy (timekeeper mode ARCHITECTURE 2.3, "Start
 * policy"): once both athletes are ready and the weight gate is open, both
 * phones race `start_match`. The loser of the race reads the DB and follows
 * a match that did start; a refusal from the weight gate puts the athlete
 * back on the checks. Split out of `use-faceoff.ts`.
 *
 * Any other failure (A29) says `Couldn't start match` ONCE for the run, on
 * its first failure, then backs off (`START_RETRY_BACKOFF_MS`) and stops
 * after `MAX_START_ATTEMPTS` calls, clearing ready (`onGaveUp`): Leave stays
 * available throughout, and a fresh tap of ready is a new run. Before A29 the
 * failure re-armed the start effect at once, about 3,600 calls and toasts in
 * 5 s.
 *
 * `stop()` is Leave's: tapped during a failed run (a backoff), it ends the
 * run at once, before the Leave alert opens, so no retry can claim the
 * face-off (`startedRef`) while the alert is up and turn its confirm into a
 * no-op. It clears ready (`onGaveUp`), so Keep Waiting needs a fresh tap of
 * ready, a new run. A run with no failure is left alone: the shipped Leave.
 */
export function useDualAutoStart(p: DualAutoStartParams): { starting: boolean; stop: () => void } {
  const [starting, setStarting] = React.useState(false);
  const [run, setRun] = React.useState<Run>("ready");
  const failuresRef = React.useRef(0);
  const retryTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pRef = React.useRef(p);
  pRef.current = p;
  const { startedRef, cancelledRef, broadcastTimerStarted } = p;

  const clearRetry = React.useCallback(() => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
  }, []);
  React.useEffect(() => clearRetry, [clearRetry]);

  /** A failure that is neither the weight gate nor a lost race (A29). */
  const failed = React.useCallback(
    (message: string) => {
      const failures = ++failuresRef.current;
      if (failures === 1) toast.error({ text1: "Couldn't start match", description: message });
      if (failures >= MAX_START_ATTEMPTS) {
        setRun("stopped");
        pRef.current.onGaveUp();
        return;
      }
      setRun("waiting");
      clearRetry();
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        setRun("ready");
      }, START_RETRY_BACKOFF_MS[failures - 1]);
    },
    [clearRetry],
  );

  // Only between attempts of a failed run: while a call is in flight Leave
  // is hidden (and refuses), and a run with no failure keeps the shipped Leave.
  const stop = React.useCallback(() => {
    if (failuresRef.current === 0 || startedRef.current) return;
    clearRetry();
    setRun("stopped");
    pRef.current.onGaveUp();
  }, [clearRetry, startedRef]);

  const handleStart = React.useCallback(async () => {
    // Never start a match this athlete is cancelling (Leave in flight).
    if (startedRef.current || cancelledRef.current) return;
    startedRef.current = true;
    setStarting(true);
    const result = await startMatch(supabase, pRef.current.matchId);
    // Left while start_match was in flight: the cancel owns the exit now.
    // Reset the spinner so a failed cancel (which re-arms Leave) is not left
    // stuck on "Starting match...".
    if (cancelledRef.current) {
      startedRef.current = false;
      setStarting(false);
      return;
    }
    if (!result.ok && WEIGHT_GATE_CODES.includes(result.error.code)) {
      // The weight gate refused (a flag, or a check still owed): back to the
      // checks. Clear ready so a retry needs a fresh tap, not a loop.
      startedRef.current = false;
      setStarting(false);
      pRef.current.onWeightGate();
      toast.info({ text1: "Match on hold", description: result.error.message });
      return;
    }
    if (!result.ok) {
      // Both devices race start_match; losing the race is not an error.
      const match = await getMatchDetails(supabase, pRef.current.matchId);
      if (match?.status === "in_progress" && match.started_at) {
        pRef.current.onStarted(match.started_at);
        return;
      }
      startedRef.current = false;
      // The run's next state first, so the start effect never sees a free
      // spinner with the run still open (no immediate re-attempt, A29).
      failed(result.error.message);
      setStarting(false);
      return;
    }
    const startedAt = result.data.started_at ?? new Date().toISOString();
    // Let timer_started leave the device before the step unmounts (jits-mzfu).
    await settleWithin(broadcastTimerStarted(startedAt), SEND_GRACE_MS);
    pRef.current.onStarted(startedAt);
  }, [startedRef, cancelledRef, broadcastTimerStarted, failed]);

  const { myReady, opponentReady, canStart } = p;
  const enabled = p.enabled !== false;

  // Not ready (yet, or again after the weight gate or a stopped run): the
  // next ready is a new run, with its own attempts and its own toast.
  React.useEffect(() => {
    if (myReady) return;
    failuresRef.current = 0;
    clearRetry();
    setRun("ready");
  }, [myReady, clearRetry]);

  React.useEffect(() => {
    if (enabled && run === "ready" && myReady && opponentReady && canStart && !startedRef.current && !starting) {
      void handleStart();
    }
  }, [enabled, run, myReady, opponentReady, canStart, starting, handleStart, startedRef]);

  return { starting, stop };
}

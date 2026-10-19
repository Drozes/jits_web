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

interface DualAutoStartParams {
  matchId: string;
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
}

/**
 * The self-run start policy (timekeeper mode ARCHITECTURE 2.3, "Start
 * policy"): once both athletes are ready and the weight gate is open, both
 * phones race `start_match`. The loser of the race reads the DB and follows
 * a match that did start; a refusal from the weight gate puts the athlete
 * back on the checks. Split out of `use-faceoff.ts`.
 */
export function useDualAutoStart(p: DualAutoStartParams): { starting: boolean } {
  const [starting, setStarting] = React.useState(false);
  const pRef = React.useRef(p);
  pRef.current = p;
  const { startedRef, cancelledRef, broadcastTimerStarted } = p;

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
      setStarting(false);
      toast.error({ text1: "Couldn't start match", description: result.error.message });
      return;
    }
    const startedAt = result.data.started_at ?? new Date().toISOString();
    // Let timer_started leave the device before the step unmounts (jits-mzfu).
    await settleWithin(broadcastTimerStarted(startedAt), SEND_GRACE_MS);
    pRef.current.onStarted(startedAt);
  }, [startedRef, cancelledRef, broadcastTimerStarted]);

  const { myReady, opponentReady, canStart } = p;
  React.useEffect(() => {
    if (myReady && opponentReady && canStart && !startedRef.current && !starting) void handleStart();
  }, [myReady, opponentReady, canStart, starting, handleStart, startedRef]);

  return { starting };
}

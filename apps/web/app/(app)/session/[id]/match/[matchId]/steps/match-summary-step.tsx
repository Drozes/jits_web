"use client";

import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { Check, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { confirmMatchResult, disputeMatchResult } from "@jits/shared/api/mutations";
import { getMatchConfirmations, getMatchDetails } from "@jits/shared/api/queries";
import { useSessionMatchSync, type BroadcastResult } from "@jits/shared/hooks/use-session-match-sync";
import { settleWithin } from "@jits/shared/hooks/session-match-channel";

/** How often a confirmer who is waiting on the opponent re-reads the DB. */
const WAITING_POLL_MS = 5_000;

/** After this athlete has confirmed, how long before they may stop waiting
 * on an opponent who never confirms (the result and ELO are already final
 * at record time; the confirmation does not change them). Mirrors mobile. */
export const LEAVE_AFTER_MS = 20_000;

/** Shown to the athlete whose opponent disputed the recorded result. */
export const opponentDisputedMessage = (name: string) =>
  `${name} disputed the result. An admin will review it.`;

/** Shown when filing a dispute failed without a mapped message. */
export const DISPUTE_FAILED_MESSAGE = "Couldn't dispute the result. Please try again.";

/**
 * Whether the confirm step is finished, from the DB. `completed` alone is
 * NOT enough: record_match_result sets it at RECORD time, before anyone has
 * confirmed, so advancing on it skipped confirmation and dispute entirely
 * once `matches` joined the realtime publication. Finished means disputed,
 * or a confirmation row from BOTH athletes.
 */
export function isConfirmStepDone(
  status: string | null | undefined,
  confirmedIds: string[] | null,
  currentAthleteId: string,
  opponentId: string,
): boolean {
  if (status === "disputed") return true;
  return !!confirmedIds && confirmedIds.includes(currentAthleteId) && confirmedIds.includes(opponentId);
}

interface MatchSummaryStepProps {
  onNext: () => void;
  matchId: string;
  matchType: "casual" | "ranked";
  matchStatus: string;
  currentAthleteId: string;
  opponent: { id: string; displayName: string };
  resultData: BroadcastResult | null;
  /**
   * `match_videos.id` for the clip uploaded during the timekeeper-live
   * step. `null` if recording was unavailable or the user is the
   * non-timekeeper fighter (no upload from this device). Reserved for
   * future use; the analysis viewer is currently mounted in
   * `match-recorded-step` where the user lingers.
   */
  videoId?: string | null;
}

export function MatchSummaryStep({ onNext, matchId, matchType, currentAthleteId, opponent, resultData }: MatchSummaryStepProps) {
  const [myConfirmed, setMyConfirmed] = useState(false);
  const [opponentConfirmed, setOpponentConfirmed] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const [canLeave, setCanLeave] = useState(false);
  const confirmedRef = useRef(false);
  // This athlete filed the dispute: its own row event is not news to toast.
  const disputeInFlightRef = useRef(false);
  // The failed-confirm toast (with Retry); dismissed once this step is done.
  const retryToastRef = useRef<string | number | null>(null);
  const onNextRaw = useRef(onNext);
  onNextRaw.current = onNext;
  // Several signals can finish this step (broadcasts, the row listener, the
  // poll, the local both-confirmed timer); advance exactly once.
  const advancedRef = useRef(false);
  const onNextRef = useRef(() => {
    if (advancedRef.current) return;
    advancedRef.current = true;
    dismissRetryToast();
    onNextRaw.current();
  });
  function dismissRetryToast() {
    if (retryToastRef.current !== null) toast.dismiss(retryToastRef.current);
    retryToastRef.current = null;
  }
  useEffect(() => () => dismissRetryToast(), []);

  /** The opponent disputed: say so once, then move on. */
  function opponentDisputed() {
    if (advancedRef.current) return;
    toast.info(opponentDisputedMessage(opponent.displayName));
    onNextRef.current();
  }

  const supabase = useMemo(() => createClient(), []);
  const sync = useSessionMatchSync({
    supabase,
    matchId,
    onResultConfirmed: (athleteId) => {
      if (athleteId === opponent.id) setOpponentConfirmed(true);
    },
    // The opponent disputed: there is nothing left to confirm, so say so and
    // move on exactly like the disputer does (jits-wfpo).
    onMatchDisputed: (athleteId) => {
      if (athleteId !== currentAthleteId) opponentDisputed();
    },
  });

  // Auto-advance when both athletes have confirmed
  useEffect(() => {
    if (myConfirmed && opponentConfirmed) {
      const t = setTimeout(() => onNextRef.current(), 1500);
      return () => clearTimeout(t);
    }
  }, [myConfirmed, opponentConfirmed]);

  // Re-read the match + confirmations and decide from the DB. Also seeds
  // the panels, so a refresh after confirming shows the waiting state.
  const checkDb = useCallback(async () => {
    const [match, ids] = await Promise.all([
      getMatchDetails(supabase, matchId),
      getMatchConfirmations(supabase, matchId),
    ]);
    if (advancedRef.current) return;
    if (ids?.includes(currentAthleteId)) {
      confirmedRef.current = true;
      setMyConfirmed(true);
    }
    if (ids?.includes(opponent.id)) setOpponentConfirmed(true);
    if (isConfirmStepDone(match?.status, ids, currentAthleteId, opponent.id)) onNextRef.current();
  }, [supabase, matchId, currentAthleteId, opponent.id]);

  // On mount (page refresh mid-confirm), and whenever the matches row
  // changes. The row event is only a trigger to re-read, never the
  // decision: its `completed` arrives at record time.
  useEffect(() => {
    void checkDb();
    const channel = supabase
      .channel(`match-complete:${matchId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "matches", filter: `id=eq.${matchId}` }, ({ new: row }) => {
        const r = row as { status?: string };
        if (r.status === "disputed") {
          if (disputeInFlightRef.current) onNextRef.current();
          else opponentDisputed();
        } else void checkDb();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [matchId, supabase, checkDb]);

  // A confirmation inserts a row but does not update `matches` (the status
  // is already completed), so a missed result_confirmed has no row event
  // to catch it: poll while waiting on the opponent.
  useEffect(() => {
    if (!myConfirmed || opponentConfirmed) return;
    const id = setInterval(() => void checkDb(), WAITING_POLL_MS);
    return () => clearInterval(id);
  }, [myConfirmed, opponentConfirmed, checkDb]);

  // An opponent who closes the app never confirms; do not hold this athlete
  // on the confirm step forever for a formality.
  useEffect(() => {
    if (!myConfirmed || opponentConfirmed) return;
    const t = setTimeout(() => setCanLeave(true), LEAVE_AFTER_MS);
    return () => clearTimeout(t);
  }, [myConfirmed, opponentConfirmed]);

  async function handleConfirm() {
    if (advancedRef.current || confirmedRef.current) return;
    dismissRetryToast();
    confirmedRef.current = true;
    setMyConfirmed(true);
    const res = await confirmMatchResult(supabase, matchId);
    if (!res.ok) {
      // Most often the opponent disputed, or our confirmation landed and
      // only the response was lost: let the DB decide before erroring.
      // The UI stays in its confirmed state meanwhile (no flash back to
      // Confirm/Dispute); checkDb sets the ref again if our row exists.
      confirmedRef.current = false;
      await checkDb();
      if (advancedRef.current) return;
      if (confirmedRef.current) {
        void sync.broadcastResultConfirmed(currentAthleteId);
        return;
      }
      setMyConfirmed(false);
      setCanLeave(false);
      retryToastRef.current = toast.error("Failed to confirm result. Please try again.", {
        action: { label: "Retry", onClick: () => void handleConfirm() },
      });
      return;
    }
    sync.broadcastResultConfirmed(currentAthleteId);
  }

  async function handleDispute() {
    if (advancedRef.current) return;
    disputeInFlightRef.current = true;
    setDisputing(true);
    const res = await disputeMatchResult(supabase, matchId);
    if (!res.ok) {
      // Stay on the step: nothing was disputed, and Confirm / Dispute are
      // both still the athlete's to choose.
      disputeInFlightRef.current = false;
      if (advancedRef.current) return;
      setDisputing(false);
      toast.error(res.error.message || DISPUTE_FAILED_MESSAGE);
      return;
    }
    // Tell the opponent (bounded) before this step and its channel go away.
    await settleWithin(sync.broadcastMatchDisputed(currentAthleteId), 1500);
    onNextRef.current();
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 px-4">
      <ResultBanner resultData={resultData} currentAthleteId={currentAthleteId} matchType={matchType} />

      <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
        <ConfirmPanel label="You" confirmed={myConfirmed} />
        <ConfirmPanel label={opponent.displayName} confirmed={opponentConfirmed} />
      </div>

      {!myConfirmed && (
        <Button className="w-full max-w-sm" size="lg" onClick={handleConfirm}>
          <Check className="mr-2 h-4 w-4" />
          Confirm Result
        </Button>
      )}
      {myConfirmed && !opponentConfirmed && (
        <p className="text-sm text-muted-foreground">Waiting for opponent to confirm...</p>
      )}
      {myConfirmed && !opponentConfirmed && canLeave && (
        <button type="button" onClick={() => onNextRef.current()} className="text-xs text-muted-foreground underline hover:text-foreground">
          Continue without waiting
        </button>
      )}

      {!myConfirmed && !disputing && (
        <button type="button" onClick={handleDispute} className="text-xs text-muted-foreground underline hover:text-foreground">
          <AlertTriangle className="inline h-3 w-3 mr-1" />
          Dispute result
        </button>
      )}
      {disputing && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
    </div>
  );
}

function ResultBanner({ resultData, currentAthleteId, matchType }: { resultData: BroadcastResult | null; currentAthleteId: string; matchType: "casual" | "ranked" }) {
  const isWinner = resultData?.result === "submission" && resultData.winnerId === currentAthleteId;
  const isLoser = resultData?.result === "submission" && resultData.winnerId !== currentAthleteId;
  return (
    <div className="text-center space-y-1">
      {isWinner && <p className="text-3xl font-bold text-success">Victory!</p>}
      {isLoser && <p className="text-3xl font-bold text-destructive">Defeat</p>}
      {resultData?.result === "draw" && <p className="text-3xl font-bold text-amber-500">Draw</p>}
      {!resultData && <p className="text-xl font-semibold">Match Complete</p>}
      {matchType === "ranked" && (
        <p className="text-xs text-muted-foreground">Ranked. ELO already applied. Disputes are reviewed by an admin.</p>
      )}
    </div>
  );
}

function ConfirmPanel({ label, confirmed }: { label: string; confirmed: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border p-4">
      {confirmed ? (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500/10">
          <Check className="h-5 w-5 text-green-500" />
        </div>
      ) : (
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      )}
      <p className="text-xs font-medium truncate w-full text-center">{label}</p>
    </div>
  );
}

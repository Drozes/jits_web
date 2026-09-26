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
  const confirmedRef = useRef(false);
  const onNextRaw = useRef(onNext);
  onNextRaw.current = onNext;
  // Several signals can finish this step (broadcasts, the row listener, the
  // poll, the local both-confirmed timer); advance exactly once.
  const advancedRef = useRef(false);
  const onNextRef = useRef(() => {
    if (advancedRef.current) return;
    advancedRef.current = true;
    onNextRaw.current();
  });

  const supabase = useMemo(() => createClient(), []);
  const sync = useSessionMatchSync({
    supabase,
    matchId,
    onResultConfirmed: (athleteId) => {
      if (athleteId === opponent.id) setOpponentConfirmed(true);
    },
    // The opponent disputed: there is nothing left to confirm, so move on
    // exactly like the disputer does (jits-wfpo).
    onMatchDisputed: (athleteId) => {
      if (athleteId !== currentAthleteId) onNextRef.current();
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
        if (r.status === "disputed") onNextRef.current();
        else void checkDb();
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

  async function handleConfirm() {
    if (confirmedRef.current) return;
    confirmedRef.current = true;
    setMyConfirmed(true);
    const res = await confirmMatchResult(supabase, matchId);
    if (!res.ok) {
      confirmedRef.current = false;
      setMyConfirmed(false);
      toast.error("Failed to confirm result. Please try again.");
      return;
    }
    sync.broadcastResultConfirmed(currentAthleteId);
  }

  async function handleDispute() {
    setDisputing(true);
    const res = await disputeMatchResult(supabase, matchId);
    // Tell the opponent (bounded) before this step and its channel go away.
    if (res.ok) await settleWithin(sync.broadcastMatchDisputed(currentAthleteId), 1500);
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
        <p className="text-xs text-muted-foreground">Ranked match. ELO will update on confirmation.</p>
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

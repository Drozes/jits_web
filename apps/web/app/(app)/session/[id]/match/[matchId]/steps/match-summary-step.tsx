"use client";

import { useState, useEffect, useRef } from "react";
import { Check, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { confirmMatchResult, disputeMatchResult } from "@jits/shared/api/mutations";
import { useSessionMatchSync, type BroadcastResult } from "@/hooks/use-session-match-sync";

interface MatchSummaryStepProps {
  onNext: () => void;
  matchId: string;
  matchType: "casual" | "ranked";
  matchStatus: string;
  currentAthleteId: string;
  opponent: { id: string; displayName: string };
  resultData: BroadcastResult | null;
}

export function MatchSummaryStep({ onNext, matchId, matchType, matchStatus, currentAthleteId, opponent, resultData }: MatchSummaryStepProps) {
  const [myConfirmed, setMyConfirmed] = useState(false);
  const [opponentConfirmed, setOpponentConfirmed] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const confirmedRef = useRef(false);
  const onNextRef = useRef(onNext);
  onNextRef.current = onNext;

  const sync = useSessionMatchSync({
    matchId,
    onResultConfirmed: (athleteId) => {
      if (athleteId === opponent.id) setOpponentConfirmed(true);
    },
  });

  // Listen for match completion via Postgres Changes
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`match-complete:${matchId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "matches", filter: `id=eq.${matchId}` }, ({ new: row }) => {
        const r = row as { status?: string };
        if (r.status === "completed") onNextRef.current();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [matchId]);

  // If the match is already completed on mount (e.g., after page refresh),
  // auto-advance since the PG Changes event will never fire.
  useEffect(() => {
    if (matchStatus === "completed") {
      const timer = setTimeout(() => onNextRef.current(), 1000);
      return () => clearTimeout(timer);
    }
  }, [matchStatus]);

  async function handleConfirm() {
    if (confirmedRef.current) return;
    confirmedRef.current = true;
    setMyConfirmed(true);
    const supabase = createClient();
    await confirmMatchResult(supabase, matchId);
    sync.broadcastResultConfirmed(currentAthleteId);
  }

  async function handleDispute() {
    setDisputing(true);
    const supabase = createClient();
    await disputeMatchResult(supabase, matchId);
    onNext();
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

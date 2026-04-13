"use client";

import { useEffect, useRef } from "react";
import { Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSessionMatchTimer } from "@/hooks/use-session-match-timer";
import { useSessionMatchSync } from "@/hooks/use-session-match-sync";

interface FighterLiveStepProps {
  onNext: () => void;
  matchId: string;
  durationSeconds: number;
  startedAt: string;
  pausedAt: string | null;
  totalPausedDuration: number;
  matchType: "casual" | "ranked";
  timekeeperEnabled: boolean;
}

export function FighterLiveStep({ onNext, matchId, durationSeconds, startedAt, pausedAt, totalPausedDuration, matchType, timekeeperEnabled }: FighterLiveStepProps) {
  const endedRef = useRef(false);

  const timer = useSessionMatchTimer({ durationSeconds, startedAt, pausedAt, totalPausedDuration });
  const sync = useSessionMatchSync({
    matchId,
    onTimerPaused: (p) => timer.syncFromBroadcast({ type: "paused", pausedAt: p }),
    onTimerResumed: (d) => timer.syncFromBroadcast({ type: "resumed", totalPausedDuration: d }),
    onMatchEnded: () => {
      if (!endedRef.current) {
        endedRef.current = true;
        onNext();
      }
    },
  });

  function handleEnd() {
    if (endedRef.current) return;
    endedRef.current = true;
    sync.broadcastMatchEnded();
    onNext();
  }

  useEffect(() => {
    if (timer.remaining === 0 && timer.running && !endedRef.current) {
      handleEnd();
    }
  }, [timer.remaining, timer.running]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center gap-4 bg-background px-4">
      <p className="text-xs text-muted-foreground uppercase tracking-widest">
        Match in progress
      </p>
      <p className="text-6xl sm:text-7xl font-mono font-bold tabular-nums tracking-tight">
        {timer.formatted}
      </p>
      <Badge variant={matchType === "ranked" ? "default" : "secondary"}>
        {matchType === "ranked" ? "Ranked" : "Casual"}
      </Badge>
      {timer.paused && (
        <p className="text-sm text-amber-500 font-medium">Paused</p>
      )}
      {!timekeeperEnabled && (
        <Button variant="destructive" size="lg" className="w-full max-w-sm mt-6" onClick={handleEnd}>
          <Square className="mr-2 h-4 w-4" />
          End Match
        </Button>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Timer, Play, Square, Swords } from "lucide-react";
import { cn } from "@/lib/utils";
import { MATCH_STATUS, MATCH_TYPE, type MatchType } from "@/lib/constants";

interface LiveMatchClientProps {
  matchId: string;
  matchStatus: string;
  matchType: MatchType;
  durationSeconds: number;
  opponentName: string;
}

function formatTime(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function LiveMatchClient({
  matchId,
  matchStatus,
  matchType,
  durationSeconds,
  opponentName,
}: LiveMatchClientProps) {
  const router = useRouter();
  const [status, setStatus] = useState(matchStatus);
  const [timeRemaining, setTimeRemaining] = useState(durationSeconds);
  const [isRunning, setIsRunning] = useState(
    matchStatus === MATCH_STATUS.IN_PROGRESS,
  );
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Countdown timer
  useEffect(() => {
    if (!isRunning || timeRemaining <= 0) return;

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          setIsRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, timeRemaining]);

  const handleStartMatch = useCallback(async () => {
    setStarting(true);
    setError(null);

    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("start_match", {
      p_match_id: matchId,
    });

    setStarting(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    setStatus(MATCH_STATUS.IN_PROGRESS);
    setIsRunning(true);
  }, [matchId]);

  function handleEndMatch() {
    setIsRunning(false);
    const elapsed = durationSeconds - timeRemaining;
    router.push(`/match/${matchId}/results?elapsed=${elapsed}`);
  }

  const isPending = status === MATCH_STATUS.PENDING;
  const timerFinished = timeRemaining <= 0;

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Opponent */}
      <div className="flex items-center gap-2">
        <Swords className="h-5 w-5 text-primary" />
        <p className="text-lg font-semibold">{opponentName}</p>
      </div>

      {/* Match type */}
      <Badge
        variant={matchType === MATCH_TYPE.RANKED ? "default" : "outline"}
      >
        {matchType === MATCH_TYPE.RANKED ? "Ranked" : "Casual"}
      </Badge>

      {/* Timer */}
      <Card className="w-full">
        <CardContent className="flex flex-col items-center gap-4 py-8">
          <Timer
            className={cn(
              "h-8 w-8",
              isRunning && "text-primary animate-pulse",
              timerFinished && "text-red-500",
            )}
          />
          <div
            className={cn(
              "text-6xl font-mono font-bold tabular-nums tracking-wider",
              timerFinished && "text-red-500",
              isRunning && "text-primary",
            )}
          >
            {formatTime(timeRemaining)}
          </div>
          <p className="text-sm text-muted-foreground">
            {isPending && "Ready to start"}
            {isRunning && "Match in progress"}
            {timerFinished && "Time's up!"}
            {!isPending && !isRunning && !timerFinished && "Match paused"}
          </p>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive text-center">{error}</p>}

      {/* Actions */}
      <div className="flex flex-col gap-3 w-full">
        {isPending && (
          <Button
            size="lg"
            className="w-full gap-2"
            onClick={handleStartMatch}
            disabled={starting}
          >
            <Play className="h-5 w-5" />
            {starting ? "Starting..." : "Start Timer"}
          </Button>
        )}

        {(isRunning || timerFinished) && (
          <Button
            size="lg"
            variant={timerFinished ? "default" : "destructive"}
            className="w-full gap-2"
            onClick={handleEndMatch}
          >
            <Square className="h-5 w-5" />
            {timerFinished ? "Record Result" : "End Match"}
          </Button>
        )}
      </div>
    </div>
  );
}

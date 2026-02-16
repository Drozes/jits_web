"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { startMatch } from "@/lib/api/mutations";
import { useMatchSync } from "@/hooks/use-match-sync";

interface MatchTimerProps {
  matchId: string;
  durationSeconds: number;
  status: string;
  startedAt: string | null;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function MatchTimer({
  matchId,
  durationSeconds,
  status,
  startedAt,
}: MatchTimerProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(status === "in_progress");
  const [remaining, setRemaining] = useState(() => {
    if (status === "in_progress" && startedAt) {
      const elapsed = Math.floor(
        (Date.now() - new Date(startedAt).getTime()) / 1000,
      );
      return Math.max(0, durationSeconds - elapsed);
    }
    return durationSeconds;
  });

  const { broadcastTimerStarted, broadcastMatchEnded } = useMatchSync({
    matchId,
    onTimerStarted: (remoteStartedAt) => {
      const elapsed = Math.floor(
        (Date.now() - new Date(remoteStartedAt).getTime()) / 1000,
      );
      setRemaining(Math.max(0, durationSeconds - elapsed));
      setRunning(true);
    },
    onMatchEnded: () => {
      router.push(`/match/${matchId}/results`);
    },
  });

  const handleEnd = useCallback(() => {
    broadcastMatchEnded();
    router.push(`/match/${matchId}/results`);
  }, [router, matchId, broadcastMatchEnded]);

  useEffect(() => {
    if (!running || remaining <= 0) return;
    const interval = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [running, remaining]);

  useEffect(() => {
    if (running && remaining === 0) handleEnd();
  }, [running, remaining, handleEnd]);

  async function handleStart() {
    if (running) return;
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const result = await startMatch(supabase, matchId);
    if (!result.ok) {
      // If the other athlete already started, the broadcast will have set running
      if (running) return;
      setError(result.error.message);
      setLoading(false);
      return;
    }
    const now = new Date().toISOString();
    broadcastTimerStarted(now);
    setLoading(false);
    setRunning(true);
  }

  return (
    <div className="space-y-8">
      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex flex-col items-center gap-2">
        <p className="text-7xl font-mono font-bold tabular-nums tracking-tight">
          {formatTime(remaining)}
        </p>
        {running && (
          <p className="text-xs text-muted-foreground uppercase tracking-widest">
            Match in progress
          </p>
        )}
      </div>

      {!running ? (
        <Button
          className="w-full"
          size="lg"
          onClick={handleStart}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Play className="mr-2 h-4 w-4" />
          )}
          Start Timer
        </Button>
      ) : (
        <Button
          variant="destructive"
          className="w-full"
          size="lg"
          onClick={handleEnd}
        >
          <Square className="mr-2 h-4 w-4" />
          End Match
        </Button>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSessionMatchTimer } from "@/hooks/use-session-match-timer";
import { useSessionMatchSync } from "@/hooks/use-session-match-sync";
import { cn } from "@/lib/utils";

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

function fireExpirySignals() {
  // Haptic
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.([200, 100, 200]);
    }
  } catch {
    // ignore
  }
  // Audio beep
  try {
    const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 800;
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.4, now + 0.02);
    gain.gain.linearRampToValueAtTime(0, now + 0.3);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.32);
    osc.onended = () => ctx.close().catch(() => {});
  } catch {
    // ignore
  }
}

export function FighterLiveStep({ onNext, matchId, durationSeconds, startedAt, pausedAt, totalPausedDuration, matchType, timekeeperEnabled }: FighterLiveStepProps) {
  const endedRef = useRef(false);
  const hasFiredRef = useRef(false);
  const [expired, setExpired] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const timer = useSessionMatchTimer({ durationSeconds, startedAt, pausedAt, totalPausedDuration });
  const sync = useSessionMatchSync({
    matchId,
    onTimerPaused: (p) => {
      timer.syncFromBroadcast({ type: "paused", pausedAt: p });
      setStatusMessage("Match paused");
    },
    onTimerResumed: (d) => {
      timer.syncFromBroadcast({ type: "resumed", totalPausedDuration: d });
      setStatusMessage("Match resumed");
    },
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
    if (timer.remaining === 0 && timer.running && !hasFiredRef.current) {
      hasFiredRef.current = true;
      fireExpirySignals();
      setExpired(true);
      setStatusMessage("Time expired");
      const endT = setTimeout(() => {
        if (!endedRef.current) handleEnd();
      }, 1000);
      return () => clearTimeout(endT);
    }
  }, [timer.remaining, timer.running]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center gap-4 bg-background px-4">
      <div aria-live="polite" aria-atomic="true" className="sr-only">{statusMessage}</div>
      <p className="text-xs text-muted-foreground uppercase tracking-widest">
        Match in progress
      </p>
      <p className={cn(
        "text-6xl sm:text-7xl font-mono font-bold tabular-nums tracking-tight",
        expired && "animate-timer-expired",
      )}>
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

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { getMatchDetails } from "@jits/shared/api/queries";
import { useSessionMatchTimer } from "@jits/shared/hooks/use-session-match-timer";
import { useSessionMatchSync } from "@jits/shared/hooks/use-session-match-sync";
import { MATCH_EXIT_COPY, exitReasonFor, hasRecordedResult } from "@/lib/match-flow/match-state";
import { cn } from "@/lib/utils";

/** How often the live step re-reads the match in case a broadcast was missed. */
export const LIVE_RECONCILE_MS = 10_000;

interface FighterLiveStepProps {
  onNext: () => void;
  /** Where a cancelled / voided match leaves to (session lobby, or Arena). */
  exitHref: string;
  matchId: string;
  durationSeconds: number;
  startedAt: string;
  pausedAt: string | null;
  totalPausedDuration: number;
  matchType: "casual" | "ranked";
  timekeeperEnabled: boolean;
  hasTimekeeper: boolean;
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

export function FighterLiveStep({ onNext, exitHref, matchId, durationSeconds, startedAt, pausedAt, totalPausedDuration, matchType, timekeeperEnabled, hasTimekeeper }: FighterLiveStepProps) {
  const router = useRouter();
  const endedRef = useRef(false);
  /** Set on unmount so a late re-read cannot advance or navigate. Reset in
   * the effect body: Strict Mode mounts, cleans up and mounts again. */
  const unmountedRef = useRef(false);
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
    };
  }, []);
  const hasFiredRef = useRef(false);
  const [expired, setExpired] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const supabase = useMemo(() => createClient(), []);
  const timer = useSessionMatchTimer({ durationSeconds, startedAt, pausedAt, totalPausedDuration });
  const sync = useSessionMatchSync({
    supabase,
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

  /**
   * The DB is the authority when a pause, resume or end broadcast was missed
   * (a backgrounded tab, a dropped socket): re-apply the pause state, move on
   * once a result is recorded, and leave a cancelled / voided match.
   */
  const reconcile = useCallback(async () => {
    const match = await getMatchDetails(supabase, matchId);
    if (!match || unmountedRef.current || endedRef.current) return;
    const reason = exitReasonFor(match.status);
    if (reason) {
      endedRef.current = true;
      toast.info(MATCH_EXIT_COPY[reason]);
      router.replace(exitHref);
      return;
    }
    if (hasRecordedResult(match.status)) {
      endedRef.current = true;
      onNext();
      return;
    }
    if (match.paused_at) {
      timer.syncFromBroadcast({ type: "paused", pausedAt: match.paused_at });
    } else {
      timer.syncFromBroadcast({ type: "resumed", totalPausedDuration: match.total_paused_duration });
    }
  }, [supabase, matchId, onNext, router, exitHref, timer]);

  // Through a ref so a parent re-render does not restart the interval.
  const reconcileRef = useRef(reconcile);
  reconcileRef.current = reconcile;
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void reconcileRef.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    const id = setInterval(() => void reconcileRef.current(), LIVE_RECONCILE_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(id);
    };
  }, []);

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
        "text-6xl sm:text-7xl font-mono font-bold tabular-nums tracking-tight text-amber-500",
        expired && "animate-timer-expired text-destructive",
      )}>
        {timer.formatted}
      </p>
      <Badge variant={matchType === "ranked" ? "default" : "secondary"}>
        {matchType === "ranked" ? "Ranked" : "Casual"}
      </Badge>
      {timer.paused && (
        <p className="text-sm text-amber-500 font-medium">Paused</p>
      )}
      {(!timekeeperEnabled || !hasTimekeeper) && (
        <Button variant="destructive" size="lg" className="w-full max-w-sm mt-6" onClick={handleEnd}>
          <Square className="mr-2 h-4 w-4" />
          End Match
        </Button>
      )}
    </div>
  );
}

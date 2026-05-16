"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { startMatch } from "@jits/shared/api/mutations";
import { useSessionMatchSync } from "@jits/shared/hooks/use-session-match-sync";

interface ReadyCheckStepProps {
  onNext: (data: { startedAt: string }) => void;
  matchId: string;
  currentAthleteId: string;
  opponentId: string;
  timekeeperEnabled: boolean;
  hasTimekeeper: boolean;
  isTimekeeper: boolean;
}

export function ReadyCheckStep({ onNext, matchId, currentAthleteId, opponentId, timekeeperEnabled, hasTimekeeper, isTimekeeper }: ReadyCheckStepProps) {
  const [myReady, setMyReady] = useState(false);
  const [opponentReady, setOpponentReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const startedRef = useRef(false);

  const supabase = useMemo(() => createClient(), []);
  const sync = useSessionMatchSync({
    supabase,
    matchId,
    onReadySignal: (athleteId) => {
      if (athleteId === opponentId) setOpponentReady(true);
    },
    onTimerStarted: (startedAt) => {
      if (!startedRef.current) {
        startedRef.current = true;
        onNext({ startedAt });
      }
    },
  });

  async function handleBothReady() {
    if (startedRef.current) return;
    // Only block if there's an actual assigned timekeeper and it's not us.
    // When the match has no timekeeper (session 2-fighter flow), either
    // fighter can start; start_match is idempotent so the loser's call
    // returns an error that we swallow, and onTimerStarted from broadcast
    // moves them forward.
    const shouldStart = timekeeperEnabled && hasTimekeeper ? isTimekeeper : true;
    if (!shouldStart) return;

    startedRef.current = true;
    setLoading(true);
    const result = await startMatch(supabase, matchId);
    if (!result.ok) {
      startedRef.current = false;
      setLoading(false);
      return;
    }
    const startedAt = result.data.started_at ?? new Date().toISOString();
    sync.broadcastTimerStarted(startedAt);
    onNext({ startedAt });
  }

  function handleReady() {
    setMyReady(true);
    sync.broadcastReady(currentAthleteId);
  }

  // Trigger start when both are ready
  useEffect(() => {
    if (myReady && opponentReady && !startedRef.current && !loading) {
      handleBothReady();
    }
  }, [myReady, opponentReady]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4">
      <div className="flex flex-col items-center gap-1">
        <h2 className="text-lg font-semibold">Ready Check</h2>
        <p className="text-muted-foreground text-sm">Both athletes must tap Ready to start.</p>
      </div>
      <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
        <ReadyPanel label="You" ready={myReady} />
        <ReadyPanel label="Opponent" ready={opponentReady} />
      </div>
      {!myReady && (
        <Button className="w-full max-w-sm" size="lg" onClick={handleReady}>
          Ready
        </Button>
      )}
      {myReady && !opponentReady && (
        <p className="text-sm text-muted-foreground">Waiting for opponent...</p>
      )}
      {loading && <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />}
    </div>
  );
}

function ReadyPanel({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border p-6">
      {ready ? (
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10">
          <Check className="h-6 w-6 text-green-500" />
        </div>
      ) : (
        <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
      )}
      <p className="text-sm font-medium">{label}</p>
    </div>
  );
}

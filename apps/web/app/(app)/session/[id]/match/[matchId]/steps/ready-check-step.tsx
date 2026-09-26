"use client";

import { useCallback, useMemo, useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cancelSessionMatch, startMatch } from "@jits/shared/api/mutations";
import { getMatchDetails } from "@jits/shared/api/queries";
import { useSessionMatchSync } from "@jits/shared/hooks/use-session-match-sync";
import { MATCH_EXIT_COPY, MATCH_WAIT_POLL_MS, exitReasonFor } from "@/lib/match-flow/match-state";

interface ReadyCheckStepProps {
  onNext: (data: { startedAt: string }) => void;
  /** Where cancelling / opponent-cancel returns to (session lobby, or Arena). */
  exitHref: string;
  matchId: string;
  currentAthleteId: string;
  opponentId: string;
  timekeeperEnabled: boolean;
  hasTimekeeper: boolean;
  isTimekeeper: boolean;
}

export function ReadyCheckStep({ onNext, exitHref, matchId, currentAthleteId, opponentId, timekeeperEnabled, hasTimekeeper, isTimekeeper }: ReadyCheckStepProps) {
  const router = useRouter();
  const [myReady, setMyReady] = useState(false);
  const [opponentReady, setOpponentReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  /** A start_match call is in flight (or won). Guards a second call only. */
  const startedRef = useRef(false);
  /** onNext has fired. Separate from startedRef so timer_started from the
   * opponent still moves us on while our own start call is in flight. */
  const advancedRef = useRef(false);
  const cancelledRef = useRef(false);

  const supabase = useMemo(() => createClient(), []);

  const advance = useCallback((startedAt: string) => {
    if (advancedRef.current || cancelledRef.current) return;
    advancedRef.current = true;
    startedRef.current = true;
    onNext({ startedAt });
  }, [onNext]);

  /** Leave for the exit once: opponent cancel broadcast, or the DB says so. */
  const exitWith = useCallback((message: string) => {
    if (cancelledRef.current || advancedRef.current) return;
    cancelledRef.current = true;
    toast.info(message);
    router.replace(exitHref);
  }, [router, exitHref]);

  const sync = useSessionMatchSync({
    supabase,
    matchId,
    onReadySignal: (athleteId) => {
      if (athleteId === opponentId) setOpponentReady(true);
    },
    onTimerStarted: (startedAt) => advance(startedAt),
    onMatchCancelled: () => {
      // Opponent cancelled: abort and return to the lobby.
      exitWith("Match cancelled. Your opponent left the ready check.");
    },
  });

  /**
   * The DB is the authority when a broadcast was missed: a cancel sent while
   * this athlete was still on weight verify (before this step's channel
   * joined), or a timer_started that never arrived. Mirrors mobile's
   * reconciler. Resolves true when it moved the wizard.
   */
  const reconcile = useCallback(async (): Promise<boolean> => {
    const match = await getMatchDetails(supabase, matchId);
    if (!match) return false;
    const reason = exitReasonFor(match.status);
    if (reason) {
      exitWith(MATCH_EXIT_COPY[reason]);
      return true;
    }
    if (match.status === "in_progress" && match.started_at) {
      advance(match.started_at);
      return true;
    }
    return false;
  }, [supabase, matchId, exitWith, advance]);

  useEffect(() => {
    void reconcile();
    const id = setInterval(() => void reconcile(), MATCH_WAIT_POLL_MS);
    return () => clearInterval(id);
  }, [reconcile]);

  async function handleBothReady() {
    if (startedRef.current || advancedRef.current) return;
    // Only block if there's an actual assigned timekeeper and it's not us.
    // When the match has no timekeeper (session 2-fighter flow), either
    // fighter can start and both usually race to start_match.
    const shouldStart = timekeeperEnabled && hasTimekeeper ? isTimekeeper : true;
    if (!shouldStart) return;

    startedRef.current = true;
    setLoading(true);
    const result = await startMatch(supabase, matchId);
    if (!result.ok) {
      // start_match only succeeds once (pending -> in_progress). Losing the
      // race is NOT an error: check the DB before surfacing one, or a missed
      // timer_started strands this side here while the match runs.
      if (await reconcile()) return;
      if (advancedRef.current || cancelledRef.current) return;
      startedRef.current = false;
      setLoading(false);
      toast.error(result.error.message || "Couldn't start the match.");
      return;
    }
    const startedAt = result.data.started_at ?? new Date().toISOString();
    sync.broadcastTimerStarted(startedAt);
    advance(startedAt);
  }

  function handleReady() {
    setMyReady(true);
    sync.broadcastReady(currentAthleteId);
  }

  async function handleCancel() {
    if (cancelling || loading || startedRef.current || advancedRef.current || cancelledRef.current) return;
    if (!window.confirm("Cancel match? Your opponent will be returned to the lobby.")) return;
    cancelledRef.current = true;
    setCancelling(true);
    const result = await cancelSessionMatch(supabase, matchId);
    if (!result.ok) {
      cancelledRef.current = false;
      setCancelling(false);
      toast.error(result.error.message || "Could not cancel the match.");
      return;
    }
    // Tell the opponent's ready step to abort too, then return to the lobby.
    sync.broadcastMatchCancelled();
    router.replace(exitHref);
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
      {!startedRef.current && !loading && (
        <Button
          variant="ghost"
          size="sm"
          className="text-primary hover:text-primary"
          onClick={handleCancel}
          disabled={cancelling}
        >
          {cancelling ? "Cancelling..." : "Cancel Match"}
        </Button>
      )}
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

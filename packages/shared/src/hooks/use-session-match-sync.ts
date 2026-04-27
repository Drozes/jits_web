import { useEffect, useRef, useCallback } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

export interface BroadcastResult {
  result: "submission" | "draw";
  winnerId?: string;
  submissionCode?: string;
  finishTimeSeconds?: number;
}

interface UseSessionMatchSyncParams {
  supabase: SupabaseClient;
  matchId: string;
  onTimerStarted?: (startedAt: string) => void;
  onTimerPaused?: (pausedAt: string) => void;
  onTimerResumed?: (totalPausedDuration: number) => void;
  onMatchEnded?: () => void;
  onReadySignal?: (athleteId: string) => void;
  onResultSubmitted?: (result: BroadcastResult) => void;
  onResultConfirmed?: (athleteId: string) => void;
}

export function useSessionMatchSync(params: UseSessionMatchSyncParams) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const cbRefs = useRef(params);
  cbRefs.current = params;

  const { supabase, matchId } = params;

  useEffect(() => {
    const channel = supabase
      .channel(`session-match:${matchId}`)
      .on("broadcast", { event: "timer_started" }, ({ payload }) => {
        cbRefs.current.onTimerStarted?.(payload.started_at as string);
      })
      .on("broadcast", { event: "timer_paused" }, ({ payload }) => {
        cbRefs.current.onTimerPaused?.(payload.paused_at as string);
      })
      .on("broadcast", { event: "timer_resumed" }, ({ payload }) => {
        cbRefs.current.onTimerResumed?.(payload.total_paused_duration as number);
      })
      .on("broadcast", { event: "match_ended" }, () => {
        cbRefs.current.onMatchEnded?.();
      })
      .on("broadcast", { event: "ready_signal" }, ({ payload }) => {
        cbRefs.current.onReadySignal?.(payload.athlete_id as string);
      })
      .on("broadcast", { event: "result_submitted" }, ({ payload }) => {
        cbRefs.current.onResultSubmitted?.(payload as BroadcastResult);
      })
      .on("broadcast", { event: "result_confirmed" }, ({ payload }) => {
        cbRefs.current.onResultConfirmed?.(payload.athlete_id as string);
      })
      .subscribe();
    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [supabase, matchId]);

  const send = useCallback((event: string, payload: Record<string, unknown>) => {
    channelRef.current?.send({ type: "broadcast", event, payload });
  }, []);

  return {
    broadcastTimerStarted: useCallback((startedAt: string) => send("timer_started", { started_at: startedAt }), [send]),
    broadcastTimerPaused: useCallback((pausedAt: string) => send("timer_paused", { paused_at: pausedAt }), [send]),
    broadcastTimerResumed: useCallback((d: number) => send("timer_resumed", { total_paused_duration: d }), [send]),
    broadcastMatchEnded: useCallback(() => send("match_ended", {}), [send]),
    broadcastReady: useCallback((athleteId: string) => send("ready_signal", { athlete_id: athleteId }), [send]),
    broadcastResultSubmitted: useCallback((r: BroadcastResult) => send("result_submitted", r as unknown as Record<string, unknown>), [send]),
    broadcastResultConfirmed: useCallback((athleteId: string) => send("result_confirmed", { athlete_id: athleteId }), [send]),
  };
}

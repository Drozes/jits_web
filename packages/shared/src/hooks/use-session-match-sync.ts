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
  onMatchCancelled?: () => void;
}

export function useSessionMatchSync(params: UseSessionMatchSyncParams) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  // Tracks whether the websocket JOIN has completed. Broadcasts fired before
  // this is true would otherwise trip realtime-js's REST fallback warning, so
  // we route them through the explicit httpSend REST path instead.
  const subscribedRef = useRef(false);
  const cbRefs = useRef(params);
  cbRefs.current = params;

  const { supabase, matchId } = params;

  useEffect(() => {
    subscribedRef.current = false;
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
      .on("broadcast", { event: "match_cancelled" }, () => {
        cbRefs.current.onMatchCancelled?.();
      })
      .subscribe((status) => {
        subscribedRef.current = status === "SUBSCRIBED";
      });
    channelRef.current = channel;
    return () => {
      subscribedRef.current = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, matchId]);

  // Use the websocket push once joined; otherwise use the explicit httpSend
  // REST path. Both deliver to subscribers; httpSend avoids the realtime-js
  // "send() falling back to REST" warning that fires when send() is called
  // before JOIN completes.
  const send = useCallback((event: string, payload: Record<string, unknown>) => {
    const channel = channelRef.current;
    if (!channel) return;
    if (subscribedRef.current) {
      channel.send({ type: "broadcast", event, payload });
    } else {
      void channel.httpSend(event, payload);
    }
  }, []);

  return {
    broadcastTimerStarted: useCallback((startedAt: string) => send("timer_started", { started_at: startedAt }), [send]),
    broadcastTimerPaused: useCallback((pausedAt: string) => send("timer_paused", { paused_at: pausedAt }), [send]),
    broadcastTimerResumed: useCallback((d: number) => send("timer_resumed", { total_paused_duration: d }), [send]),
    broadcastMatchEnded: useCallback(() => send("match_ended", {}), [send]),
    broadcastReady: useCallback((athleteId: string) => send("ready_signal", { athlete_id: athleteId }), [send]),
    broadcastResultSubmitted: useCallback((r: BroadcastResult) => send("result_submitted", r as unknown as Record<string, unknown>), [send]),
    broadcastResultConfirmed: useCallback((athleteId: string) => send("result_confirmed", { athlete_id: athleteId }), [send]),
    broadcastMatchCancelled: useCallback(() => send("match_cancelled", {}), [send]),
  };
}

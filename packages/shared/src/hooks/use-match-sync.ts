import { useEffect, useRef, useCallback } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

interface UseMatchSyncOpts {
  supabase: SupabaseClient;
  matchId: string;
  onTimerStarted?: (startedAt: string) => void;
  onMatchEnded?: () => void;
  onResultRecorded?: () => void;
}

/**
 * Broadcast channel for match coordination between two athletes.
 * Both athletes join `match:{matchId}` on the live/results pages.
 * Events: timer_started, match_ended, result_recorded.
 */
export function useMatchSync({
  supabase,
  matchId,
  onTimerStarted,
  onMatchEnded,
  onResultRecorded,
}: UseMatchSyncOpts) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  // True once the websocket JOIN completes. Until then, fire-and-forget
  // broadcasts go through httpSend (REST) to avoid realtime-js's
  // "send() falling back to REST" warning.
  const subscribedRef = useRef(false);
  const onTimerStartedRef = useRef(onTimerStarted);
  onTimerStartedRef.current = onTimerStarted;
  const onMatchEndedRef = useRef(onMatchEnded);
  onMatchEndedRef.current = onMatchEnded;
  const onResultRecordedRef = useRef(onResultRecorded);
  onResultRecordedRef.current = onResultRecorded;

  useEffect(() => {
    subscribedRef.current = false;
    const channel = supabase
      .channel(`match:${matchId}`)
      .on("broadcast", { event: "timer_started" }, ({ payload }) => {
        const startedAt = payload?.started_at as string | undefined;
        if (startedAt) onTimerStartedRef.current?.(startedAt);
      })
      .on("broadcast", { event: "match_ended" }, () => {
        onMatchEndedRef.current?.();
      })
      .on("broadcast", { event: "result_recorded" }, () => {
        onResultRecordedRef.current?.();
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

  const send = useCallback((event: string, payload: Record<string, unknown>) => {
    const channel = channelRef.current;
    if (!channel) return;
    if (subscribedRef.current) {
      channel.send({ type: "broadcast", event, payload });
    } else {
      void channel.httpSend(event, payload);
    }
  }, []);

  const broadcastTimerStarted = useCallback(
    (startedAt: string) => send("timer_started", { started_at: startedAt }),
    [send],
  );

  const broadcastMatchEnded = useCallback(() => send("match_ended", {}), [send]);

  const broadcastResultRecorded = useCallback(() => send("result_recorded", {}), [send]);

  return { broadcastTimerStarted, broadcastMatchEnded, broadcastResultRecorded };
}

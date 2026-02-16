"use client";

import { useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface UseMatchSyncOpts {
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
  matchId,
  onTimerStarted,
  onMatchEnded,
  onResultRecorded,
}: UseMatchSyncOpts) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const onTimerStartedRef = useRef(onTimerStarted);
  onTimerStartedRef.current = onTimerStarted;
  const onMatchEndedRef = useRef(onMatchEnded);
  onMatchEndedRef.current = onMatchEnded;
  const onResultRecordedRef = useRef(onResultRecorded);
  onResultRecordedRef.current = onResultRecorded;

  useEffect(() => {
    const supabase = createClient();

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
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId]);

  const broadcastTimerStarted = useCallback((startedAt: string) => {
    channelRef.current?.send({
      type: "broadcast",
      event: "timer_started",
      payload: { started_at: startedAt },
    });
  }, []);

  const broadcastMatchEnded = useCallback(() => {
    channelRef.current?.send({
      type: "broadcast",
      event: "match_ended",
      payload: {},
    });
  }, []);

  const broadcastResultRecorded = useCallback(() => {
    channelRef.current?.send({
      type: "broadcast",
      event: "result_recorded",
      payload: {},
    });
  }, []);

  return { broadcastTimerStarted, broadcastMatchEnded, broadcastResultRecorded };
}

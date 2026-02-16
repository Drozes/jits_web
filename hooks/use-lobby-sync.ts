"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface UseLobbySyncOpts {
  challengeId: string;
  onCancelled?: () => void;
}

/**
 * Broadcast channel for lobby coordination between two athletes.
 * Both athletes join `lobby:{challengeId}` when they enter the lobby.
 * Events: match_started (with match_id), lobby_cancelled.
 */
export function useLobbySync({ challengeId, onCancelled }: UseLobbySyncOpts) {
  const router = useRouter();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const onCancelledRef = useRef(onCancelled);
  onCancelledRef.current = onCancelled;

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`lobby:${challengeId}`)
      .on("broadcast", { event: "match_started" }, ({ payload }) => {
        const matchId = payload?.match_id as string | undefined;
        if (matchId) {
          router.push(`/match/${matchId}/live`);
        }
      })
      .on("broadcast", { event: "lobby_cancelled" }, () => {
        onCancelledRef.current?.();
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [challengeId, router]);

  const broadcastMatchStarted = useCallback((matchId: string) => {
    channelRef.current?.send({
      type: "broadcast",
      event: "match_started",
      payload: { match_id: matchId },
    });
  }, []);

  const broadcastCancelled = useCallback(() => {
    channelRef.current?.send({
      type: "broadcast",
      event: "lobby_cancelled",
      payload: {},
    });
  }, []);

  return { broadcastMatchStarted, broadcastCancelled };
}

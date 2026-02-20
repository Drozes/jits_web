"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface UseLobbySyncOpts {
  challengeId: string;
  currentAthleteId: string;
  opponentId: string;
  onCancelled?: () => void;
  onAccepted?: () => void;
}

/**
 * Broadcast + presence channel for lobby coordination between two athletes.
 * Both athletes join `lobby:{challengeId}` when they enter the lobby.
 * Broadcasts: match_started, lobby_cancelled, challenge_accepted.
 * Presence: tracks which athletes are in the lobby room.
 */
export function useLobbySync({
  challengeId,
  currentAthleteId,
  opponentId,
  onCancelled,
  onAccepted,
}: UseLobbySyncOpts) {
  const router = useRouter();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const onCancelledRef = useRef(onCancelled);
  onCancelledRef.current = onCancelled;
  const onAcceptedRef = useRef(onAccepted);
  onAcceptedRef.current = onAccepted;
  const [opponentPresent, setOpponentPresent] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    function checkForOpponent(presenceState: Record<string, unknown[]>) {
      const allPresences = Object.values(presenceState).flat() as { athlete_id?: string }[];
      setOpponentPresent(allPresences.some((p) => p.athlete_id === opponentId));
    }

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
      .on("broadcast", { event: "challenge_accepted" }, () => {
        onAcceptedRef.current?.();
      })
      .on("presence", { event: "sync" }, () => {
        checkForOpponent(channel.presenceState());
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ athlete_id: currentAthleteId });
        }
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [challengeId, currentAthleteId, opponentId, router]);

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

  const broadcastAccepted = useCallback(() => {
    channelRef.current?.send({
      type: "broadcast",
      event: "challenge_accepted",
      payload: {},
    });
  }, []);

  return { broadcastMatchStarted, broadcastCancelled, broadcastAccepted, opponentPresent };
}

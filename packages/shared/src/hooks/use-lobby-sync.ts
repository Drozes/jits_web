import { useEffect, useRef, useCallback, useState } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

interface UseLobbySyncOpts {
  supabase: SupabaseClient;
  challengeId: string;
  currentAthleteId: string;
  opponentId: string;
  /**
   * Called when the opponent broadcasts that the match has started.
   * Web should `router.push(/match/{matchId}/live)`; mobile should
   * navigate to its match screen.
   */
  onMatchStarted?: (matchId: string) => void;
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
  supabase,
  challengeId,
  currentAthleteId,
  opponentId,
  onMatchStarted,
  onCancelled,
  onAccepted,
}: UseLobbySyncOpts) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  // True once the websocket JOIN completes. Until then, fire-and-forget
  // broadcasts go through httpSend (REST) to avoid realtime-js's
  // "send() falling back to REST" warning.
  const subscribedRef = useRef(false);
  const onMatchStartedRef = useRef(onMatchStarted);
  onMatchStartedRef.current = onMatchStarted;
  const onCancelledRef = useRef(onCancelled);
  onCancelledRef.current = onCancelled;
  const onAcceptedRef = useRef(onAccepted);
  onAcceptedRef.current = onAccepted;
  const [opponentPresent, setOpponentPresent] = useState(false);

  useEffect(() => {
    subscribedRef.current = false;
    function checkForOpponent(presenceState: Record<string, unknown[]>) {
      const allPresences = Object.values(presenceState).flat() as { athlete_id?: string }[];
      setOpponentPresent(allPresences.some((p) => p.athlete_id === opponentId));
    }

    const channel = supabase
      .channel(`lobby:${challengeId}`)
      .on("broadcast", { event: "match_started" }, ({ payload }) => {
        const matchId = payload?.match_id as string | undefined;
        if (matchId) {
          onMatchStartedRef.current?.(matchId);
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
        subscribedRef.current = status === "SUBSCRIBED";
        if (status === "SUBSCRIBED") {
          await channel.track({ athlete_id: currentAthleteId });
        }
      });

    channelRef.current = channel;

    return () => {
      subscribedRef.current = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, challengeId, currentAthleteId, opponentId]);

  const send = useCallback((event: string, payload: Record<string, unknown>) => {
    const channel = channelRef.current;
    if (!channel) return;
    if (subscribedRef.current) {
      channel.send({ type: "broadcast", event, payload });
    } else {
      void channel.httpSend(event, payload);
    }
  }, []);

  const broadcastMatchStarted = useCallback(
    (matchId: string) => send("match_started", { match_id: matchId }),
    [send],
  );

  const broadcastCancelled = useCallback(() => send("lobby_cancelled", {}), [send]);

  const broadcastAccepted = useCallback(() => send("challenge_accepted", {}), [send]);

  return { broadcastMatchStarted, broadcastCancelled, broadcastAccepted, opponentPresent };
}

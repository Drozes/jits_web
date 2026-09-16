"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import {
  acceptChallenge,
  cancelChallenge,
  createChallenge,
  declineChallenge,
  startMatchFromChallenge,
} from "@jits/shared/api/mutations";

export interface IncomingChallenge {
  challengeId: string;
  challengerId: string;
  challengerName: string;
}

export interface OutgoingChallenge {
  challengeId: string;
  opponentId: string;
  opponentName: string;
}

/** Broadcast channel shared by both parties to a single Arena challenge. */
const channelName = (challengeId: string) => `arena-challenge:${challengeId}`;

/**
 * Instant Arena handshake.
 *
 * Challenge -> live prompt -> accept -> straight into the match wizard, with no
 * inbox round trip. The challenge row still exists (chk_match_origin requires
 * either a challenge_id or a session_id, and Arena matches have no session), it
 * is just never left sitting in a list.
 *
 * Two realtime surfaces:
 *  - postgres_changes INSERT on `challenges` filtered to me as opponent, which
 *    is what raises the incoming prompt.
 *  - a per-challenge broadcast channel, which is how the accepting side tells
 *    the challenger the match exists so both navigate together.
 */
export function useArenaChallenge({
  athleteId,
  athleteWeight,
}: {
  athleteId: string;
  athleteWeight: number | null;
}) {
  const router = useRouter();
  const [incoming, setIncoming] = useState<IncomingChallenge | null>(null);
  const [outgoing, setOutgoing] = useState<OutgoingChallenge | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const busyRef = useRef(false);
  const outgoingChannelRef = useRef<RealtimeChannel | null>(null);

  /** Navigate both parties into the shared wizard. */
  const enterMatch = useCallback(
    (matchId: string) => {
      setIncoming(null);
      setOutgoing(null);
      router.push(`/arena/match/${matchId}`);
    },
    [router],
  );

  // --- Incoming: someone challenged me -------------------------------------
  useEffect(() => {
    if (!athleteId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`arena-incoming:${athleteId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "challenges",
          filter: `opponent_id=eq.${athleteId}`,
        },
        async (payload) => {
          const row = payload.new as {
            id: string;
            challenger_id: string;
            status: string;
          };
          if (row.status !== "pending") return;

          const { data: challenger } = await supabase
            .from("athletes")
            .select("display_name")
            .eq("id", row.challenger_id)
            .single();

          setIncoming({
            challengeId: row.id,
            challengerId: row.challenger_id,
            challengerName: challenger?.display_name ?? "An athlete",
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [athleteId]);

  // --- Outgoing: wait for my challenge to be accepted -----------------------
  useEffect(() => {
    if (!outgoing) return;
    const supabase = createClient();
    const channel = supabase
      .channel(channelName(outgoing.challengeId))
      .on("broadcast", { event: "match_started" }, ({ payload }) => {
        const matchId = (payload as { matchId?: string })?.matchId;
        if (matchId) enterMatch(matchId);
      })
      .on("broadcast", { event: "declined" }, () => {
        setOutgoing(null);
        toast.info(`${outgoing.opponentName} declined.`);
      })
      .subscribe();

    outgoingChannelRef.current = channel;
    return () => {
      outgoingChannelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [outgoing, enterMatch]);

  /** Guard every mutation against double-taps; a ref, because state is async. */
  const runExclusive = useCallback(async (fn: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setIsBusy(true);
    try {
      await fn();
    } finally {
      busyRef.current = false;
      setIsBusy(false);
    }
  }, []);

  const sendChallenge = useCallback(
    (opponentId: string, opponentName: string) =>
      runExclusive(async () => {
        const supabase = createClient();
        const result = await createChallenge(supabase, {
          opponentId,
          matchType: "ranked", // ranked-only product
          challengerWeight: athleteWeight ?? undefined,
        });
        if (!result.ok) {
          toast.error(result.error.message || "Couldn't send that challenge.");
          return;
        }
        setOutgoing({ challengeId: result.data.id, opponentId, opponentName });
      }),
    [athleteWeight, runExclusive],
  );

  const accept = useCallback(
    () =>
      runExclusive(async () => {
        if (!incoming) return;
        const supabase = createClient();

        const accepted = await acceptChallenge(supabase, {
          challengeId: incoming.challengeId,
          opponentWeight: athleteWeight ?? undefined,
        });
        if (!accepted.ok) {
          toast.error(accepted.error.message || "Couldn't accept that challenge.");
          setIncoming(null);
          return;
        }

        const started = await startMatchFromChallenge(
          supabase,
          incoming.challengeId,
        );
        if (!started.ok) {
          toast.error(started.error.message || "Couldn't start the match.");
          return;
        }

        // Tell the challenger before navigating, so both land together.
        await supabase
          .channel(channelName(incoming.challengeId))
          .send({
            type: "broadcast",
            event: "match_started",
            payload: { matchId: started.data.match_id },
          });

        enterMatch(started.data.match_id);
      }),
    [incoming, athleteWeight, runExclusive, enterMatch],
  );

  const decline = useCallback(
    () =>
      runExclusive(async () => {
        if (!incoming) return;
        const supabase = createClient();
        await declineChallenge(supabase, incoming.challengeId);
        await supabase
          .channel(channelName(incoming.challengeId))
          .send({ type: "broadcast", event: "declined", payload: {} });
        setIncoming(null);
      }),
    [incoming, runExclusive],
  );

  const cancelOutgoing = useCallback(
    () =>
      runExclusive(async () => {
        if (!outgoing) return;
        const supabase = createClient();
        await cancelChallenge(supabase, outgoing.challengeId);
        setOutgoing(null);
      }),
    [outgoing, runExclusive],
  );

  return {
    incoming,
    outgoing,
    isBusy,
    sendChallenge,
    accept,
    decline,
    cancelOutgoing,
  };
}

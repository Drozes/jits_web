"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import {
  acceptChallenge,
  cancelChallenge,
  cancelStaleOutgoingChallenges,
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

/** Shown when the challenge was cancelled or expired under the accepter. */
export const CHALLENGE_GONE_MESSAGE = "That challenge is no longer available.";

/** Shown when the pending cap still refuses after stale ones were withdrawn. */
export const CHALLENGE_CAP_MESSAGE =
  "You have 3 challenges out. Unanswered challenges clear automatically after 10 minutes, so try again shortly.";

/** Broadcast channel shared by both parties to a single Arena challenge. */
const channelName = (challengeId: string) => `arena-challenge:${challengeId}`;

type ChallengeEvent = "match_started" | "declined" | "cancelled";

/**
 * Tell the other side something happened. Sends on `existing` when this client
 * already holds the challenge's channel (supabase-js hands back the same
 * channel for the same topic, so creating and removing one would tear down our
 * own listener); otherwise opens a throwaway channel and removes it after.
 */
async function broadcast(
  existing: RealtimeChannel | null,
  challengeId: string,
  event: ChallengeEvent,
  payload: Record<string, unknown> = {},
): Promise<void> {
  if (existing) {
    await existing.send({ type: "broadcast", event, payload });
    return;
  }
  const supabase = createClient();
  const channel = supabase.channel(channelName(challengeId));
  await channel.send({ type: "broadcast", event, payload });
  await supabase.removeChannel(channel);
}

/**
 * Instant Arena handshake.
 *
 * Challenge -> live prompt -> accept -> straight into the match wizard, with no
 * inbox round trip. The challenge row still exists (chk_match_origin requires
 * either a challenge_id or a session_id, and Arena matches have no session), it
 * is just never left sitting in a list.
 *
 * Realtime surfaces:
 *  - postgres_changes INSERT on `challenges` filtered to me as opponent, which
 *    raises the incoming prompt, but ONLY while `canReceive` (the athlete is
 *    live and not in a match). There is no column that marks a challenge as
 *    Arena-originated (the profile ChallengeSheet inserts an identical row),
 *    so live-ness is the gate: a non-live athlete's challenges are left for
 *    the regular challenge flow instead of hijacking them into the Arena.
 *  - postgres_changes UPDATE on the same filter, which dismisses a prompt once
 *    its row stops being pending (cancelled, expired, answered elsewhere).
 *  - postgres_changes UPDATE filtered to me as challenger, which resolves my
 *    "Waiting for X" without any broadcast (mirrors mobile): declined,
 *    cancelled or expired clears it; "started" (the match already exists)
 *    enters it via the idempotent start_match_from_challenge. "accepted" is
 *    deliberately ignored: the accepter is creating the match at that moment,
 *    and racing it from this side is how two clients fight over one row. The
 *    match_started broadcast is the normal path; "started" is the fallback.
 *  - a per-challenge broadcast channel: the accepting side tells the
 *    challenger the match exists, the challenger's cancel tells the recipient.
 */
export function useArenaChallenge({
  athleteId,
  athleteWeight,
  canReceive = true,
}: {
  athleteId: string;
  athleteWeight: number | null;
  canReceive?: boolean;
}) {
  const router = useRouter();
  const [incoming, setIncomingState] = useState<IncomingChallenge | null>(null);
  const [outgoing, setOutgoingState] = useState<OutgoingChallenge | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const busyRef = useRef(false);
  const outgoingChannelRef = useRef<RealtimeChannel | null>(null);
  const incomingChannelRef = useRef<RealtimeChannel | null>(null);
  const canReceiveRef = useRef(canReceive);
  canReceiveRef.current = canReceive;
  // Mirrors of state for realtime handlers, which must not read stale closures.
  const incomingRef = useRef<IncomingChallenge | null>(null);
  const outgoingRef = useRef<OutgoingChallenge | null>(null);
  /** The challenge being accepted right now; its own UPDATE must not clear it. */
  const acceptingIdRef = useRef<string | null>(null);
  /** Last challenge we navigated for: broadcast and UPDATE can both land. */
  const enteredForRef = useRef<string | null>(null);

  const setIncoming = useCallback((next: IncomingChallenge | null) => {
    incomingRef.current = next;
    setIncomingState(next);
  }, []);
  const setOutgoing = useCallback((next: OutgoingChallenge | null) => {
    outgoingRef.current = next;
    setOutgoingState(next);
  }, []);

  // Going offline or into a match drops an unanswered prompt (the row stays
  // pending for the regular flow; it is not declined on the athlete's behalf).
  useEffect(() => {
    if (!canReceive) setIncoming(null);
  }, [canReceive, setIncoming]);

  /**
   * Withdraw my own outgoing challenges older than the Arena freshness window
   * (jits-celf, mirrors mobile). Nobody answers them live, but each one holds
   * a slot of the 3-pending cap until `expires_at`, 7 days out. The one on my
   * waiting bar is kept. Resolves to how many were withdrawn.
   */
  const sweepStale = useCallback(async (): Promise<number> => {
    if (!athleteId) return 0;
    const swept = await cancelStaleOutgoingChallenges(createClient(), athleteId, {
      keepChallengeId: outgoingRef.current?.challengeId ?? null,
    });
    if (!swept.ok || swept.data.cancelled.length === 0) return 0;
    // The Arena roster marks already-challenged athletes from a server read.
    router.refresh();
    return swept.data.cancelled.length;
  }, [athleteId, router]);

  // On mount, on going live / leaving a match, and when the tab comes back.
  const sweepRef = useRef(sweepStale);
  sweepRef.current = sweepStale;
  useEffect(() => {
    void sweepRef.current();
  }, [athleteId, canReceive]);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void sweepRef.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  /** Navigate both parties into the shared wizard, once per challenge. */
  const enterMatch = useCallback(
    (challengeId: string, matchId: string) => {
      if (enteredForRef.current === challengeId) return;
      enteredForRef.current = challengeId;
      // Accepting someone else's challenge abandons my own pending one:
      // withdraw it so its opponent is not left with a dead prompt.
      const dropped = outgoingRef.current;
      if (dropped && dropped.challengeId !== challengeId) {
        void (async () => {
          const res = await cancelChallenge(createClient(), dropped.challengeId);
          if (res.ok) await broadcast(null, dropped.challengeId, "cancelled");
        })();
      }
      setIncoming(null);
      setOutgoing(null);
      router.push(`/arena/match/${matchId}`);
    },
    [router, setIncoming, setOutgoing],
  );

  /** Clear my outgoing challenge if it is still `challengeId`. */
  const resolveOutgoing = useCallback(
    (challengeId: string, declined: boolean) => {
      const mine = outgoingRef.current;
      if (mine?.challengeId !== challengeId) return;
      setOutgoing(null);
      if (declined) toast.info(`${mine.opponentName} declined.`);
    },
    [setOutgoing],
  );

  // --- Realtime: challenges involving me ------------------------------------
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
          if (row.status !== "pending" || !canReceiveRef.current) return;
          // The first open prompt keeps the surface rather than being
          // replaced mid-decision.
          if (incomingRef.current) return;

          const { data: challenger } = await supabase
            .from("athletes")
            .select("display_name")
            .eq("id", row.challenger_id)
            .single();
          // Re-checked: offline, or another prompt, may have landed meanwhile.
          if (!canReceiveRef.current || incomingRef.current) return;

          setIncoming({
            challengeId: row.id,
            challengerId: row.challenger_id,
            challengerName: challenger?.display_name ?? "An athlete",
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "challenges",
          filter: `opponent_id=eq.${athleteId}`,
        },
        (payload) => {
          const row = payload.new as { id: string; status: string };
          if (row.status === "pending") return;
          // My own accept flips the row to accepted before the match exists.
          if (acceptingIdRef.current === row.id) return;
          if (incomingRef.current?.challengeId === row.id) setIncoming(null);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "challenges",
          filter: `challenger_id=eq.${athleteId}`,
        },
        async (payload) => {
          const row = payload.new as { id: string; status: string };
          if (outgoingRef.current?.challengeId !== row.id) return;
          if (["declined", "cancelled", "expired"].includes(row.status)) {
            resolveOutgoing(row.id, row.status === "declined");
            return;
          }
          // Fallback when the match_started broadcast never arrived. Only
          // "started": on "accepted" the match may not exist yet.
          if (row.status === "started") {
            const started = await startMatchFromChallenge(supabase, row.id);
            if (started.ok) enterMatch(row.id, started.data.match_id);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [athleteId, enterMatch, resolveOutgoing, setIncoming]);

  // --- Incoming: the challenger may withdraw -------------------------------
  const incomingId = incoming?.challengeId;
  useEffect(() => {
    if (!incomingId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(channelName(incomingId))
      .on("broadcast", { event: "cancelled" }, () => {
        if (acceptingIdRef.current === incomingId) return;
        if (incomingRef.current?.challengeId === incomingId) setIncoming(null);
      })
      .subscribe();
    incomingChannelRef.current = channel;
    return () => {
      incomingChannelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [incomingId, setIncoming]);

  // --- Outgoing: wait for my challenge to be accepted -----------------------
  const outgoingId = outgoing?.challengeId;
  useEffect(() => {
    if (!outgoingId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(channelName(outgoingId))
      .on("broadcast", { event: "match_started" }, ({ payload }) => {
        const matchId = (payload as { matchId?: string })?.matchId;
        if (matchId) enterMatch(outgoingId, matchId);
      })
      .on("broadcast", { event: "declined" }, () => {
        resolveOutgoing(outgoingId, true);
      })
      .subscribe();

    outgoingChannelRef.current = channel;
    return () => {
      outgoingChannelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [outgoingId, enterMatch, resolveOutgoing]);

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
        const create = () =>
          createChallenge(supabase, {
            opponentId,
            matchType: "ranked", // ranked-only product
            challengerWeight: athleteWeight ?? undefined,
          });
        let result = await create();
        // The cap may be held by my own stale challenges: withdraw them and
        // try exactly once more (jits-celf).
        if (
          !result.ok &&
          result.error.code === "MAX_PENDING_CHALLENGES" &&
          (await sweepStale()) > 0
        ) {
          result = await create();
        }
        if (!result.ok) {
          toast.error(
            result.error.code === "MAX_PENDING_CHALLENGES"
              ? CHALLENGE_CAP_MESSAGE
              : result.error.message || "Couldn't send that challenge.",
          );
          return;
        }
        setOutgoing({ challengeId: result.data.id, opponentId, opponentName });
      }),
    [athleteWeight, runExclusive, setOutgoing, sweepStale],
  );

  const accept = useCallback(
    () =>
      runExclusive(async () => {
        const current = incomingRef.current;
        if (!current) return;
        const supabase = createClient();
        acceptingIdRef.current = current.challengeId;
        try {
          const accepted = await acceptChallenge(supabase, {
            challengeId: current.challengeId,
            opponentWeight: athleteWeight ?? undefined,
          });
          if (!accepted.ok) {
            toast.error(
              accepted.error.code === "CHALLENGE_NOT_ACCEPTED"
                ? CHALLENGE_GONE_MESSAGE
                : accepted.error.message || "Couldn't accept that challenge.",
            );
            setIncoming(null);
            return;
          }

          // acceptChallenge filters on status = 'pending' and a no-row update
          // is not an error, so a withdrawn challenge surfaces here as
          // not_accepted. Any other failure is retried once: the RPC is
          // idempotent and returns the existing match if one was created.
          let started = await startMatchFromChallenge(
            supabase,
            current.challengeId,
          );
          if (!started.ok && started.error.code !== "CHALLENGE_NOT_ACCEPTED") {
            started = await startMatchFromChallenge(supabase, current.challengeId);
          }
          if (!started.ok) {
            toast.error(
              started.error.code === "CHALLENGE_NOT_ACCEPTED"
                ? CHALLENGE_GONE_MESSAGE
                : started.error.message || "Couldn't start the match.",
            );
            setIncoming(null);
            return;
          }

          // Tell the challenger before navigating, so both land together.
          await broadcast(
            incomingChannelRef.current,
            current.challengeId,
            "match_started",
            { matchId: started.data.match_id },
          );

          enterMatch(current.challengeId, started.data.match_id);
        } finally {
          acceptingIdRef.current = null;
        }
      }),
    [athleteWeight, runExclusive, enterMatch, setIncoming],
  );

  const decline = useCallback(
    () =>
      runExclusive(async () => {
        const current = incomingRef.current;
        if (!current) return;
        const supabase = createClient();
        const result = await declineChallenge(supabase, current.challengeId);
        if (!result.ok) {
          // Keep the prompt: it is still pending and the challenger waiting.
          toast.error("Couldn't decline that challenge. Try again.");
          return;
        }
        await broadcast(
          incomingChannelRef.current,
          current.challengeId,
          "declined",
        );
        setIncoming(null);
      }),
    [runExclusive, setIncoming],
  );

  const cancelOutgoing = useCallback(
    () =>
      runExclusive(async () => {
        const current = outgoingRef.current;
        if (!current) return;
        const supabase = createClient();
        const result = await cancelChallenge(supabase, current.challengeId);
        if (!result.ok) {
          // Keep the bar: the challenge is still live server-side.
          toast.error("Couldn't cancel that challenge. Try again.");
          return;
        }
        await broadcast(
          outgoingChannelRef.current,
          current.challengeId,
          "cancelled",
        );
        setOutgoing(null);
      }),
    [runExclusive, setOutgoing],
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

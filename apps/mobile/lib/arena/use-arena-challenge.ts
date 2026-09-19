/**
 * The Arena handshake: challenge, live prompt, accept, straight into the match.
 *
 * Ported from `apps/web/hooks/use-arena-challenge.ts`. There is NO inbox. The
 * challenge row still exists (`chk_match_origin` requires a challenge_id or a
 * session_id, and an Arena match has no session), it is just never left
 * sitting in a list. A prompt nobody saw falls back to the notification bell,
 * which mobile already renders.
 *
 * Three realtime surfaces:
 *  - `postgres_changes` INSERT on `challenges` where I am the opponent: raises
 *    the incoming prompt.
 *  - `postgres_changes` UPDATE on the same table, both directions: dismisses a
 *    prompt the challenger cancelled, and recovers a challenger whose
 *    broadcast went missing.
 *  - a per-challenge broadcast channel: how the accepting side tells the
 *    challenger the match exists so both navigate together.
 */
import * as React from "react";
import { useRouter } from "expo-router";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  acceptChallenge,
  cancelChallenge,
  createChallenge,
  declineChallenge,
  startMatchFromChallenge,
} from "@jits/shared/api/mutations";
import type { Result } from "@jits/shared/api/errors";
import type { StartMatchResponse } from "@jits/shared/types/composites";
import { toast } from "@/components/ui/toast";
import { supabase } from "../supabase/client";
import { arenaMatchHref, challengeTopic, incomingTopic } from "./constants";

export interface IncomingChallenge {
  challengeId: string;
  challengerId: string;
  challengerName: string;
  challengerElo: number | null;
  challengerWeight: number | null;
}

export interface OutgoingChallenge {
  challengeId: string;
  opponentId: string;
  opponentName: string;
}

interface ChallengeRow {
  id: string;
  challenger_id: string;
  opponent_id: string;
  status: string;
  expires_at?: string | null;
}

export interface UseArenaChallengeArgs {
  athleteId: string;
  athleteWeight: number | null;
}

export interface UseArenaChallengeResult {
  incoming: IncomingChallenge | null;
  outgoing: OutgoingChallenge | null;
  isBusy: boolean;
  /**
   * True once the database has refused an insert for the pending-challenge
   * cap. Not a toast: it is a standing condition that survives until a slot
   * frees up, and the roster has to stop offering an action that cannot work.
   */
  capReached: boolean;
  sendChallenge: (opponentId: string, opponentName: string) => Promise<void>;
  accept: () => Promise<void>;
  decline: () => Promise<void>;
  cancelOutgoing: () => Promise<void>;
  clearCap: () => void;
}

/**
 * `start_match_from_challenge` returns the existing match when one is already
 * there, so the only way it can fail on a race is the `matches.challenge_id`
 * UNIQUE constraint firing between its existence check and its insert. The
 * loser of that race retries once and takes the winner's row. Both parties
 * therefore converge on one match even when both call it.
 */
async function startMatchWithRetry(
  challengeId: string,
): Promise<Result<StartMatchResponse>> {
  const first = await startMatchFromChallenge(supabase, challengeId);
  if (first.ok || first.error.code !== "MATCH_ALREADY_EXISTS") return first;
  return startMatchFromChallenge(supabase, challengeId);
}

/**
 * Tell the other side the match exists.
 *
 * `send()` on a channel this client never joined falls back to a REST POST and
 * resolves to "ok" / "error" / "timed out". It does not reject, so success is
 * read off the returned status, never off a rejection. One retry, because a
 * lost broadcast strands the challenger on the waiting plate.
 */
async function broadcast(
  challengeId: string,
  event: "match_started" | "declined",
  payload: Record<string, unknown>,
): Promise<boolean> {
  const channel = supabase.channel(challengeTopic(challengeId));
  let status = await channel.send({ type: "broadcast", event, payload });
  if (status !== "ok") {
    status = await channel.send({ type: "broadcast", event, payload });
  }
  await supabase.removeChannel(channel);
  return status === "ok";
}

export function useArenaChallenge({
  athleteId,
  athleteWeight,
}: UseArenaChallengeArgs): UseArenaChallengeResult {
  const router = useRouter();
  const [incoming, setIncoming] = React.useState<IncomingChallenge | null>(null);
  const [outgoing, setOutgoing] = React.useState<OutgoingChallenge | null>(null);
  const [isBusy, setIsBusy] = React.useState(false);
  const [capReached, setCapReached] = React.useState(false);

  // Synchronous: `isBusy` is still false for the whole await window below, so
  // only a ref closes the double-tap window.
  const busyRef = React.useRef(false);
  const incomingRef = React.useRef<IncomingChallenge | null>(null);
  const outgoingRef = React.useRef<OutgoingChallenge | null>(null);
  const weightRef = React.useRef(athleteWeight);
  weightRef.current = athleteWeight;
  // A match_started broadcast and the accepted-status fallback can both land.
  // Whichever is first wins; the other must not push a second screen.
  const enteredRef = React.useRef(false);

  const setIncomingBoth = React.useCallback(
    (next: IncomingChallenge | null) => {
      incomingRef.current = next;
      setIncoming(next);
    },
    [],
  );
  const setOutgoingBoth = React.useCallback(
    (next: OutgoingChallenge | null) => {
      outgoingRef.current = next;
      setOutgoing(next);
    },
    [],
  );

  const enterMatch = React.useCallback(
    (matchId: string) => {
      if (enteredRef.current) return;
      enteredRef.current = true;
      setIncomingBoth(null);
      setOutgoingBoth(null);
      router.push(arenaMatchHref(matchId));
    },
    [router, setIncomingBoth, setOutgoingBoth],
  );

  // --- Realtime: challenges involving me ------------------------------------
  React.useEffect(() => {
    if (!athleteId) return;

    // Per-instance suffix, see `incomingTopic`. Without it an overlapping
    // remount gets handed the previous, already-subscribed channel and
    // `.on("postgres_changes", ...)` throws on it.
    const instanceId = Math.random().toString(36).slice(2, 10);
    const channel = supabase
      .channel(incomingTopic(athleteId, instanceId))
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "challenges",
          filter: `opponent_id=eq.${athleteId}`,
        },
        async (payload) => {
          const row = payload.new as ChallengeRow;
          if (row.status !== "pending") return;
          if (row.expires_at && new Date(row.expires_at) <= new Date()) return;
          // Already showing a prompt: the first one keeps the surface rather
          // than being silently replaced mid-decision.
          if (incomingRef.current) return;

          const { data } = await supabase
            .from("athletes")
            .select("display_name, current_elo, current_weight")
            .eq("id", row.challenger_id)
            .maybeSingle();

          setIncomingBoth({
            challengeId: row.id,
            challengerId: row.challenger_id,
            challengerName: data?.display_name ?? "An athlete",
            challengerElo: data?.current_elo ?? null,
            challengerWeight: data?.current_weight ?? null,
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
          const row = payload.new as ChallengeRow;
          // The challenger cancelled, or a sweep expired it. Either way the
          // prompt is no longer answerable, so it goes away on its own rather
          // than failing under the athlete's thumb.
          if (
            row.status !== "pending" &&
            incomingRef.current?.challengeId === row.id
          ) {
            setIncomingBoth(null);
          }
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
          const row = payload.new as ChallengeRow;
          const mine = outgoingRef.current;
          if (!mine || mine.challengeId !== row.id) return;

          if (row.status === "declined" || row.status === "cancelled") {
            setOutgoingBoth(null);
            setCapReached(false);
            if (row.status === "declined") {
              toast.info(`${mine.opponentName} declined.`);
            }
            return;
          }

          // Recovery path. The broadcast is what normally lands both parties
          // together; if it never arrived, the status change still tells the
          // challenger the match is happening. `start_match_from_challenge` is
          // idempotent, so asking for it again is safe.
          if (row.status === "accepted" || row.status === "started") {
            const started = await startMatchWithRetry(row.id);
            if (started.ok) enterMatch(started.data.match_id);
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [athleteId, enterMatch, setIncomingBoth, setOutgoingBoth]);

  // --- Realtime: my outgoing challenge's own channel -------------------------
  const outgoingId = outgoing?.challengeId;
  const outgoingName = outgoing?.opponentName;
  React.useEffect(() => {
    if (!outgoingId) return;
    let channel: RealtimeChannel | null = supabase
      .channel(challengeTopic(outgoingId))
      .on("broadcast", { event: "match_started" }, ({ payload }) => {
        const matchId = (payload as { matchId?: string })?.matchId;
        if (matchId) enterMatch(matchId);
      })
      .on("broadcast", { event: "declined" }, () => {
        setOutgoingBoth(null);
        setCapReached(false);
        toast.info(`${outgoingName ?? "Your opponent"} declined.`);
      })
      .subscribe();

    return () => {
      if (channel) {
        void supabase.removeChannel(channel);
        channel = null;
      }
    };
  }, [outgoingId, outgoingName, enterMatch, setOutgoingBoth]);

  /** Guard every mutation against double taps; a ref, because state is async. */
  const runExclusive = React.useCallback(async (fn: () => Promise<void>) => {
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

  const sendChallenge = React.useCallback(
    (opponentId: string, opponentName: string) =>
      runExclusive(async () => {
        const result = await createChallenge(supabase, {
          opponentId,
          matchType: "ranked", // ranked-only product
          challengerWeight: weightRef.current ?? undefined,
        });

        if (!result.ok) {
          // `mapPostgrestError` turns any 42501 on this insert into
          // MAX_PENDING_CHALLENGES. Inside the Arena that mapping is exact:
          // the other WITH CHECK clauses are an inactive challenger (blocked
          // by the athlete guard before this screen renders), an inactive
          // opponent and a self-challenge (both filtered out of
          // `get_arena_data`), and an opponent who does not accept ranked
          // (whose Challenge affordance is already suppressed). The cap is
          // what is left.
          if (result.error.code === "MAX_PENDING_CHALLENGES") {
            setCapReached(true);
            return;
          }
          toast.error(result.error.message || "Couldn't send that challenge.");
          return;
        }

        enteredRef.current = false;
        setCapReached(false);
        setOutgoingBoth({
          challengeId: result.data.id,
          opponentId,
          opponentName,
        });
      }),
    [runExclusive, setOutgoingBoth],
  );

  const accept = React.useCallback(
    () =>
      runExclusive(async () => {
        const current = incomingRef.current;
        if (!current) return;

        const accepted = await acceptChallenge(supabase, {
          challengeId: current.challengeId,
          opponentWeight: weightRef.current ?? undefined,
        });
        if (!accepted.ok) {
          toast.error(
            accepted.error.message || "Couldn't accept that challenge.",
          );
          setIncomingBoth(null);
          return;
        }

        // `acceptChallenge` filters on `status = 'pending'`, and a PostgREST
        // update that matches no rows is not an error, so a challenge that was
        // cancelled or expired a moment ago still returns ok above. The real
        // answer arrives here, as `not_accepted`.
        const started = await startMatchWithRetry(current.challengeId);
        if (!started.ok) {
          setIncomingBoth(null);
          toast.error(
            started.error.code === "CHALLENGE_NOT_ACCEPTED"
              ? "That challenge is no longer available."
              : started.error.message || "Couldn't start the match.",
          );
          return;
        }

        // Before navigating, always: this broadcast is what pulls the
        // challenger off the waiting plate and into the same match. Navigate
        // first and they sit there while we are already in the wizard.
        await broadcast(current.challengeId, "match_started", {
          matchId: started.data.match_id,
        });

        enterMatch(started.data.match_id);
      }),
    [runExclusive, setIncomingBoth, enterMatch],
  );

  const decline = React.useCallback(
    () =>
      runExclusive(async () => {
        const current = incomingRef.current;
        if (!current) return;

        const result = await declineChallenge(supabase, current.challengeId);
        if (!result.ok) {
          // Keep the prompt: the challenge is still pending server-side and
          // the challenger is still waiting, so dismissing it here would be a
          // lie to both of us.
          toast.error("Couldn't decline that challenge. Try again.");
          return;
        }

        await broadcast(current.challengeId, "declined", {});
        setIncomingBoth(null);
      }),
    [runExclusive, setIncomingBoth],
  );

  const cancelOutgoing = React.useCallback(
    () =>
      runExclusive(async () => {
        const current = outgoingRef.current;
        if (!current) return;

        const result = await cancelChallenge(supabase, current.challengeId);
        if (!result.ok) {
          toast.error("Couldn't cancel that challenge. Try again.");
          return;
        }
        setOutgoingBoth(null);
        // A cancel frees a slot, so the cap can no longer be asserted.
        setCapReached(false);
      }),
    [runExclusive, setOutgoingBoth],
  );

  const clearCap = React.useCallback(() => setCapReached(false), []);

  return {
    incoming,
    outgoing,
    isBusy,
    capReached,
    sendChallenge,
    accept,
    decline,
    cancelOutgoing,
    clearCap,
  };
}

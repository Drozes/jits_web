/**
 * The Arena handshake: challenge, live prompt, accept, straight into the match.
 *
 * Ported from `apps/web/hooks/use-arena-challenge.ts`. The challenge row still
 * exists (`chk_match_origin` requires a challenge_id or a session_id, and an
 * Arena match has no session); what this hook does with it is raise a LIVE
 * prompt, so an athlete standing in the lobby answers in the moment rather
 * than out of a list.
 *
 * THERE IS NOW AN INBOX, AND IT IS NOT HERE. This hook only ever saw
 * challenges that arrived while the Arena tab was mounted: it raises the
 * prompt off a `postgres_changes` INSERT and has no backfill query, so a
 * challenge sent while the recipient was anywhere else in the app was
 * unreachable from the UI until it expired, and the notification bell (a
 * count, with nothing to tap through to) was the whole of the fallback. Home
 * now backfills and lists those rows,
 * `apps/mobile/lib/arena/use-challenge-inbox.ts` +
 * `apps/mobile/components/dashboard/pending-challenges-section.tsx`, in both
 * directions. The two surfaces coexist deliberately: this one is the
 * in-the-moment prompt for someone already in the lobby, the inbox is the
 * catch-up list for everyone else.
 *
 * The accept ordering (accept, start, BROADCAST, then navigate) is shared with
 * the inbox and lives in `challenge-handshake.ts`. Do not re-spell it here or
 * there.
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
  cancelChallenge,
  createChallenge,
  startMatchFromChallenge,
} from "@jits/shared/api/mutations";
import { toast } from "@/components/ui/toast";
import { supabase } from "../supabase/client";
import {
  acceptChallengeAndStart,
  declineChallengeAndNotify,
} from "./challenge-handshake";
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
  /**
   * Called when an opponent turns out to have left the Arena between the
   * roster load and the tap. The roster has no realtime feed on `athletes`,
   * so this is how the stale row gets corrected.
   */
  onOpponentUnavailable?: (opponentId: string) => void;
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

export function useArenaChallenge({
  athleteId,
  athleteWeight,
  onOpponentUnavailable,
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
  const unavailableRef = React.useRef(onOpponentUnavailable);
  unavailableRef.current = onOpponentUnavailable;
  /**
   * The challenge we have already navigated for.
   *
   * A match_started broadcast and the accepted-status fallback can both land
   * for the SAME challenge, and only one of them may push a screen. It is
   * keyed by challenge id rather than being a boolean, because this hook
   * outlives a match: the Arena is a tab screen with no unmountOnBlur, so the
   * instance survives the round trip into a match and back, and a boolean
   * latch would make every later accept a silent no-op, leaving the opponent
   * alone in a match nobody joined.
   */
  const enteredForRef = React.useRef<string | null>(null);

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
    (challengeId: string, matchId: string) => {
      if (enteredForRef.current === challengeId) return;
      enteredForRef.current = challengeId;
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
            const started = await startMatchFromChallenge(supabase, row.id);
            if (started.ok) enterMatch(row.id, started.data.match_id);
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
        if (matchId) enterMatch(outgoingId, matchId);
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

  /**
   * Work out what a refused insert actually means before saying anything.
   *
   * `mapPostgrestError` collapses EVERY 42501 on this insert into
   * MAX_PENDING_CHALLENGES, but `challenges_insert` has four WITH CHECK
   * clauses. Three are unreachable from this screen (an inactive challenger is
   * stopped by the athlete guard; an inactive opponent and a self-challenge
   * are filtered out of `get_arena_data`). The fourth,
   * `opponent_accepts_match_type`, IS reachable and the window is wide,
   * because the roster is a snapshot taken at mount and this very design has
   * people dropping out of the Arena constantly: the opponent can leave
   * between the roster load and the tap, which clears their
   * `looking_for_ranked` and makes the insert fail for a reason that has
   * nothing to do with the cap. Asserting a standing "you have 3 challenges
   * out" plate then would be a flat lie that also disables every row.
   *
   * So the opponent's row decides. When it cannot be read at all, the cap is
   * NOT asserted: a toast that is merely unhelpful beats a standing banner
   * that is confidently wrong about a limit the athlete may be nowhere near.
   */
  const explainRefusedInsert = React.useCallback(
    async (opponentId: string, opponentName: string) => {
      const { data, error } = await supabase
        .from("athletes")
        .select("looking_for_ranked, status")
        .eq("id", opponentId)
        .maybeSingle();

      if (error || !data) {
        toast.error("Couldn't send that challenge. Try again.");
        return;
      }

      if (data.looking_for_ranked !== true || data.status !== "active") {
        toast.info(`${opponentName} just left the Arena.`);
        unavailableRef.current?.(opponentId);
        return;
      }

      setCapReached(true);
    },
    [],
  );

  const sendChallenge = React.useCallback(
    (opponentId: string, opponentName: string) =>
      runExclusive(async () => {
        const result = await createChallenge(supabase, {
          opponentId,
          matchType: "ranked", // ranked-only product
          challengerWeight: weightRef.current ?? undefined,
        });

        if (!result.ok) {
          if (result.error.code === "MAX_PENDING_CHALLENGES") {
            await explainRefusedInsert(opponentId, opponentName);
            return;
          }
          toast.error(result.error.message || "Couldn't send that challenge.");
          return;
        }

        setCapReached(false);
        setOutgoingBoth({
          challengeId: result.data.id,
          opponentId,
          opponentName,
        });
      }),
    [runExclusive, setOutgoingBoth, explainRefusedInsert],
  );

  const accept = React.useCallback(
    () =>
      runExclusive(async () => {
        const current = incomingRef.current;
        if (!current) return;

        // accept -> start -> broadcast -> navigate, in that order. The
        // ordering is the load-bearing part and it is shared with Home's
        // inbox, so it lives in `challenge-handshake.ts`.
        const result = await acceptChallengeAndStart(
          current.challengeId,
          weightRef.current,
        );
        if (!result.ok) {
          setIncomingBoth(null);
          toast.error(result.message);
          return;
        }

        enterMatch(current.challengeId, result.matchId);
      }),
    [runExclusive, setIncomingBoth, enterMatch],
  );

  const decline = React.useCallback(
    () =>
      runExclusive(async () => {
        const current = incomingRef.current;
        if (!current) return;

        const told = await declineChallengeAndNotify(current.challengeId);
        if (!told) {
          // Keep the prompt: the challenge is still pending server-side and
          // the challenger is still waiting, so dismissing it here would be a
          // lie to both of us.
          toast.error("Couldn't decline that challenge. Try again.");
          return;
        }

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

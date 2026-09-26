/**
 * The Arena handshake: challenge, live prompt, accept, straight into the match.
 *
 * Ported from `apps/web/hooks/use-arena-challenge.ts`. There is NO inbox. The
 * challenge row still exists (`chk_match_origin` requires a challenge_id or a
 * session_id, and an Arena match has no session), it is just never left
 * sitting in a list. A prompt nobody saw falls back to the notification bell,
 * which mobile already renders.
 *
 * Mounted ONCE, app-wide, by `<ArenaBootstrap />`, so a live athlete on any
 * tab gets the prompt. The Arena screen reads this hook's state through
 * `arena-store.ts` and must never mount a second copy: two instances would
 * mean two INSERT listeners and two prompts for one challenge.
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
import { AppState } from "react-native";
import { useRouter } from "expo-router";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  acceptChallenge,
  cancelChallenge,
  cancelStaleOutgoingChallenges,
  createChallenge,
  declineChallenge,
  startMatchFromChallenge,
} from "@jits/shared/api/mutations";
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
  /**
   * The row's `expires_at`, when known. The challenger clears the waiting
   * plate on its own once this passes, so a sweep whose realtime UPDATE never
   * arrived (socket down, app suspended) cannot leave the plate up forever.
   */
  expiresAt?: string | null;
}

/**
 * Statuses in which my outgoing challenge can still turn into a match.
 * Anything else (`declined`, `cancelled`, `expired`, or a value added later)
 * is terminal for the waiting plate: nobody can accept it any more.
 */
const LIVE_CHALLENGE_STATUSES = new Set(["pending", "accepted", "started"]);

/** setTimeout's ceiling (2^31 - 1 ms, about 24.8 days); longer overflows to 0. */
const MAX_TIMER_MS = 2_147_483_647;

function hasExpired(expiresAt: string | null | undefined, now: number): boolean {
  if (!expiresAt) return false;
  const at = Date.parse(expiresAt);
  return !Number.isNaN(at) && at <= now;
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
  /** True while a match screen is mounted: no prompt is raised mid-match. */
  inMatch?: boolean;
  /**
   * Called when an opponent turns out to have left the Arena between the
   * roster load and the tap. The roster has no realtime feed on `athletes`,
   * so this is how the stale row gets corrected.
   */
  onOpponentUnavailable?: (opponentId: string) => void;
  /**
   * Called after stale outgoing challenges were withdrawn to free the cap, so
   * the roster's "Pending" rows (read at load) can be re-read.
   */
  onStaleCancelled?: () => void;
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
  /**
   * Raise the prompt for a challenge found by a read rather than by the
   * realtime INSERT (`use-pending-challenge-recovery.ts`). A no-op while a
   * prompt is already up, or for a challenge this instance already answered.
   * Resolves true only when the prompt was actually raised, so the caller
   * can offer it again later when it was skipped.
   */
  offerIncoming: (challengeId: string, challengerId: string) => Promise<boolean>;
  /**
   * Put back the "Sent" state for my own still-pending challenge after a
   * relaunch, so the accept broadcast still reaches me. A no-op when a
   * challenge is already outgoing.
   */
  restoreOutgoing: (challenge: OutgoingChallenge) => void;
}

/** What the prompt shows, read off the challenger's row. */
async function loadIncoming(
  challengeId: string,
  challengerId: string,
): Promise<IncomingChallenge> {
  const { data } = await supabase
    .from("athletes")
    .select("display_name, current_elo, current_weight")
    .eq("id", challengerId)
    .maybeSingle();

  return {
    challengeId,
    challengerId,
    challengerName: data?.display_name ?? "An athlete",
    challengerElo: data?.current_elo ?? null,
    challengerWeight: data?.current_weight ?? null,
  };
}

/**
 * Both parties may call `start_match_from_challenge` for the same challenge,
 * and they converge on one match without any client-side retry:
 * `matches.challenge_id` is UNIQUE, and the function's own EXCEPTION block
 * catches `unique_violation`, re-selects the winner's match id and returns
 * `{ success: true, already_exists: true }`
 * (jr_be 20260219000000_start_match_enhancements.sql). No 23505 ever reaches
 * PostgREST, so a client retry on MATCH_ALREADY_EXISTS would be dead code
 * guarding a response the server cannot produce.
 */

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
  inMatch = false,
  onOpponentUnavailable,
  onStaleCancelled,
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
  const inMatchRef = React.useRef(inMatch);
  inMatchRef.current = inMatch;
  const weightRef = React.useRef(athleteWeight);
  weightRef.current = athleteWeight;
  const unavailableRef = React.useRef(onOpponentUnavailable);
  unavailableRef.current = onOpponentUnavailable;
  const staleCancelledRef = React.useRef(onStaleCancelled);
  staleCancelledRef.current = onStaleCancelled;
  const athleteIdRef = React.useRef(athleteId);
  athleteIdRef.current = athleteId;
  /**
   * The challenge we have already navigated for.
   *
   * A match_started broadcast and the accepted-status fallback can both land
   * for the SAME challenge, and only one of them may push a screen. It is
   * keyed by challenge id rather than being a boolean, because this hook
   * outlives a match: it is mounted app-wide, so the instance survives the
   * round trip into a match and back, and a boolean
   * latch would make every later accept a silent no-op, leaving the opponent
   * alone in a match nobody joined.
   */
  const enteredForRef = React.useRef<string | null>(null);
  /**
   * Challenges this instance has already answered or seen withdrawn. The
   * pending read can be a beat behind a decline, and presence syncs keep
   * re-running the recovery pass, so without this a declined challenge could
   * pop straight back up.
   */
  const settledRef = React.useRef<Set<string>>(new Set());

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
      settledRef.current.add(challengeId);
      setIncomingBoth(null);
      setOutgoingBoth(null);
      router.push(arenaMatchHref(matchId));
    },
    [router, setIncomingBoth, setOutgoingBoth],
  );

  /**
   * My outgoing challenge is over without a match: drop the waiting plate.
   * `toastMessage` is null for a quiet end (my own cancel, a cancel sweep).
   */
  const endOutgoing = React.useCallback(
    (challengeId: string, toastMessage: string | null) => {
      settledRef.current.add(challengeId);
      if (outgoingRef.current?.challengeId !== challengeId) return;
      setOutgoingBoth(null);
      // A slot freed up, so the cap can no longer be asserted.
      setCapReached(false);
      if (toastMessage) toast.info(toastMessage);
    },
    [setOutgoingBoth],
  );

  // A match that starts by ANOTHER route (a deep link, a notification) while
  // a prompt is up: drop the prompt rather than hold it over the match. It is
  // not settled, so recovery re-offers it after the match if it is still
  // fresh and its challenger is still in the lobby; held instead, it could
  // reappear long after the challenger gave up.
  React.useEffect(() => {
    if (inMatch && incomingRef.current) setIncomingBoth(null);
  }, [inMatch, setIncomingBoth]);

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
          if (incomingRef.current || inMatchRef.current) return;

          const next = await loadIncoming(row.id, row.challenger_id);
          // Re-checked after the read: another INSERT, a recovery offer or a
          // match can land inside that await, and the first prompt keeps the
          // surface.
          if (incomingRef.current || inMatchRef.current) return;
          setIncomingBoth(next);
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
          if (row.status === "pending") return;
          settledRef.current.add(row.id);
          if (incomingRef.current?.challengeId === row.id) {
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

          // Terminal: declined, cancelled, expired (the sweep), or any status
          // that cannot become a match. Ignoring `expired` here is what left
          // the waiting plate stuck until a relaunch (jits-1o4l).
          if (!LIVE_CHALLENGE_STATUSES.has(row.status)) {
            endOutgoing(
              row.id,
              row.status === "declined"
                ? `${mine.opponentName} declined.`
                : row.status === "expired"
                  ? `Your challenge to ${mine.opponentName} expired.`
                  : null,
            );
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
  }, [athleteId, enterMatch, endOutgoing, setIncomingBoth]);

  // --- Client-side expiry of my outgoing challenge ---------------------------
  // Belt and braces for the realtime UPDATE above: a sweep that expired the
  // row while the socket was down never reaches us, so the plate also clears
  // itself at `expires_at`, and re-checks on every return to the foreground
  // (timers do not run while iOS has the app suspended).
  const outgoingExpiresAt = outgoing?.expiresAt;
  const outgoingIdForExpiry = outgoing?.challengeId;
  React.useEffect(() => {
    if (!outgoingIdForExpiry || !outgoingExpiresAt) return;
    const at = Date.parse(outgoingExpiresAt);
    if (Number.isNaN(at)) return;

    const expireIfDue = () => {
      const mine = outgoingRef.current;
      if (!mine || mine.challengeId !== outgoingIdForExpiry) return;
      if (!hasExpired(mine.expiresAt, Date.now())) return;
      endOutgoing(mine.challengeId, `Your challenge to ${mine.opponentName} expired.`);
    };

    const delay = at - Date.now();
    if (delay <= 0) {
      expireIfDue();
      return;
    }
    const timer =
      delay <= MAX_TIMER_MS ? setTimeout(expireIfDue, delay) : null;
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") expireIfDue();
    });
    return () => {
      if (timer) clearTimeout(timer);
      sub.remove();
    };
  }, [outgoingIdForExpiry, outgoingExpiresAt, endOutgoing]);

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
        endOutgoing(outgoingId, `${outgoingName ?? "Your opponent"} declined.`);
      })
      .subscribe();

    return () => {
      if (channel) {
        void supabase.removeChannel(channel);
        channel = null;
      }
    };
  }, [outgoingId, outgoingName, enterMatch, endOutgoing]);

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
        const create = () =>
          createChallenge(supabase, {
            opponentId,
            matchType: "ranked", // ranked-only product
            challengerWeight: weightRef.current ?? undefined,
          });
        let result = await create();

        // The cap may be held by my own stale challenges: pending rows nobody
        // will answer live that count for 7 days (jits-celf). Withdraw those
        // and try exactly once more; if the insert is still refused, the
        // explanation below decides what to say.
        if (!result.ok && result.error.code === "MAX_PENDING_CHALLENGES") {
          const swept = await cancelStaleOutgoingChallenges(
            supabase,
            athleteIdRef.current,
            { keepChallengeId: outgoingRef.current?.challengeId ?? null },
          );
          if (swept.ok && swept.data.cancelled.length > 0) {
            for (const c of swept.data.cancelled) {
              settledRef.current.add(c.challengeId);
            }
            staleCancelledRef.current?.();
            result = await create();
          }
        }

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
          expiresAt: result.data.expiresAt ?? null,
        });
      }),
    [runExclusive, setOutgoingBoth, explainRefusedInsert],
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
        const started = await startMatchFromChallenge(
          supabase,
          current.challengeId,
        );
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

        enterMatch(current.challengeId, started.data.match_id);
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

        settledRef.current.add(current.challengeId);
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
          // Nothing to withdraw: the challenge expired (locally known), or
          // the database refused it as not cancellable. Either way nobody
          // can accept it, so the plate just goes. Anything else (network)
          // keeps the plate: the challenge may still be live server-side.
          if (
            hasExpired(current.expiresAt, Date.now()) ||
            result.error.code === "RLS_VIOLATION"
          ) {
            endOutgoing(current.challengeId, null);
            return;
          }
          toast.error("Couldn't cancel that challenge. Try again.");
          return;
        }

        if (!result.data.cancelled) {
          // No row changed: the challenge was already over (expired,
          // declined, cancelled) or the opponent has just started the match.
          // `start_match_from_challenge` is idempotent and returns the
          // existing match for a started challenge, so ask it: joining beats
          // leaving the opponent alone in a match nobody else entered.
          const started = await startMatchFromChallenge(
            supabase,
            current.challengeId,
          );
          if (started.ok) {
            enterMatch(current.challengeId, started.data.match_id);
            return;
          }
        }
        endOutgoing(current.challengeId, null);
      }),
    [runExclusive, endOutgoing, enterMatch],
  );

  const clearCap = React.useCallback(() => setCapReached(false), []);

  const offerIncoming = React.useCallback(
    async (challengeId: string, challengerId: string) => {
      const skip = () =>
        inMatchRef.current ||
        !!incomingRef.current ||
        settledRef.current.has(challengeId) ||
        enteredForRef.current === challengeId;
      if (skip()) return false;
      const next = await loadIncoming(challengeId, challengerId);
      // Re-checked after the read: the realtime INSERT or an answer can land
      // inside that await, and the first prompt keeps the surface.
      if (skip()) return false;
      setIncomingBoth(next);
      return true;
    },
    [setIncomingBoth],
  );

  const restoreOutgoing = React.useCallback(
    (challenge: OutgoingChallenge) => {
      if (outgoingRef.current) return;
      if (settledRef.current.has(challenge.challengeId)) return;
      setOutgoingBoth(challenge);
    },
    [setOutgoingBoth],
  );

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
    offerIncoming,
    restoreOutgoing,
  };
}

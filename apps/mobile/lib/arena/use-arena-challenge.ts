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
 *    the incoming prompt, only while I am live.
 *  - `postgres_changes` UPDATE on the same table, both directions: dismisses a
 *    prompt the challenger cancelled, and recovers a challenger whose
 *    broadcast went missing.
 *  - a per-challenge broadcast channel: how the accepting side tells the
 *    challenger the match exists so both navigate together.
 * Both channels are rebuilt when the server closes them (jits-fa9x pattern,
 * see `superviseChannel`), and the waiting plate re-reads its row whenever it
 * may have missed an event: on (re)subscribe, on foreground, on match exit.
 *
 * With a room full of people (the group demo), several things race:
 *  - several challengers, one target: entering a match declines every other
 *    pending challenge I received, so their plates clear with a toast;
 *  - accepting while my own challenge is out: mine is withdrawn first, or, if
 *    it already turned into a match, I join that one instead;
 *  - crossing challenges (A and B challenge each other): one deterministic
 *    tie-break (the lower challenge id is canonical) so both land in ONE
 *    match, see `accept`;
 *  - one client never pushes two match screens (`entryRef`).
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
  declineOtherPendingChallenges,
  startMatchFromChallenge,
} from "@jits/shared/api/mutations";
import { getChallengeStatus } from "@jits/shared/api/queries";
import { toast } from "@/components/ui/toast";
import { supabase } from "../supabase/client";
import { arenaMatchHref, challengeTopic, incomingTopic } from "./constants";
import { requestPendingChallengeResync } from "./use-pending-challenge-recovery";

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

/**
 * How long after `enterMatch` pushed a screen a second entry stays refused
 * while the match screen has not reported itself mounted (`inMatch`). Only a
 * fallback: normally `inMatch` turns true within a frame or two and takes
 * over, and a push that never mounted must not lock entry forever.
 */
const ENTRY_SETTLE_MS = 5_000;

/**
 * Rebuild delays for a channel the server closed, by losses in a row. Same
 * shape as the lobby's (jits-fa9x): quick first, widening, then wait for the
 * next foreground instead of hammering a server that keeps closing it.
 */
const CHANNEL_LOSS_RETRY_DELAYS_MS = [1_000, 5_000, 15_000, 30_000];

/** A channel that stayed up this long ends the losing streak. */
const CHANNEL_LOSS_STREAK_RESET_MS = 30_000;

/** What the challenger is told when their challenge ended without a match. */
function endedToast(status: string, opponentName: string): string | null {
  if (status === "declined") return `${opponentName} declined.`;
  if (status === "expired") return `Your challenge to ${opponentName} expired.`;
  return null;
}

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
   * Whether I am live. The realtime INSERT raises a prompt only while I am:
   * a challenge that lands while I am offline (it can race my going offline,
   * since the server only checks the flag at insert time) is left to
   * `use-pending-challenge-recovery.ts`, which offers it when I go live if it
   * is still fresh and its challenger is still in the lobby. Defaults to true
   * so a caller that does not track live state keeps the old behaviour.
   */
  isLive?: boolean;
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

/** True while the client still holds this exact channel instance. */
function isRegistered(channel: RealtimeChannel): boolean {
  return supabase.getChannels().some((c) => c === channel);
}

/**
 * Subscribe a channel and keep it alive across a server close.
 *
 * The server can stop a channel process (a rate limit, a node restart), and
 * the client then gets CLOSED with the instance already dropped from the
 * registry: nothing in realtime-js ever rejoins it, so without this the prompt
 * and the waiting plate go deaf for the rest of the session. Mirrors the
 * lobby (jits-fa9x, `use-lobby-presence.ts`):
 *  - only CLOSED on an instance that is no longer registered is a loss;
 *    CHANNEL_ERROR / TIMED_OUT leave it registered while phoenix rejoins it;
 *  - the dead instance is left alone: tearing down a closed channel clears
 *    its reply bindings, and it is already out of the registry;
 *  - rebuilds are bounded (`CHANNEL_LOSS_RETRY_DELAYS_MS`), then wait for the
 *    next foreground.
 * `build` returns a fresh, bound, NOT yet subscribed channel. `onSubscribed`
 * runs on every SUBSCRIBED; `rebuilt` is true for the first one after a loss,
 * when events may have been missed. Returns the teardown.
 */
function superviseChannel(
  label: string,
  build: () => RealtimeChannel,
  onSubscribed: (rebuilt: boolean) => void,
): () => void {
  let stopped = false;
  let current: RealtimeChannel | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let losses = 0;
  let subscribedAt: number | null = null;
  let rebuilt = false;
  let gaveUp = false;

  const start = () => {
    if (stopped) return;
    const channel = build();
    current = channel;
    channel.subscribe((status) => {
      // Our own teardown (stopped) or an instance already replaced.
      if (stopped || current !== channel) return;
      if (status === "SUBSCRIBED") {
        subscribedAt = Date.now();
        const wasRebuilt = rebuilt;
        rebuilt = false;
        onSubscribed(wasRebuilt);
        return;
      }
      if (status === "CLOSED" && !isRegistered(channel)) lost();
    });
  };

  const lost = () => {
    current = null;
    if (
      subscribedAt !== null &&
      Date.now() - subscribedAt >= CHANNEL_LOSS_STREAK_RESET_MS
    ) {
      losses = 0;
    }
    subscribedAt = null;
    losses += 1;
    rebuilt = true;
    const delay = CHANNEL_LOSS_RETRY_DELAYS_MS[losses - 1];
    if (delay === undefined) {
      console.warn(
        `[arena] gave up rebuilding the ${label} channel; retrying when the app next returns to the foreground`,
      );
      gaveUp = true;
      return;
    }
    console.warn(`[arena] ${label} channel closed; rebuilding it (loss ${losses} in a row)`);
    timer = setTimeout(() => {
      timer = null;
      start();
    }, delay);
  };

  const appStateSub = AppState.addEventListener("change", (next) => {
    if (next !== "active" || !gaveUp || stopped) return;
    gaveUp = false;
    losses = 0;
    start();
  });

  start();

  return () => {
    stopped = true;
    appStateSub.remove();
    if (timer) clearTimeout(timer);
    if (current) void supabase.removeChannel(current);
    current = null;
  };
}

/**
 * After entering a match, settle every other challenge that involves me, so
 * nobody is left waiting on someone who is now busy:
 *  - my own outgoing that did NOT become this match (the crossing case) is
 *    withdrawn, pending-guarded;
 *  - every other pending challenge I received is declined and the challenger
 *    told (UPDATE + broadcast), except one from the person I am now matched
 *    with: that is the other half of a crossing pair, withdrawn quietly so
 *    they are not told "declined" on their way into the same match.
 * Best effort and fire-and-forget: it never blocks the navigation.
 */
async function settleOthersAfterEntry(
  athleteId: string,
  enteredChallengeId: string,
  peerId: string | null,
  strandedOutgoingId: string | null,
  settled: Set<string>,
): Promise<void> {
  if (strandedOutgoingId) {
    await cancelChallenge(supabase, strandedOutgoingId, { onlyIfPending: true });
  }
  const result = await declineOtherPendingChallenges(supabase, athleteId, {
    keepChallengeId: enteredChallengeId,
    exceptChallengerId: peerId,
  });
  if (!result.ok) return;
  for (const c of result.data.skipped) {
    settled.add(c.challengeId);
    void cancelChallenge(supabase, c.challengeId, { onlyIfPending: true });
  }
  for (const c of result.data.declined) settled.add(c.challengeId);
  await Promise.all(
    result.data.declined.map((c) => broadcast(c.challengeId, "declined", {})),
  );
}

export function useArenaChallenge({
  athleteId,
  athleteWeight,
  inMatch = false,
  isLive = true,
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
  const isLiveRef = React.useRef(isLive);
  isLiveRef.current = isLive;
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

  /**
   * A match screen this instance pushed and that has not reported itself
   * mounted yet (`inMatch`). Together with `inMatch` it makes entry
   * exclusive: crossing challenges, a broadcast racing the status fallback
   * for a DIFFERENT challenge, or a late accept can each want a match screen,
   * and one client must never push two. See `ENTRY_SETTLE_MS`.
   */
  const entryRef = React.useRef<{ challengeId: string; at: number } | null>(null);
  const entryBlocked = React.useCallback(
    () =>
      inMatchRef.current ||
      (entryRef.current !== null &&
        Date.now() - entryRef.current.at < ENTRY_SETTLE_MS),
    [],
  );

  /**
   * Navigate into the match for `challengeId`, once. `peerId` is the other
   * athlete in it: a pending challenge from them is the other half of a
   * crossing pair and is withdrawn quietly rather than declined.
   */
  const enterMatch = React.useCallback(
    (challengeId: string, matchId: string, peerId: string | null) => {
      if (enteredForRef.current === challengeId) return;
      if (entryBlocked()) {
        console.warn(
          `[arena] not entering the match for ${challengeId}: another match screen is already up`,
        );
        return;
      }
      enteredForRef.current = challengeId;
      entryRef.current = { challengeId, at: Date.now() };
      settledRef.current.add(challengeId);
      // My own challenge that did not become this match is over too. Settled
      // now, so recovery's restore cannot put its plate back while the
      // withdrawal below is in flight.
      const mine = outgoingRef.current;
      const stranded =
        mine && mine.challengeId !== challengeId ? mine.challengeId : null;
      if (stranded) settledRef.current.add(stranded);
      setIncomingBoth(null);
      setOutgoingBoth(null);
      router.push(arenaMatchHref(matchId));
      void settleOthersAfterEntry(
        athleteIdRef.current,
        challengeId,
        peerId,
        stranded,
        settledRef.current,
      );
    },
    [router, entryBlocked, setIncomingBoth, setOutgoingBoth],
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

  /**
   * Re-read my outgoing challenge's row and act on it: the recovery for a
   * challenger that missed the realtime UPDATE and the broadcast (backgrounded
   * while waiting, socket down, channel rebuilt). Only `started` enters: on
   * `accepted` the accepter is mid-way through starting it, and starting it
   * from here as well is the jits-njyd race (the accepter's own start then
   * fails `not_accepted`); its broadcast or the `started` UPDATE follows.
   */
  const recheckOutgoing = React.useCallback(
    async (challengeId: string) => {
      const mine = outgoingRef.current;
      if (!mine || mine.challengeId !== challengeId) return;
      const read = await getChallengeStatus(supabase, challengeId);
      if (!read.ok || !read.data) return;
      if (outgoingRef.current?.challengeId !== challengeId) return;
      const { status } = read.data;
      if (status === "started") {
        const started = await startMatchFromChallenge(supabase, challengeId);
        if (started.ok) enterMatch(challengeId, started.data.match_id, mine.opponentId);
        return;
      }
      if (!LIVE_CHALLENGE_STATUSES.has(status)) {
        endOutgoing(challengeId, endedToast(status, mine.opponentName));
      }
    },
    [enterMatch, endOutgoing],
  );
  const recheckOutgoingRef = React.useRef(recheckOutgoing);
  recheckOutgoingRef.current = recheckOutgoing;

  // A match that starts by ANOTHER route (a deep link, a notification) while
  // a prompt is up: drop the prompt rather than hold it over the match. It is
  // not settled, so recovery re-offers it after the match if it is still
  // fresh and its challenger is still in the lobby; held instead, it could
  // reappear long after the challenger gave up.
  React.useEffect(() => {
    if (inMatch && incomingRef.current) setIncomingBoth(null);
  }, [inMatch, setIncomingBoth]);

  // The match screen is up: `inMatch` guards entry from here, so the settle
  // window is done. Leaving a match with a plate still up (a match entered by
  // another route while I was waiting) re-reads it, since its events may have
  // landed while I was busy.
  const wasInMatchRef = React.useRef(inMatch);
  React.useEffect(() => {
    if (inMatch) entryRef.current = null;
    if (inMatch === wasInMatchRef.current) return;
    wasInMatchRef.current = inMatch;
    const mine = outgoingRef.current;
    if (!inMatch && mine) void recheckOutgoingRef.current(mine.challengeId);
  }, [inMatch]);

  // Back from the background with a plate up: the accept broadcast and the
  // status UPDATE were both likely missed while suspended. Tracked from
  // "background" specifically; Control Center is not a return.
  React.useEffect(() => {
    let wasBackground = false;
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "background") {
        wasBackground = true;
        return;
      }
      if (next !== "active" || !wasBackground) return;
      wasBackground = false;
      const mine = outgoingRef.current;
      if (mine) void recheckOutgoingRef.current(mine.challengeId);
    });
    return () => sub.remove();
  }, []);

  // --- Realtime: challenges involving me ------------------------------------
  React.useEffect(() => {
    if (!athleteId) return;

    const build = () =>
      supabase
        // Per-build suffix, see `incomingTopic`. Without it an overlapping
        // remount (or a rebuild) gets handed the previous, already-subscribed
        // channel and `.on("postgres_changes", ...)` throws on it.
        .channel(incomingTopic(athleteId, Math.random().toString(36).slice(2, 10)))
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
            // than being silently replaced mid-decision (recovery offers the
            // next one when it clears). Offline or entering a match: no live
            // prompt; recovery offers it later if it is still fresh.
            const skip = () =>
              !!incomingRef.current ||
              entryBlocked() ||
              !isLiveRef.current ||
              settledRef.current.has(row.id);
            if (skip()) return;

            const next = await loadIncoming(row.id, row.challenger_id);
            // Re-checked after the read: another INSERT, a recovery offer, a
            // match or going offline can land inside that await, and the first
            // prompt keeps the surface.
            if (skip()) return;
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
            // than failing under the athlete's thumb, and the next challenger
            // queued behind it gets offered.
            if (row.status === "pending") return;
            settledRef.current.add(row.id);
            if (incomingRef.current?.challengeId === row.id) {
              setIncomingBoth(null);
              // Not for my own accept landing (`accepted` / `started`): I am
              // on my way into that match, and a re-read now could raise the
              // next prompt under the navigation.
              if (!LIVE_CHALLENGE_STATUSES.has(row.status)) {
                requestPendingChallengeResync();
              }
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
              endOutgoing(row.id, endedToast(row.status, mine.opponentName));
              return;
            }

            // Recovery path. The broadcast is what normally lands both parties
            // together; if it never arrived, the status change still tells the
            // challenger the match is happening. ONLY on `started`: acting on
            // `accepted` races the accepter's own start, which then fails
            // `not_accepted` and strands them (jits-njyd). `started` means the
            // match exists, and asking for it again just returns it.
            if (row.status === "started") {
              const started = await startMatchFromChallenge(supabase, row.id);
              if (started.ok) enterMatch(row.id, started.data.match_id, mine.opponentId);
            }
          },
        );

    // A rebuild after a server close may have missed an INSERT (recovery reads
    // pending challenges again) or my plate's UPDATE (re-read it).
    return superviseChannel("incoming challenge", build, (rebuilt) => {
      if (!rebuilt) return;
      requestPendingChallengeResync();
      const mine = outgoingRef.current;
      if (mine) void recheckOutgoingRef.current(mine.challengeId);
    });
  }, [athleteId, enterMatch, endOutgoing, entryBlocked, setIncomingBoth]);

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
  const outgoingPeer = outgoing?.opponentId ?? null;
  React.useEffect(() => {
    if (!outgoingId) return;
    const build = () =>
      supabase
        .channel(challengeTopic(outgoingId))
        .on("broadcast", { event: "match_started" }, ({ payload }) => {
          const matchId = (payload as { matchId?: string })?.matchId;
          if (matchId) enterMatch(outgoingId, matchId, outgoingPeer);
        })
        .on("broadcast", { event: "declined" }, () => {
          endOutgoing(outgoingId, `${outgoingName ?? "Your opponent"} declined.`);
        });

    // Every SUBSCRIBED, not only after a rebuild: the first one closes the
    // window between the insert and the listener being up, and a phoenix
    // rejoin after a network drop may have missed the broadcast.
    return superviseChannel("outgoing challenge", build, () => {
      void recheckOutgoingRef.current(outgoingId);
    });
  }, [outgoingId, outgoingName, outgoingPeer, enterMatch, endOutgoing]);

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

  /**
   * I am accepting `current` while my own challenge `mine` is still out.
   *
   * Mine is withdrawn FIRST, pending-guarded, so nobody can accept it while I
   * walk into a different match. When no row changed, mine is already past
   * pending, and its status decides:
   *  - `started`: its match exists, so I join THAT one; entering declines
   *    `current` (or, crossing, withdraws it quietly), see
   *    `settleOthersAfterEntry`;
   *  - `accepted`: the other side is starting it right now, and its broadcast
   *    (or the `started` UPDATE) takes me in, so I let go of `current` and
   *    keep waiting. Starting it from here would be the jits-njyd race;
   *  - anything else: mine is over without a match, its plate goes, and the
   *    accept goes on.
   * Resolves "proceed" to go on accepting `current`, "stop" when the accept is
   * finished (joined, waiting, or refused with the prompt kept up).
   */
  const resolveOwnOutgoing = React.useCallback(
    async (
      mine: OutgoingChallenge,
      current: IncomingChallenge,
    ): Promise<"proceed" | "stop"> => {
      const crossing = mine.opponentId === current.challengerId;
      const withdrawn = await cancelChallenge(supabase, mine.challengeId, {
        onlyIfPending: true,
      });
      if (!withdrawn.ok) {
        // Unknown whether mine is still live: accepting now could put me in
        // two matches. Keep the prompt, the athlete can try again.
        toast.error("Couldn't accept that challenge. Try again.");
        return "stop";
      }
      if (withdrawn.data.cancelled) {
        endOutgoing(mine.challengeId, null);
        return "proceed";
      }

      const read = await getChallengeStatus(supabase, mine.challengeId);
      if (!read.ok) {
        toast.error("Couldn't accept that challenge. Try again.");
        return "stop";
      }
      const status = read.data?.status ?? null;

      if (status === "started") {
        const started = await startMatchFromChallenge(supabase, mine.challengeId);
        if (!started.ok) {
          toast.error("Couldn't start the match. Try again.");
          return "stop";
        }
        enterMatch(mine.challengeId, started.data.match_id, mine.opponentId);
        return "stop";
      }

      if (status === "accepted") {
        settledRef.current.add(current.challengeId);
        setIncomingBoth(null);
        if (crossing) {
          // The other half of a crossing pair: its sender is walking into a
          // match with me, so it is withdrawn quietly, never "declined".
          await cancelChallenge(supabase, current.challengeId, {
            onlyIfPending: true,
          });
        } else {
          const declined = await declineChallenge(supabase, current.challengeId);
          if (declined.ok) await broadcast(current.challengeId, "declined", {});
        }
        return "stop";
      }

      endOutgoing(
        mine.challengeId,
        status ? endedToast(status, mine.opponentName) : null,
      );
      return "proceed";
    },
    [endOutgoing, enterMatch, setIncomingBoth],
  );

  const accept = React.useCallback(
    () =>
      runExclusive(async () => {
        const current = incomingRef.current;
        if (!current) return;

        // Crossing challenges: A challenged B and B challenged A, and both may
        // tap Accept at once. If each withdrew its own challenge first, both
        // accepts would hit a withdrawn row and nobody would get a match. So
        // one tie-break both clients compute the same way: the challenge with
        // the LOWER id is canonical. Its recipient accepts it straight away;
        // the other side withdraws the canonical one first (pending-guarded).
        // Exactly one of those two writes wins the row, and each outcome
        // leaves exactly one match that both sides reach: the winner's
        // broadcast lands on the loser's waiting plate.
        const mine = outgoingRef.current;
        const crossing = !!mine && mine.opponentId === current.challengerId;
        const acceptCanonical =
          crossing && !!mine && current.challengeId < mine.challengeId;
        if (mine && !acceptCanonical) {
          if ((await resolveOwnOutgoing(mine, current)) === "stop") return;
        }

        const accepted = await acceptChallenge(supabase, {
          challengeId: current.challengeId,
          opponentWeight: weightRef.current ?? undefined,
        });
        if (!accepted.ok) {
          toast.error(
            accepted.error.message || "Couldn't accept that challenge.",
          );
          setIncomingBoth(null);
          requestPendingChallengeResync();
          return;
        }

        // `acceptChallenge` filters on `status = 'pending'`, and a PostgREST
        // update that matches no rows is not an error, so a challenge that was
        // cancelled or expired a moment ago still returns ok above. The real
        // answer arrives here, as `not_accepted`. That answer can also be a
        // lost race with the challenger's own start (an older build that
        // starts on `accepted`, jits-njyd): the row lock made my call re-read
        // `started`. Once more then finds the match that call created.
        let started = await startMatchFromChallenge(supabase, current.challengeId);
        if (!started.ok && started.error.code === "CHALLENGE_NOT_ACCEPTED") {
          started = await startMatchFromChallenge(supabase, current.challengeId);
        }
        if (!started.ok) {
          settledRef.current.add(current.challengeId);
          setIncomingBoth(null);
          // Crossing, and the other side won the canonical row by withdrawing
          // it to accept mine instead: its broadcast is on its way to my
          // plate, so there is nothing to apologise for.
          if (
            acceptCanonical &&
            outgoingRef.current?.challengeId === mine?.challengeId
          ) {
            return;
          }
          // Already on the way into a match by another path.
          if (entryBlocked()) return;
          toast.error(
            started.error.code === "CHALLENGE_NOT_ACCEPTED"
              ? "That challenge is no longer available."
              : started.error.message || "Couldn't start the match.",
          );
          requestPendingChallengeResync();
          return;
        }

        // Before navigating, always: this broadcast is what pulls the
        // challenger off the waiting plate and into the same match. Navigate
        // first and they sit there while we are already in the wizard.
        await broadcast(current.challengeId, "match_started", {
          matchId: started.data.match_id,
        });

        // Entering also declines everyone else waiting on me and withdraws
        // my own challenge if it is still out (the crossing case).
        enterMatch(current.challengeId, started.data.match_id, current.challengerId);
      }),
    [runExclusive, resolveOwnOutgoing, setIncomingBoth, entryBlocked, enterMatch],
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
        // The next challenger queued behind this one gets offered.
        requestPendingChallengeResync();
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
            enterMatch(current.challengeId, started.data.match_id, current.opponentId);
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
        entryBlocked() ||
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
    [entryBlocked, setIncomingBoth],
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

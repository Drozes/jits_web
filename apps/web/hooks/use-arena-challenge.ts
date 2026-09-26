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
  declineOtherPendingChallenges,
  startMatchFromChallenge,
} from "@jits/shared/api/mutations";
import {
  getChallengeStatus,
  getPendingChallengesForAthlete,
  getStartedChallengesToJoin,
} from "@jits/shared/api/queries";
import { ARENA_CHALLENGE_FRESH_MS } from "@jits/shared/constants";
import type { PendingChallenge } from "@jits/shared/types/composites";
import { isFreshChallenge } from "@/lib/arena/challenge-freshness";
import { clearAccepted, readAccepted, writeAccepted } from "@/lib/arena/accepted-record";

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

/** Shown when the insert was refused because the opponent is not in the Arena. */
export const opponentLeftMessage = (name: string) => `${name} just left the Arena.`;

/** Shown when a refused insert cannot be explained. */
export const CHALLENGE_SEND_FAILED_MESSAGE = "Couldn't send that challenge. Try again.";

/** Shown when an accept cannot tell whether my own challenge is still live. */
export const ACCEPT_FAILED_MESSAGE = "Couldn't accept that challenge. Try again.";

/**
 * Shown instead of navigating when an Arena match starts while the athlete is
 * in a session lobby or join wizard (jits-zasq): joining is their tap.
 */
export const ARENA_MATCH_STARTED_MESSAGE = "Your Arena match started";

/** How long the Join toast stays up (the opponent is waiting in the match). */
export const ARENA_JOIN_TOAST_MS = 60_000;

/** Shown when the accepter withdrew my accepted challenge after a failed start. */
export const couldNotStartMessage = (name: string) =>
  `Couldn't start the match with ${name}.`;

/**
 * How long my outgoing challenge may sit at `accepted` before I start the
 * match myself: well past a normal accept-to-start (about a second), short
 * enough that a stranded challenger is not left staring at the bar. Same
 * value as mobile.
 */
export const ACCEPTED_FALLBACK_MS = 12_000;

/**
 * How long after a failed start of my own accepted challenge (the fallback
 * above) I read the row once more: long enough for a start the accepter was
 * making at the same moment to land.
 */
export const START_RETRY_MS = 2_000;

/**
 * How long after `enterMatch` pushed a route a second entry stays refused
 * while the match screen has not reported itself mounted (`inMatch`). Only a
 * fallback: `inMatch` normally takes over within a render, and a push that
 * never mounted must not lock entry forever.
 */
export const ENTRY_SETTLE_MS = 5_000;

/**
 * Statuses in which my outgoing challenge can still turn into a match.
 * Anything else (`declined`, `cancelled`, `expired`) is terminal for the bar.
 */
const LIVE_CHALLENGE_STATUSES = new Set(["pending", "accepted", "started"]);

/** Broadcast channel shared by both parties to a single Arena challenge. */
const channelName = (challengeId: string) => `arena-challenge:${challengeId}`;

/**
 * The incoming `postgres_changes` topic, with a per-build suffix (mobile's
 * `incomingTopic`, same defence as shared `use-pending-challenges.ts`). Not
 * cross-client, so the name is free. realtime-js 2.105.4 `channel(topic)`
 * returns the EXISTING instance while one with that topic is still
 * registered, including one still leaving after `removeChannel`: a remount
 * that overlaps its own teardown (Strict Mode, HMR, a bootstrap re-gate)
 * would bind to the dying instance and go silently deaf once its leave lands.
 */
export const incomingTopic = (athleteId: string, instanceId: string) =>
  `arena-incoming:${athleteId}:${instanceId}`;

type ChallengeEvent = "match_started" | "declined" | "cancelled";

interface ChallengeRow {
  id: string;
  challenger_id: string;
  opponent_id?: string;
  status: string;
  created_at?: string;
  expires_at?: string | null;
}

/**
 * What `offerIncoming` did. `retry`: the surface was busy (another prompt up,
 * a match starting or on screen), offer again on the next pass; `final`: it
 * was answered, withdrawn or entered, never offer it again.
 */
type OfferResult = "raised" | "retry" | "final";

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

/** A pending incoming challenge that is still a LIVE prompt (mobile parity). */
function isFreshPending(c: PendingChallenge, now: number): boolean {
  const expires = Date.parse(c.expiresAt);
  if (Number.isNaN(expires) || expires <= now) return false;
  return isFreshChallenge(c.createdAt, now);
}

/**
 * After entering a match, settle every other challenge that involves me, so
 * nobody is left waiting on someone who is now busy (mobile parity,
 * `settleOthersAfterEntry`):
 *  - my own outgoing that did NOT become this match (the crossing case) is
 *    withdrawn, pending-guarded, and its recipient told;
 *  - every other fresh pending challenge I received is declined and the
 *    challenger told (UPDATE + broadcast), except one from the person I am
 *    now matched with: that is the other half of a crossing pair, withdrawn
 *    quietly so they are not told "declined" on the way into the same match.
 * Best effort and fire-and-forget.
 */
async function settleOthersAfterEntry(
  athleteId: string,
  enteredChallengeId: string,
  peerId: string | null,
  strandedOutgoingId: string | null,
  settled: Set<string>,
): Promise<void> {
  const supabase = createClient();
  if (strandedOutgoingId) {
    const res = await cancelChallenge(supabase, strandedOutgoingId, {
      onlyIfPending: true,
    });
    // Only a row that actually changed was withdrawn; an already-over one
    // has nothing to tell the recipient.
    if (res.ok && res.data.cancelled) {
      await broadcast(null, strandedOutgoingId, "cancelled");
    }
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
    result.data.declined.map((c) => broadcast(null, c.challengeId, "declined")),
  );
}

/**
 * Instant Arena handshake, the web port of
 * `apps/mobile/lib/arena/use-arena-challenge.ts`.
 *
 * Challenge -> live prompt -> accept -> straight into the match wizard, with no
 * inbox round trip. The challenge row still exists (chk_match_origin requires
 * either a challenge_id or a session_id, and Arena matches have no session), it
 * is just never left sitting in a list.
 *
 * Realtime surfaces:
 *  - postgres_changes INSERT on `challenges` filtered to me as opponent, which
 *    raises the incoming prompt, but ONLY while `canReceive` (the athlete is
 *    live and not in a match). While I am entering or in a match it is
 *    declined as busy instead (the peer's own is withdrawn quietly), so its
 *    challenger is not left waiting on a prompt nobody will answer.
 *  - postgres_changes UPDATE on the same filter, which dismisses a prompt once
 *    its row stops being pending, and joins a match the challenger started
 *    for a challenge I accepted but never entered.
 *  - postgres_changes UPDATE filtered to me as challenger, which resolves my
 *    waiting bar: declined, cancelled or expired clears it; `started` enters
 *    it via the idempotent start_match_from_challenge. `accepted` never starts
 *    it (the accepter is creating the match, jits-njyd) but arms a 12s safety
 *    net (`ACCEPTED_FALLBACK_MS`) that starts it if the accepter never does.
 *  - a per-challenge broadcast channel: the accepting side tells the
 *    challenger the match exists, the challenger's cancel tells the recipient.
 *
 * Concurrency (the group demo, mobile parity):
 *  - accepting while my own challenge is out withdraws mine first
 *    (pending-guarded), or joins mine if it already started;
 *  - crossing challenges (A and B challenge each other) tie-break on the
 *    LOWER challenge id as canonical, so both land in ONE match;
 *  - one client never pushes two match routes (`entryRef`).
 *
 * Recovery (mobile parity, `use-pending-challenge-recovery.ts`): on mount, on
 * going live / leaving a match, when the tab comes back and whenever a prompt
 * clears without a match, my pending challenges are read again: my own newest
 * fresh outgoing is put back on the waiting bar, the newest fresh incoming
 * whose challenger is in `lobbyIds` is offered, and my stale outgoing ones are
 * withdrawn.
 */
export function useArenaChallenge({
  athleteId,
  athleteWeight,
  canReceive = true,
  inMatch = false,
  inSessionFlow = false,
  lobbyIds,
}: {
  athleteId: string;
  athleteWeight: number | null;
  canReceive?: boolean;
  /** A match screen is mounted: nothing is restored or joined behind it. */
  inMatch?: boolean;
  /**
   * The athlete is in a session lobby or join wizard (an immersive route that
   * is not a match screen, jits-zasq). Entering one withdraws my own pending
   * outgoing challenge, and a match that starts anyway is offered as a Join
   * toast instead of pushed, so the Arena never races the session flow.
   */
  inSessionFlow?: boolean;
  /**
   * Athlete ids in `lobby:online`. A pending incoming challenge found by a
   * read is offered only when its challenger is here; without it, only the
   * realtime INSERT raises prompts.
   */
  lobbyIds?: ReadonlySet<string>;
}) {
  const router = useRouter();
  const [incoming, setIncomingState] = useState<IncomingChallenge | null>(null);
  const [outgoing, setOutgoingState] = useState<OutgoingChallenge | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [candidates, setCandidates] = useState<PendingChallenge[]>([]);
  /** Re-runs the offer pass after an offer turned out final. */
  const [offerPass, setOfferPass] = useState(0);
  const busyRef = useRef(false);
  const outgoingChannelRef = useRef<RealtimeChannel | null>(null);
  const incomingChannelRef = useRef<RealtimeChannel | null>(null);
  const canReceiveRef = useRef(canReceive);
  canReceiveRef.current = canReceive;
  const inMatchRef = useRef(inMatch);
  inMatchRef.current = inMatch;
  const inSessionFlowRef = useRef(inSessionFlow);
  inSessionFlowRef.current = inSessionFlow;
  /** Matches already offered as a Join toast; one toast per challenge. */
  const joinOfferedRef = useRef<Set<string>>(new Set());
  const weightRef = useRef(athleteWeight);
  weightRef.current = athleteWeight;
  const athleteIdRef = useRef(athleteId);
  athleteIdRef.current = athleteId;
  /** Challenges this instance already resolved; never restored or offered again. */
  const settledRef = useRef<Set<string>>(new Set());
  // Mirrors of state for realtime handlers, which must not read stale closures.
  const incomingRef = useRef<IncomingChallenge | null>(null);
  const outgoingRef = useRef<OutgoingChallenge | null>(null);
  /** The challenge being accepted right now; its own UPDATE must not clear it. */
  const acceptingIdRef = useRef<string | null>(null);
  /** Last challenge we navigated for: broadcast and UPDATE can both land. */
  const enteredForRef = useRef<string | null>(null);
  /** Every challenge this instance entered a match for. */
  const enteredIdsRef = useRef<Set<string>>(new Set());
  /**
   * A match route this instance pushed that has not reported itself mounted
   * yet (`inMatch`). Together with `inMatch` it makes entry exclusive.
   */
  const entryRef = useRef<{ challengeId: string; at: number } | null>(null);
  /**
   * The athlete in the match I am entering or in, until I leave it. A
   * challenge from them meanwhile is the late other half of a crossing pair,
   * withdrawn quietly, never "declined".
   */
  const entryPeerRef = useRef<string | null>(null);
  /** Challenges I accepted and have not entered yet (the challenger may start it). */
  const acceptedNotEnteredRef = useRef<Set<string>>(new Set());
  /** My outgoing challenges I have seen at `accepted`. */
  const acceptedSeenRef = useRef<Set<string>>(new Set());
  /** My outgoing challenges I cancelled myself: their end is never news. */
  const selfCancelledRef = useRef<Set<string>>(new Set());
  /** Incoming challenges whose prompt this instance raised from a read. */
  const offeredRef = useRef<Set<string>>(new Set());
  /** Offers still waiting on their challenger read; never doubled up. */
  const offeringRef = useRef<Set<string>>(new Set());

  const setIncoming = useCallback((next: IncomingChallenge | null) => {
    incomingRef.current = next;
    setIncomingState(next);
  }, []);
  const setOutgoing = useCallback((next: OutgoingChallenge | null) => {
    outgoingRef.current = next;
    setOutgoingState(next);
  }, []);

  const entryBlocked = useCallback(
    () =>
      inMatchRef.current ||
      (entryRef.current !== null &&
        Date.now() - entryRef.current.at < ENTRY_SETTLE_MS),
    [],
  );

  /** Read pending challenges again (a prompt cleared without a match). */
  const recoverRef = useRef<() => Promise<void>>(async () => {});
  const resync = useCallback(() => {
    if (!inMatchRef.current) void recoverRef.current();
  }, []);

  // Going offline or into a match drops an unanswered prompt (the row stays
  // pending; it is not declined on the athlete's behalf, and recovery offers
  // it again later if it is still fresh).
  useEffect(() => {
    if (!canReceive) setIncoming(null);
  }, [canReceive, setIncoming]);

  /**
   * Navigate into the match for `challengeId`, once. `peerId` is the other
   * athlete in it: a pending challenge from them is the other half of a
   * crossing pair and is withdrawn quietly rather than declined.
   */
  const enterMatchNow = useCallback(
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
      entryPeerRef.current = peerId;
      enteredIdsRef.current.add(challengeId);
      acceptedNotEnteredRef.current.delete(challengeId);
      clearAccepted(athleteIdRef.current);
      settledRef.current.add(challengeId);
      // My own challenge that did not become this match is over too. Settled
      // now, so recovery cannot put its bar back while it is withdrawn.
      const mine = outgoingRef.current;
      const stranded = mine && mine.challengeId !== challengeId ? mine.challengeId : null;
      if (stranded) settledRef.current.add(stranded);
      setIncoming(null);
      setOutgoing(null);
      router.push(`/arena/match/${matchId}`);
      void settleOthersAfterEntry(
        athleteIdRef.current,
        challengeId,
        peerId,
        stranded,
        settledRef.current,
      );
    },
    [router, entryBlocked, setIncoming, setOutgoing],
  );

  /**
   * Every automatic entry goes through here. In a session lobby or join
   * wizard it does not navigate (that would race the session flow's own
   * push, jits-zasq): the waiting bar goes and a Join toast offers the match.
   */
  const enterMatch = useCallback(
    (challengeId: string, matchId: string, peerId: string | null) => {
      if (!inSessionFlowRef.current) {
        enterMatchNow(challengeId, matchId, peerId);
        return;
      }
      if (
        enteredForRef.current === challengeId ||
        joinOfferedRef.current.has(challengeId)
      ) {
        return;
      }
      joinOfferedRef.current.add(challengeId);
      settledRef.current.add(challengeId);
      if (outgoingRef.current?.challengeId === challengeId) setOutgoing(null);
      toast.info(ARENA_MATCH_STARTED_MESSAGE, {
        id: `arena-join:${challengeId}`,
        duration: ARENA_JOIN_TOAST_MS,
        action: {
          label: "Join",
          onClick: () => enterMatchNow(challengeId, matchId, peerId),
        },
      });
    },
    [enterMatchNow, setOutgoing],
  );

  /**
   * My outgoing challenge is over without a match: drop the waiting bar.
   * `toastMessage` is null for a quiet end (my own cancel, a sweep).
   */
  const endOutgoing = useCallback(
    (challengeId: string, toastMessage: string | null) => {
      settledRef.current.add(challengeId);
      if (outgoingRef.current?.challengeId !== challengeId) return;
      setOutgoing(null);
      if (toastMessage) toast.info(toastMessage);
    },
    [setOutgoing],
  );

  /** Why my outgoing challenge ended, as a toast (null for a quiet end). */
  const outgoingEndedToast = useCallback(
    (challengeId: string, status: string, opponentName: string): string | null => {
      if (status === "declined") return `${opponentName} declined.`;
      if (
        status === "cancelled" &&
        acceptedSeenRef.current.has(challengeId) &&
        !selfCancelledRef.current.has(challengeId)
      ) {
        return couldNotStartMessage(opponentName);
      }
      return null;
    },
    [],
  );

  /**
   * An INSERT that landed while I am entering or in a match. From the athlete
   * I am matched with, it is the late other half of a crossing pair,
   * withdrawn quietly; anyone else is declined as busy and told, so their
   * bar clears instead of waiting on me.
   */
  const settleBusyInsert = useCallback((row: ChallengeRow) => {
    if (settledRef.current.has(row.id)) return;
    settledRef.current.add(row.id);
    const supabase = createClient();
    if (row.challenger_id === entryPeerRef.current) {
      void cancelChallenge(supabase, row.id, { onlyIfPending: true });
      return;
    }
    void declineChallenge(supabase, row.id).then((result) => {
      if (result.ok) void broadcast(null, row.id, "declined");
    });
  }, []);

  // --- The challenger's safety nets ----------------------------------------
  const scheduleAcceptedFallbackRef = useRef<(challengeId: string) => void>(() => {});
  const scheduleStartRetryRef = useRef<(challengeId: string) => void>(() => {});
  /** Outgoing challenges whose fallback was re-armed after a retry. */
  const fallbackRearmedRef = useRef<Set<string>>(new Set());

  /**
   * Re-read my outgoing challenge's row and act on it: the recovery for a
   * challenger that missed the realtime UPDATE and the broadcast. Only
   * `started` enters: on `accepted` the accepter is mid-way through starting
   * it (jits-njyd). `mode`: "read" is the plain re-read; "fallback" also
   * starts a row still at `accepted`; "retry" is the single re-read after a
   * failed start, which arms nothing further, so it cannot loop.
   */
  const recheckOutgoing = useCallback(
    async (challengeId: string, mode: "read" | "fallback" | "retry" = "read") => {
      const mine = outgoingRef.current;
      if (!mine || mine.challengeId !== challengeId) return;
      const supabase = createClient();
      const read = await getChallengeStatus(supabase, challengeId);
      if (!read.ok || !read.data) return;
      if (outgoingRef.current?.challengeId !== challengeId) return;
      const { status } = read.data;
      if (status === "accepted") acceptedSeenRef.current.add(challengeId);
      if (status === "started" || (status === "accepted" && mode === "fallback")) {
        const started = await startMatchFromChallenge(supabase, challengeId);
        if (started.ok) {
          enterMatch(challengeId, started.data.match_id, mine.opponentId);
          return;
        }
        // Most likely the accepter was starting it at the same moment, or
        // withdrew it: read once more shortly and follow the row.
        if (mode !== "retry") scheduleStartRetryRef.current(challengeId);
        return;
      }
      if (status === "accepted") {
        if (mode !== "retry") {
          scheduleAcceptedFallbackRef.current(challengeId);
        } else if (!fallbackRearmedRef.current.has(challengeId)) {
          fallbackRearmedRef.current.add(challengeId);
          scheduleAcceptedFallbackRef.current(challengeId);
        }
        return;
      }
      if (!LIVE_CHALLENGE_STATUSES.has(status)) {
        endOutgoing(challengeId, outgoingEndedToast(challengeId, status, mine.opponentName));
      }
    },
    [enterMatch, endOutgoing, outgoingEndedToast],
  );
  const recheckOutgoingRef = useRef(recheckOutgoing);
  recheckOutgoingRef.current = recheckOutgoing;

  /**
   * Safety net for my challenge sitting at `accepted`: normally the accepter
   * starts it within a second. If its start failed or its tab died, one
   * re-read `ACCEPTED_FALLBACK_MS` later that still finds `accepted` starts
   * it from here (the RPC is idempotent).
   */
  const acceptedFallbackRef = useRef<{
    challengeId: string;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  scheduleAcceptedFallbackRef.current = (challengeId: string) => {
    if (acceptedFallbackRef.current?.challengeId === challengeId) return;
    if (acceptedFallbackRef.current) clearTimeout(acceptedFallbackRef.current.timer);
    const timer = setTimeout(() => {
      acceptedFallbackRef.current = null;
      void recheckOutgoingRef.current(challengeId, "fallback");
    }, ACCEPTED_FALLBACK_MS);
    acceptedFallbackRef.current = { challengeId, timer };
  };

  /** The one re-read after a failed start of my outgoing (`START_RETRY_MS`). */
  const startRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  scheduleStartRetryRef.current = (challengeId: string) => {
    if (startRetryRef.current) clearTimeout(startRetryRef.current);
    startRetryRef.current = setTimeout(() => {
      startRetryRef.current = null;
      void recheckOutgoingRef.current(challengeId, "retry");
    }, START_RETRY_MS);
  };

  useEffect(
    () => () => {
      if (acceptedFallbackRef.current) clearTimeout(acceptedFallbackRef.current.timer);
      acceptedFallbackRef.current = null;
      if (startRetryRef.current) clearTimeout(startRetryRef.current);
      startRetryRef.current = null;
    },
    [],
  );

  /**
   * The `started` UPDATE for a challenge I accepted but never entered (my
   * start failed, or its reply was lost): the challenger's fallback started
   * it, so ask for that match and join it. Left to `accept` while it runs.
   */
  const joinAccepted = useCallback(
    async (challengeId: string, challengerId: string) => {
      if (busyRef.current || enteredIdsRef.current.has(challengeId)) return;
      const started = await startMatchFromChallenge(createClient(), challengeId);
      if (started.ok) enterMatch(challengeId, started.data.match_id, challengerId);
    },
    [enterMatch],
  );

  /**
   * Back into a match the challenger started without me (jits-itjn, mobile's
   * `rejoinStartedMatch`). I accepted, then my tab reloaded (or lost the
   * network) before my start or its broadcast went out; the challenger's
   * `ACCEPTED_FALLBACK_MS` safety net started the match alone, and nothing in
   * this fresh instance knows. So check the ONE challenge persisted on accept
   * (`lib/arena/accepted-record.ts`) and never entered. It is joined only when:
   *  - it is within the live window (`ARENA_CHALLENGE_FRESH_MS`) of my accept;
   *  - the server says it is `started`, its match is still `pending`, and the
   *    challenger (not I) started it, see `getStartedChallengesToJoin`;
   *  - this instance never entered it, and no accept, prompt or match screen
   *    is in the way.
   * Entering any match clears the record, so a match left on purpose is never
   * joined again. In a session lobby or join wizard `enterMatch` offers it as
   * a Join toast rather than navigating (jits-zasq).
   */
  const rejoinStartedMatch = useCallback(async () => {
    const me = athleteIdRef.current;
    const blocked = () => busyRef.current || entryBlocked() || !!incomingRef.current;
    if (!me || blocked()) return;
    const stored = readAccepted(me);
    if (!stored) return;
    if (
      Date.now() - stored.at > ARENA_CHALLENGE_FRESH_MS ||
      enteredIdsRef.current.has(stored.challengeId)
    ) {
      clearAccepted(me);
      return;
    }
    const since = new Date(Date.now() - ARENA_CHALLENGE_FRESH_MS).toISOString();
    const read = await getStartedChallengesToJoin(createClient(), me, since);
    if (!read.ok) return;
    // Not there (yet): the challenger's fallback may still be counting down,
    // so the record stays until it goes stale or a later check finds it.
    const pick = read.data.find((c) => c.challengeId === stored.challengeId);
    if (!pick || blocked()) return;
    enterMatch(pick.challengeId, pick.matchId, pick.challengerId);
  }, [entryBlocked, enterMatch]);
  const rejoinRef = useRef(rejoinStartedMatch);
  rejoinRef.current = rejoinStartedMatch;

  // On mount, but only once the tab is actually visible (a tab restored in
  // the background must not navigate), and on every return to the tab.
  useEffect(() => {
    if (!athleteId || document.visibilityState === "hidden") return;
    void rejoinRef.current();
  }, [athleteId]);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void rejoinRef.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

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
    for (const c of swept.data.cancelled) settledRef.current.add(c.challengeId);
    // The Arena roster marks already-challenged athletes from a server read.
    router.refresh();
    return swept.data.cancelled.length;
  }, [athleteId, router]);

  /**
   * Read my pending challenges once: put my newest fresh outgoing back on the
   * waiting bar if the bar is empty (a reload loses it), keep the fresh
   * incoming ones as prompt candidates, then withdraw my stale outgoing ones
   * from the same read.
   */
  const recover = useCallback(async (): Promise<void> => {
    if (!athleteId) return;
    const supabase = createClient();
    const read = await getPendingChallengesForAthlete(supabase, athleteId);
    if (!read.ok) {
      await sweepStale();
      return;
    }
    const now = Date.now();
    // Both lists arrive newest first; `expires_at` is already filtered.
    setCandidates(read.data.incoming.filter((c) => isFreshPending(c, now)));
    const mine = read.data.outgoing.find(
      (c) => c.challengerId === athleteId && isFreshChallenge(c.createdAt, now),
    );
    if (
      mine &&
      !outgoingRef.current &&
      // A send, accept or cancel in flight decides the bar itself.
      !busyRef.current &&
      !entryBlocked() &&
      // Entering a session flow withdrew it; never bring it back there.
      !inSessionFlowRef.current &&
      !settledRef.current.has(mine.challengeId) &&
      enteredForRef.current !== mine.challengeId
    ) {
      setOutgoing({
        challengeId: mine.challengeId,
        opponentId: mine.opponentId,
        opponentName: mine.opponentName,
      });
    }
    const swept = await cancelStaleOutgoingChallenges(supabase, athleteId, {
      keepChallengeId: outgoingRef.current?.challengeId ?? null,
      outgoing: read.data.outgoing,
      now,
    });
    // The Arena roster marks already-challenged athletes from a server read.
    if (swept.ok && swept.data.cancelled.length > 0) {
      for (const c of swept.data.cancelled) settledRef.current.add(c.challengeId);
      router.refresh();
    }
  }, [athleteId, router, entryBlocked, setOutgoing, sweepStale]);
  recoverRef.current = recover;

  // On mount, on going live / leaving a match, and when the tab comes back.
  useEffect(() => {
    void recoverRef.current();
  }, [athleteId, canReceive, inMatch]);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void recoverRef.current();
      // The accept broadcast and the status UPDATE may both have been missed
      // while the tab was hidden.
      const mine = outgoingRef.current;
      if (mine) void recheckOutgoingRef.current(mine.challengeId);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // The match screen is up: `inMatch` guards entry from here. Leaving a match
  // forgets the peer, lets a dropped prompt be offered again, and re-reads a
  // bar still up (its events may have landed while I was busy).
  const wasInMatchRef = useRef(inMatch);
  useEffect(() => {
    if (inMatch) entryRef.current = null;
    if (inMatch === wasInMatchRef.current) return;
    wasInMatchRef.current = inMatch;
    if (inMatch) return;
    entryPeerRef.current = null;
    offeredRef.current.clear();
    const mine = outgoingRef.current;
    if (mine) void recheckOutgoingRef.current(mine.challengeId);
  }, [inMatch]);

  // Entering a session lobby or join wizard withdraws my own pending
  // challenge (pending-guarded, and its recipient told), so its accept cannot
  // pull me out of the session flow (jits-zasq). If it is already past
  // pending, the row decides: `started` is offered as a Join toast (see
  // `enterMatch`), `accepted` keeps waiting for the accepter's broadcast.
  useEffect(() => {
    if (!inSessionFlow) return;
    const mine = outgoingRef.current;
    if (!mine) return;
    const id = mine.challengeId;
    void (async () => {
      selfCancelledRef.current.add(id);
      const res = await cancelChallenge(createClient(), id, { onlyIfPending: true });
      if (!res.ok) {
        selfCancelledRef.current.delete(id);
        return;
      }
      if (res.data.cancelled) {
        await broadcast(outgoingChannelRef.current, id, "cancelled");
        endOutgoing(id, null);
        return;
      }
      selfCancelledRef.current.delete(id);
      void recheckOutgoingRef.current(id);
    })();
  }, [inSessionFlow, endOutgoing]);

  /**
   * Raise the prompt for a challenge found by a read rather than by the
   * realtime INSERT. See `OfferResult`.
   */
  const offerIncoming = useCallback(
    async (challengeId: string, challengerId: string): Promise<OfferResult> => {
      const check = (): OfferResult | null => {
        if (
          settledRef.current.has(challengeId) ||
          enteredForRef.current === challengeId
        ) {
          return "final";
        }
        if (entryBlocked() || incomingRef.current || !canReceiveRef.current) {
          return "retry";
        }
        return null;
      };
      const before = check();
      if (before) return before;
      // The candidate list can be a read old: the challenger may have
      // withdrawn it since (while the tab was hidden, say, with the UPDATE
      // missed). Only a row still pending is offered.
      const supabase = createClient();
      const status = await getChallengeStatus(supabase, challengeId);
      if (!status.ok) return "retry";
      if (status.data?.status !== "pending") {
        settledRef.current.add(challengeId);
        return "final";
      }
      const { data } = await supabase
        .from("athletes")
        .select("display_name")
        .eq("id", challengerId)
        .single();
      // Re-checked after the read: the INSERT or an answer can land meanwhile.
      const after = check();
      if (after) return after;
      setIncoming({
        challengeId,
        challengerId,
        challengerName: data?.display_name ?? "An athlete",
      });
      return "raised";
    },
    [entryBlocked, setIncoming],
  );

  // Offer at most one: the newest candidate whose challenger is still in the
  // lobby. Re-evaluated as presence syncs (the lobby is usually still empty
  // on the first render) and whenever the prompt clears.
  useEffect(() => {
    if (!lobbyIds || !canReceive || incoming) return;
    const now = Date.now();
    // Answered, withdrawn or entered ones are skipped here, so one cannot sit
    // at the head of the list blocking the challenger queued behind it.
    const pick = candidates.find(
      (c) =>
        !offeredRef.current.has(c.challengeId) &&
        !offeringRef.current.has(c.challengeId) &&
        !settledRef.current.has(c.challengeId) &&
        lobbyIds.has(c.challengerId) &&
        isFreshPending(c, now),
    );
    if (!pick) return;
    const id = pick.challengeId;
    offeringRef.current.add(id);
    void offerIncoming(id, pick.challengerId)
      .then((outcome) => {
        if (outcome === "retry") return;
        offeredRef.current.add(id);
        // Settled meanwhile: look at the next candidate now, not on the next
        // presence sync.
        if (outcome === "final") setOfferPass((n) => n + 1);
      })
      .finally(() => {
        offeringRef.current.delete(id);
      });
  }, [candidates, lobbyIds, canReceive, incoming, offerIncoming, offerPass]);

  // --- Realtime: challenges involving me ------------------------------------
  useEffect(() => {
    if (!athleteId) return;
    const supabase = createClient();
    const channel = supabase
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
          if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) return;
          if (settledRef.current.has(row.id)) return;
          // Entering or in a match: I am busy, so the challenger is told now
          // rather than left waiting on a prompt nobody will answer.
          if (entryBlocked()) {
            settleBusyInsert(row);
            return;
          }
          // Offline: no live prompt. Another prompt up: the first keeps the
          // surface rather than being replaced mid-decision.
          const skip = () =>
            !canReceiveRef.current ||
            !!incomingRef.current ||
            settledRef.current.has(row.id);
          if (skip()) return;

          const { data: challenger } = await supabase
            .from("athletes")
            .select("display_name")
            .eq("id", row.challenger_id)
            .single();
          // Re-checked: a match, offline, or another prompt may have landed.
          if (entryBlocked()) {
            settleBusyInsert(row);
            return;
          }
          if (skip()) return;

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
          const row = payload.new as ChallengeRow;
          if (row.status === "pending") return;
          settledRef.current.add(row.id);
          // One I accepted but never entered, now started by the challenger's
          // fallback: join it. Any other end means there is nothing to join.
          if (acceptedNotEnteredRef.current.has(row.id)) {
            if (row.status === "started") {
              void joinAccepted(row.id, row.challenger_id);
            } else if (row.status !== "accepted") {
              acceptedNotEnteredRef.current.delete(row.id);
              clearAccepted(athleteId);
            }
          } else if (
            row.status === "started" &&
            readAccepted(athleteId)?.challengeId === row.id
          ) {
            // The challenger's fallback started one I accepted before a
            // reload: the same narrow rejoin check decides (jits-itjn).
            void rejoinRef.current();
          }
          // My own accept flips the row to accepted before the match exists.
          if (acceptingIdRef.current === row.id) return;
          if (incomingRef.current?.challengeId === row.id) {
            setIncoming(null);
            // Not for an accept landing: a re-read could raise the next
            // prompt under the navigation.
            if (!LIVE_CHALLENGE_STATUSES.has(row.status)) resync();
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
          if (mine?.challengeId !== row.id) {
            // Not on my bar: the bar was lost to a reload. Only a fresh
            // "started" row of mine is still worth joining (the opponent is
            // in the match waiting), and never behind a match on screen.
            if (
              row.status !== "started" ||
              row.challenger_id !== athleteId ||
              !isFreshChallenge(row.created_at) ||
              inMatchRef.current ||
              settledRef.current.has(row.id)
            ) {
              return;
            }
            const started = await startMatchFromChallenge(supabase, row.id);
            if (started.ok) {
              enterMatch(row.id, started.data.match_id, row.opponent_id ?? null);
            }
            return;
          }
          if (!LIVE_CHALLENGE_STATUSES.has(row.status)) {
            endOutgoing(row.id, outgoingEndedToast(row.id, row.status, mine.opponentName));
            return;
          }
          // Fallback when the match_started broadcast never arrived. Only
          // "started": on "accepted" the accepter is creating the match.
          if (row.status === "started") {
            const started = await startMatchFromChallenge(supabase, row.id);
            if (started.ok) {
              enterMatch(row.id, started.data.match_id, mine.opponentId);
            } else {
              scheduleStartRetryRef.current(row.id);
            }
            return;
          }
          if (row.status === "accepted") {
            // Wait for the accepter, with a safety net if its start never lands.
            acceptedSeenRef.current.add(row.id);
            scheduleAcceptedFallbackRef.current(row.id);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [
    athleteId,
    enterMatch,
    endOutgoing,
    entryBlocked,
    joinAccepted,
    outgoingEndedToast,
    resync,
    setIncoming,
    settleBusyInsert,
  ]);

  // --- Incoming: the challenger may withdraw -------------------------------
  const incomingId = incoming?.challengeId;
  useEffect(() => {
    if (!incomingId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(channelName(incomingId))
      .on("broadcast", { event: "cancelled" }, () => {
        if (acceptingIdRef.current === incomingId) return;
        settledRef.current.add(incomingId);
        if (incomingRef.current?.challengeId !== incomingId) return;
        setIncoming(null);
        resync();
      })
      .subscribe();
    incomingChannelRef.current = channel;
    return () => {
      incomingChannelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [incomingId, setIncoming, resync]);

  // --- Outgoing: wait for my challenge to be accepted -----------------------
  const outgoingId = outgoing?.challengeId;
  const outgoingName = outgoing?.opponentName;
  const outgoingPeer = outgoing?.opponentId ?? null;
  useEffect(() => {
    if (!outgoingId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(channelName(outgoingId))
      .on("broadcast", { event: "match_started" }, ({ payload }) => {
        const matchId = (payload as { matchId?: string })?.matchId;
        if (matchId) enterMatch(outgoingId, matchId, outgoingPeer);
      })
      .on("broadcast", { event: "declined" }, () => {
        endOutgoing(outgoingId, `${outgoingName ?? "Your opponent"} declined.`);
      })
      // Every SUBSCRIBED re-reads the row: the first closes the window between
      // the insert and this listener, a rejoin may have missed the broadcast.
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void recheckOutgoingRef.current(outgoingId);
      });

    outgoingChannelRef.current = channel;
    return () => {
      outgoingChannelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [outgoingId, outgoingName, outgoingPeer, enterMatch, endOutgoing]);

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

  /**
   * Work out what a refused insert means before saying anything (port of
   * mobile's `explainRefusedInsert`). `mapPostgrestError` maps EVERY 42501 on
   * this insert to MAX_PENDING_CHALLENGES, but `challenges_insert` also
   * refuses when the opponent is not `looking_for_ranked`
   * (`opponent_accepts_match_type`): they left the Arena after the roster
   * loaded, or were challenged from their profile while not live. The
   * opponent's row decides; when it cannot be read, the cap is NOT asserted.
   */
  const explainRefusedInsert = useCallback(
    async (
      supabase: ReturnType<typeof createClient>,
      opponentId: string,
      opponentName: string,
    ) => {
      const { data, error } = await supabase
        .from("athletes")
        .select("looking_for_ranked, status")
        .eq("id", opponentId)
        .maybeSingle();
      if (error || !data) {
        toast.error(CHALLENGE_SEND_FAILED_MESSAGE);
        return;
      }
      if (data.looking_for_ranked !== true || data.status !== "active") {
        toast.info(opponentLeftMessage(opponentName));
        return;
      }
      toast.error(CHALLENGE_CAP_MESSAGE);
    },
    [],
  );

  const sendChallenge = useCallback(
    (opponentId: string, opponentName: string) =>
      runExclusive(async () => {
        const supabase = createClient();
        const create = () =>
          createChallenge(supabase, {
            opponentId,
            matchType: "ranked", // ranked-only product
            challengerWeight: weightRef.current ?? undefined,
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
          if (result.error.code === "MAX_PENDING_CHALLENGES") {
            await explainRefusedInsert(supabase, opponentId, opponentName);
            return;
          }
          toast.error(result.error.message || "Couldn't send that challenge.");
          return;
        }
        setOutgoing({ challengeId: result.data.id, opponentId, opponentName });
      }),
    [runExclusive, setOutgoing, sweepStale, explainRefusedInsert],
  );

  /**
   * I am accepting `current` while my own challenge `mine` is still out
   * (mobile parity). Mine is withdrawn FIRST, pending-guarded, so nobody can
   * accept it while I walk into a different match. When no row changed, mine
   * is already past pending, and its status decides:
   *  - `started`: its match exists, so I join THAT one;
   *  - `accepted`: the other side is starting it right now and its broadcast
   *    (or the `started` UPDATE) takes me in, so I let go of `current` and
   *    keep waiting (starting it here would be the jits-njyd race);
   *  - anything else: mine is over without a match, and the accept goes on.
   * Resolves "proceed" to go on accepting `current`, "stop" when finished.
   */
  const resolveOwnOutgoing = useCallback(
    async (
      mine: OutgoingChallenge,
      current: IncomingChallenge,
    ): Promise<"proceed" | "stop"> => {
      const supabase = createClient();
      const crossing = mine.opponentId === current.challengerId;
      const withdrawn = await cancelChallenge(supabase, mine.challengeId, {
        onlyIfPending: true,
      });
      if (!withdrawn.ok) {
        // Unknown whether mine is still live: accepting now could put me in
        // two matches. Keep the prompt, the athlete can try again.
        toast.error(ACCEPT_FAILED_MESSAGE);
        return "stop";
      }
      if (withdrawn.data.cancelled) {
        // Tell its recipient, so their prompt goes, then drop my bar quietly.
        await broadcast(outgoingChannelRef.current, mine.challengeId, "cancelled");
        endOutgoing(mine.challengeId, null);
        return "proceed";
      }

      const read = await getChallengeStatus(supabase, mine.challengeId);
      if (!read.ok) {
        toast.error(ACCEPT_FAILED_MESSAGE);
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
        acceptedSeenRef.current.add(mine.challengeId);
        scheduleAcceptedFallbackRef.current(mine.challengeId);
        settledRef.current.add(current.challengeId);
        if (crossing) {
          // The other half of a crossing pair: its sender is walking into a
          // match with me, so it is withdrawn quietly, never "declined".
          await cancelChallenge(supabase, current.challengeId, { onlyIfPending: true });
        } else {
          const declined = await declineChallenge(supabase, current.challengeId);
          // On the prompt's own channel, while it is still up (see `broadcast`).
          if (declined.ok) {
            await broadcast(incomingChannelRef.current, current.challengeId, "declined");
          }
        }
        setIncoming(null);
        return "stop";
      }

      // Quietly: I am walking into a different match.
      endOutgoing(mine.challengeId, null);
      return "proceed";
    },
    [endOutgoing, enterMatch, setIncoming],
  );

  const accept = useCallback(
    () =>
      runExclusive(async () => {
        const current = incomingRef.current;
        if (!current) return;
        const supabase = createClient();
        acceptingIdRef.current = current.challengeId;
        try {
          // Crossing challenges: A challenged B and B challenged A, and both
          // may tap Accept at once. One tie-break both clients compute the
          // same way: the LOWER challenge id is canonical. Its recipient
          // accepts it straight away; the other side withdraws the canonical
          // one first (pending-guarded). Exactly one of those two writes wins
          // the row, and each outcome leaves exactly one match both reach.
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
              accepted.error.code === "CHALLENGE_NOT_ACCEPTED"
                ? CHALLENGE_GONE_MESSAGE
                : accepted.error.message || "Couldn't accept that challenge.",
            );
            settledRef.current.add(current.challengeId);
            setIncoming(null);
            resync();
            return;
          }
          // Until I am in its match: if my start below never lands, the
          // challenger's fallback starts it and its `started` UPDATE brings
          // me in.
          acceptedNotEnteredRef.current.add(current.challengeId);
          writeAccepted(athleteIdRef.current, {
            challengeId: current.challengeId,
            at: Date.now(),
          });

          // acceptChallenge filters on status = 'pending' and a no-row update
          // is not an error, so a withdrawn challenge surfaces here as
          // not_accepted. That can also be a lost race with the challenger's
          // own start (jits-njyd): the row lock made my call re-read
          // `started`, and once more finds the match. Any other failure
          // (network) gets the same one retry; the RPC is idempotent.
          let started = await startMatchFromChallenge(supabase, current.challengeId);
          if (!started.ok) {
            started = await startMatchFromChallenge(supabase, current.challengeId);
          }
          if (!started.ok && started.error.code !== "CHALLENGE_NOT_ACCEPTED") {
            // Accepted but could not start it: left alone the row sits at
            // `accepted` and the challenger waits on me. Withdraw it so their
            // UPDATE clears the bar. No row changed means it is not `accepted`
            // any more: most likely my start DID land and only its reply was
            // lost, so ask once more for the match that now exists.
            const withdrawn = await cancelChallenge(supabase, current.challengeId);
            if (withdrawn.ok && withdrawn.data.cancelled) {
              acceptedNotEnteredRef.current.delete(current.challengeId);
              clearAccepted(athleteIdRef.current);
            }
            if (withdrawn.ok && !withdrawn.data.cancelled) {
              started = await startMatchFromChallenge(supabase, current.challengeId);
            }
          }
          if (!started.ok) {
            settledRef.current.add(current.challengeId);
            setIncoming(null);
            // Crossing, and the other side won the canonical row by
            // withdrawing it to accept mine instead: its broadcast is on its
            // way to my bar, so there is nothing to apologise for.
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
                ? CHALLENGE_GONE_MESSAGE
                : started.error.message || "Couldn't start the match.",
            );
            resync();
            return;
          }

          // Tell the challenger before navigating, so both land together.
          await broadcast(
            incomingChannelRef.current,
            current.challengeId,
            "match_started",
            { matchId: started.data.match_id },
          );

          // Entering also declines everyone else waiting on me and withdraws
          // my own challenge if it is still out (the crossing case).
          enterMatch(current.challengeId, started.data.match_id, current.challengerId);
        } finally {
          acceptingIdRef.current = null;
        }
      }),
    [runExclusive, resolveOwnOutgoing, entryBlocked, enterMatch, setIncoming, resync],
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
        settledRef.current.add(current.challengeId);
        await broadcast(
          incomingChannelRef.current,
          current.challengeId,
          "declined",
        );
        setIncoming(null);
        // The next challenger queued behind this one gets offered.
        resync();
      }),
    [runExclusive, setIncoming, resync],
  );

  const cancelOutgoing = useCallback(
    () =>
      runExclusive(async () => {
        const current = outgoingRef.current;
        if (!current) return;
        const supabase = createClient();
        selfCancelledRef.current.add(current.challengeId);
        const result = await cancelChallenge(supabase, current.challengeId);
        if (!result.ok) {
          // Keep the bar: the challenge is still live server-side.
          toast.error("Couldn't cancel that challenge. Try again.");
          return;
        }
        if (!result.data.cancelled) {
          // No row changed (a 0-row update is not an error): the challenge
          // was already over, or the opponent has just started the match.
          // start_match_from_challenge is idempotent and returns the existing
          // match, so join it rather than leave the opponent in it alone
          // (mirrors mobile). Nothing was withdrawn, so nothing to broadcast.
          const started = await startMatchFromChallenge(
            supabase,
            current.challengeId,
          );
          if (started.ok) {
            enterMatch(current.challengeId, started.data.match_id, current.opponentId);
            return;
          }
          endOutgoing(current.challengeId, null);
          return;
        }
        await broadcast(
          outgoingChannelRef.current,
          current.challengeId,
          "cancelled",
        );
        endOutgoing(current.challengeId, null);
      }),
    [runExclusive, endOutgoing, enterMatch],
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

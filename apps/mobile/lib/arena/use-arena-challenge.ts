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
 *  - one client never pushes two match screens (`entryRef`);
 *  - an accepter whose app died or lost the network right after accepting
 *    finds its way back into the match the challenger started alone
 *    (`rejoinStartedMatch`).
 */
import * as React from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
import {
  getChallengeStatus,
  getStartedChallengesToJoin,
} from "@jits/shared/api/queries";
import { ARENA_CHALLENGE_FRESH_MS } from "@jits/shared/constants";
import { toast } from "@/components/ui/toast";
import { supabase } from "../supabase/client";
import {
  CHALLENGER_LEFT_GRACE_MS,
  arenaMatchHref,
  challengeTopic,
  incomingTopic,
} from "./constants";
import {
  countWaitingIncoming,
  freshDeadline,
  isFreshIncoming,
  isServerClockEstablished,
  noteServerTime,
  CLOCK_RESUME_SETTLE_MS,
  mergeIncomingRead,
  nextDeadline,
  pruneLapsed,
  type KnownIncoming,
} from "./incoming-challenges";
import { requestPendingChallengeResync } from "./use-pending-challenge-recovery";
import { notifyIncomingChallengeEnded } from "./arena-store";
import { superviseChannel, type SupervisedChannel } from "../supabase/supervise-channel";

export interface IncomingChallenge {
  challengeId: string;
  challengerId: string;
  challengerName: string;
  challengerElo: number | null;
  challengerWeight: number | null;
  /**
   * The row's `created_at` (server time), or null when it could not be read.
   * The prompt's freshness countdown and the chip's `! ALEX · 8:41` run to
   * 10 minutes after it (`ARENA_CHALLENGE_FRESH_MS`), and the prompt clears
   * itself when that passes.
   */
  createdAt: string | null;
  /** The row's `expires_at`, or null when it could not be read. */
  expiresAt: string | null;
}

/** The row timestamps an offer may already know (a read, a realtime row). */
export interface ChallengeTimes {
  createdAt: string | null;
  expiresAt: string | null;
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
  /**
   * The row's `created_at` (server time), when known. The chip's
   * `WAITING · ALEX · 8:12` counts down the 10-minute freshness window from
   * it.
   */
  createdAt?: string | null;
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
 * How long my outgoing challenge may sit at `accepted` before I start the
 * match myself: well past a normal accept-to-start (about a second), short
 * enough that a stranded challenger is not left staring at the plate.
 */
const ACCEPTED_FALLBACK_MS = 12_000;

/**
 * How long after a failed start of my own accepted challenge (the fallback
 * above) I read the row once more: long enough for a start the accepter was
 * making at the same moment to land, short enough to feel immediate.
 */
const START_RETRY_MS = 2_000;

/**
 * How long after a lapse withdrawal that could not reach the server (see the
 * outgoing live window) it is tried again.
 */
const OUTGOING_LAPSE_RETRY_MS = 15_000;

/**
 * How many times a lapse that could not settle (withdrawal unreachable, or
 * the row moved but could not be re-read) is tried again before the plate is
 * cleared locally anyway, so a device with no network does not hold WAITING
 * at 0:00 indefinitely (AC-H7). About 45s past the deadline. A row left
 * pending server-side is past its live window, so no recipient is offered it,
 * and the stale sweep withdraws it when it would block a new send.
 */
const OUTGOING_LAPSE_MAX_RETRIES = 3;

/**
 * How much later my outgoing challenge is withdrawn while the server clock
 * offset is still unknown (no sample yet this session, for example after a
 * cold relaunch restored the plate from a read). A device clock that runs
 * fast would otherwise withdraw it before the server's 10-minute mark, while
 * the recipient still sees time left, and the jr_be push function (whose
 * silent-lapse rule allows only a 60s grace) would tell them the challenger
 * cancelled. Harmless the other way: the recipient's prompt has lapsed by
 * then, so the plate only waits a little longer.
 */
export const OUTGOING_LAPSE_UNLEARNED_CLOCK_MARGIN_MS = 30_000;

/**
 * The challenge I last accepted and have not entered yet, persisted so a
 * relaunch after my app died mid-accept still knows it (F1). One record per
 * athlete, `{ challengeId, at }`; best effort like every other small cache.
 */
const ACCEPTED_KEY_PREFIX = "elo-rated:arena-accepted:";

interface AcceptedRecord {
  challengeId: string;
  at: number;
}

async function readAccepted(athleteId: string): Promise<AcceptedRecord | null> {
  try {
    const raw = await AsyncStorage.getItem(ACCEPTED_KEY_PREFIX + athleteId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AcceptedRecord>;
    if (typeof parsed.challengeId !== "string" || typeof parsed.at !== "number") {
      return null;
    }
    return { challengeId: parsed.challengeId, at: parsed.at };
  } catch {
    return null;
  }
}

function writeAccepted(athleteId: string, record: AcceptedRecord): void {
  AsyncStorage.setItem(ACCEPTED_KEY_PREFIX + athleteId, JSON.stringify(record)).catch(
    () => {},
  );
}

function clearAccepted(athleteId: string): void {
  AsyncStorage.removeItem(ACCEPTED_KEY_PREFIX + athleteId).catch(() => {});
}

/**
 * What the challenger is told when their challenge ended without a match.
 * `wasAccepted`: the row was seen at `accepted` before it was cancelled, and
 * not by me, so the accepter withdrew it after a start that failed.
 */
function endedToast(
  status: string,
  opponentName: string,
  wasAccepted = false,
): string | null {
  if (status === "declined") return `${opponentName} declined.`;
  if (status === "expired") return `Your challenge to ${opponentName} expired.`;
  if (status === "cancelled" && wasAccepted) {
    return `Couldn't start the match with ${opponentName}.`;
  }
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
  created_at?: string | null;
}

/**
 * What `offerIncoming` did. `retry` means the surface was busy (another prompt
 * up, a match starting or on screen) and the challenge should be offered again
 * on the next pass; `final` means it was answered, withdrawn or entered and
 * must never be offered again.
 */
export type OfferResult = "raised" | "retry" | "final";

/** See `UseArenaChallengeResult.offerIncoming`. */
export interface OfferIncomingOptions {
  replaceTucked?: boolean;
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
  /**
   * Athlete ids in `lobby:online`. When given (the app-wide owner always
   * passes it):
   *  - a challenge is only SENT to someone on the mat right now (F13): an
   *    athlete flagged "open to challenges" but not present cannot answer a
   *    live prompt, so the client refuses rather than parking a challenge
   *    nobody will see;
   *  - the prompt (or the challenge tucked into the chip) clears when its
   *    challenger leaves the lobby (spec 5, auto-clear);
   *  - the incoming count only counts challengers who are still on the mat.
   * Omitted (`undefined`), none of the three apply (tests, and any caller
   * without presence).
   *
   * Pass `null` whenever presence is tracked but UNKNOWN right now (no sync
   * yet, or the lobby channel was lost and is being rebuilt; see
   * `useLobbyKnown`). Then nothing is concluded about who left and the count
   * is not filtered, as for `undefined`, but a challenge is REFUSED rather
   * than sent unchecked: the roster may still be showing athletes from before
   * the outage, and one who left meanwhile would hold one of my three pending
   * slots for the whole window. A set given here is trusted as the truth,
   * empty included: an empty set means nobody is on the mat, not that the
   * channel is down.
   */
  lobbyIds?: ReadonlySet<string> | null;
}

export interface UseArenaChallengeResult {
  incoming: IncomingChallenge | null;
  outgoing: OutgoingChallenge | null;
  /**
   * How many fresh challenges are waiting on me (spec 5, F9): the one on the
   * prompt plus every other fresh pending one whose challenger is on the mat.
   * The prompt still shows only the first; the rest are counted, not dropped.
   */
  incomingCount: number;
  /**
   * The prompt was minimized with "Later" (spec 5): the challenge is still
   * pending and still `incoming`, but the sheet is down and the header chip
   * carries it instead. Nothing was sent to the challenger.
   */
  incomingTucked: boolean;
  /** "Later": minimize the prompt into the chip. Sends nothing. */
  tuckIncoming: () => void;
  /** Bring a tucked prompt back up (the chip tap). */
  reopenIncoming: () => void;
  /**
   * Taken off the prompt for good without an answer (`dismissIncoming` with
   * `final`): its live window passed, or a manual go-offline dropped it from
   * the chip (decision Q3). It is never offered again.
   */
  isIncomingDismissed: (challengeId: string) => boolean;
  /**
   * The athlete is going offline ON PURPOSE (the toggle, the popover). Call
   * it synchronously before the transition starts, and call the function it
   * returns once the transition settled, with whether it took them offline.
   *
   * From the call until then, no queued challenge is offered: the prompt
   * surface must not light up under an athlete on their way out. When the
   * athlete did go offline, a challenge tucked into the chip (at the moment
   * of the call) is dropped WITHOUT a decline and lapses on its own
   * server-side; when the athlete is still live (the go-offline never
   * committed), nothing is dropped. Being taken
   * offline by backgrounding does not call this, so a tucked challenge
   * survives a trip to the home screen (decision Q3).
   */
  beginManualOffline: () => (wentOffline: boolean) => void;
  /**
   * A pending-challenge read landed (`use-pending-challenge-recovery.ts`):
   * fold its fresh incoming challenges into the count, and drop known ones it
   * shows are no longer pending. `readStartedAt` is when the read was issued.
   */
  noteIncomingRead: (
    fresh: readonly { challengeId: string; challengerId: string; createdAt: string; expiresAt: string }[],
    readStartedAt: number,
  ) => void;
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
   * Resolves "raised", "retry" (surface busy: offer again on the next pass)
   * or "final" (answered, withdrawn or entered: never offer again).
   *
   * `replaceTucked`: the challenge the athlete opened from its push (AC-A8)
   * may take the prompt from a DIFFERENT challenge tucked away with "Later"
   * (its sheet is down, so no decision is interrupted). The tucked one is
   * not declined: it stays counted and tucked, and recovery offers it again
   * (back into the chip) once the prompt clears.
   */
  offerIncoming: (
    challengeId: string,
    challengerId: string,
    times?: ChallengeTimes,
    options?: OfferIncomingOptions,
  ) => Promise<OfferResult>;
  /**
   * Put back the "Sent" state for my own still-pending challenge after a
   * relaunch, so the accept broadcast still reaches me. A no-op when a
   * challenge is already outgoing.
   */
  restoreOutgoing: (challenge: OutgoingChallenge) => void;
}

/**
 * What the prompt shows, read off the challenger's row.
 *
 * `times` comes from whatever found the challenge (the realtime row, the
 * pending read). Without it (an offer by id alone, such as a deep link) the
 * challenge row is read as well, which also answers whether it is still
 * pending: "gone" means it is not, and must not be offered.
 */
async function loadIncoming(
  challengeId: string,
  challengerId: string,
  times?: ChallengeTimes,
): Promise<IncomingChallenge | "gone"> {
  const [athlete, row] = await Promise.all([
    supabase
      .from("athletes")
      .select("display_name, current_elo, current_weight")
      .eq("id", challengerId)
      .maybeSingle(),
    times ? null : getChallengeStatus(supabase, challengeId),
  ]);
  // A failed row read keeps the offer (null times): the realtime UPDATE and
  // the accept itself still guard a challenge that is no longer answerable.
  if (row?.ok && (!row.data || row.data.status !== "pending")) return "gone";
  const read = row?.ok && row.data ? row.data : null;
  const data = athlete.data;

  return {
    challengeId,
    challengerId,
    challengerName: data?.display_name ?? "An athlete",
    challengerElo: data?.current_elo ?? null,
    challengerWeight: data?.current_weight ?? null,
    createdAt: times?.createdAt ?? read?.createdAt ?? null,
    expiresAt: times?.expiresAt ?? read?.expiresAt ?? null,
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
  settle: (challengeId: string) => void,
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
    settle(c.challengeId);
    void cancelChallenge(supabase, c.challengeId, { onlyIfPending: true });
  }
  for (const c of result.data.declined) settle(c.challengeId);
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
  lobbyIds,
}: UseArenaChallengeArgs): UseArenaChallengeResult {
  const router = useRouter();
  const [incoming, setIncoming] = React.useState<IncomingChallenge | null>(null);
  const [outgoing, setOutgoing] = React.useState<OutgoingChallenge | null>(null);
  const [isBusy, setIsBusy] = React.useState(false);
  const [capReached, setCapReached] = React.useState(false);
  /** Every fresh pending challenge to me that I know of (for the count). */
  const [knownIncoming, setKnownIncomingState] = React.useState<
    ReadonlyMap<string, KnownIncoming>
  >(() => new Map());
  /**
   * The latest `knownIncoming`, updated at the same moment as each queued
   * update (not at render), so two reads, or a read and an INSERT, landing
   * before a re-render each see the other's result.
   */
  const knownIncomingRef = React.useRef(knownIncoming);
  const setKnownIncoming = React.useCallback(
    (
      update: (
        prev: ReadonlyMap<string, KnownIncoming>,
      ) => ReadonlyMap<string, KnownIncoming>,
    ) => {
      const next = update(knownIncomingRef.current);
      if (next === knownIncomingRef.current) return;
      knownIncomingRef.current = next;
      setKnownIncomingState(next);
    },
    [],
  );
  /**
   * Challenges minimized with "Later". A set rather than the one on the
   * prompt, because a tuck outlives a soft clear: a challenger who drops off
   * the mat past the grace and comes back is offered again by recovery, and
   * the challenge the athlete set aside must come back into the chip, not as
   * a full sheet. An id leaves the set when its challenge is settled,
   * dismissed for good, or reopened.
   */
  const [tuckedIds, setTuckedIds] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const tuckedIdsRef = React.useRef(tuckedIds);
  tuckedIdsRef.current = tuckedIds;
  const untuckAll = React.useCallback((challengeIds: Iterable<string>) => {
    const drop = [...challengeIds];
    if (drop.length === 0) return;
    setTuckedIds((prev) => {
      if (!drop.some((id) => prev.has(id))) return prev;
      const next = new Set(prev);
      for (const id of drop) next.delete(id);
      return next;
    });
  }, []);
  const untuck = React.useCallback(
    (challengeId: string) => untuckAll([challengeId]),
    [untuckAll],
  );
  const lobbyIdsRef = React.useRef(lobbyIds);
  lobbyIdsRef.current = lobbyIds;

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
  /**
   * Every challenge this instance has entered a match for. The rejoin read
   * never pushes one of these again: that would drag the athlete back into a
   * match screen they chose to leave.
   */
  const enteredIdsRef = React.useRef<Set<string>>(new Set());
  /**
   * Challenges I accepted and have not entered yet. If my start (or its
   * broadcast) never made it, the challenger's fallback starts the match on
   * its own, and the `started` UPDATE for one of these takes me in.
   */
  const acceptedNotEnteredRef = React.useRef<Set<string>>(new Set());
  /** My outgoing challenges I have seen at `accepted` (the withdrawn toast). */
  const acceptedSeenRef = React.useRef<Set<string>>(new Set());
  /** My outgoing challenges I cancelled myself: their end is never news. */
  const selfCancelledRef = React.useRef<Set<string>>(new Set());
  /**
   * The athlete in the match I am entering or in. Kept apart from `entryRef`,
   * which is cleared as soon as the match screen mounts; this one lives until
   * I leave the match. A challenge from them that lands meanwhile is the late
   * other half of a crossing pair, withdrawn quietly, never "declined".
   */
  const entryPeerRef = React.useRef<string | null>(null);

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

  /** Count a pending challenge to me (the prompt's, or one queued behind it). */
  const rememberIncoming = React.useCallback(
    (c: Omit<KnownIncoming, "seenAt">) => {
      setKnownIncoming((prev) => {
        if (prev.has(c.challengeId)) return prev;
        const next = new Map(prev);
        next.set(c.challengeId, { ...c, seenAt: Date.now() });
        return next;
      });
    },
    [],
  );
  const forgetIncoming = React.useCallback((challengeId: string) => {
    setKnownIncoming((prev) => {
      if (!prev.has(challengeId)) return prev;
      const next = new Map(prev);
      next.delete(challengeId);
      return next;
    });
  }, []);

  /**
   * This challenge is over for this instance: answered, withdrawn, entered or
   * seen to leave `pending`. Never offered again, and no longer counted.
   */
  const settle = React.useCallback(
    (challengeId: string) => {
      settledRef.current.add(challengeId);
      forgetIncoming(challengeId);
      untuck(challengeId);
      // A surface showing it somewhere other than the prompt (the Arena's
      // deep-link offer) drops it too.
      notifyIncomingChallengeEnded(challengeId);
    },
    [forgetIncoming, untuck],
  );

  /** Raise the prompt for `next`, and count it. */
  const surfaceIncoming = React.useCallback(
    (next: IncomingChallenge) => {
      rememberIncoming({
        challengeId: next.challengeId,
        challengerId: next.challengerId,
        createdAt: next.createdAt,
        expiresAt: next.expiresAt,
      });
      setIncomingBoth(next);
    },
    [rememberIncoming, setIncomingBoth],
  );

  /**
   * Challenges this instance took off the prompt WITHOUT answering them, for
   * good: the live window passed, or the athlete went offline on purpose with
   * it tucked away. Nothing was written, so the challenge is still pending
   * server-side, but it must not be offered again.
   */
  const dismissedRef = React.useRef<Set<string>>(new Set());
  /**
   * Take a challenge off the prompt (or out of the chip) without answering.
   *  - `final` (default true): never offer or count it again. False for a
   *    challenger who left the lobby: they may come back (a trip to their home
   *    screen takes them out of the lobby for a few seconds), and recovery
   *    then offers it again, since it only offers a challenge whose challenger
   *    is on the mat.
   *  - `resync` (default true): ask recovery for a fresh read so the next
   *    challenger queued behind this one gets offered. False when the athlete
   *    is going offline: there is nobody to offer it to.
   */
  const dismissIncoming = React.useCallback(
    (
      challengeId: string,
      { final = true, resync = true }: { final?: boolean; resync?: boolean } = {},
    ) => {
      if (final) {
        dismissedRef.current.add(challengeId);
        forgetIncoming(challengeId);
        untuck(challengeId);
        // Ended for this athlete: a deep-link offer for it (a push tapped
        // after the manual go-offline) must go too, never a go-live for a
        // challenge recovery will not raise.
        notifyIncomingChallengeEnded(challengeId);
      }
      if (incomingRef.current?.challengeId !== challengeId) return;
      setIncomingBoth(null);
      if (resync) {
        requestPendingChallengeResync(final ? undefined : { reoffer: challengeId });
      }
    },
    [forgetIncoming, setIncomingBoth, untuck],
  );
  /**
   * Set while a manual go-offline is in flight; no queued challenge is offered
   * meanwhile (see `beginManualOffline`). Cleared when that transition
   * settles without taking the athlete offline, or once the live state has
   * visibly changed, after which `isLive` itself gates the offers.
   */
  const offersSuppressedRef = React.useRef(false);
  React.useEffect(() => {
    offersSuppressedRef.current = false;
  }, [isLive]);

  /**
   * The incoming-challenge channel's supervisor. If that channel gave up while
   * the athlete was offline, going live restarts it: a live phone is held
   * awake (`useArenaLiveKeepAwake`), so the foreground that would otherwise
   * resume it never comes, and a live athlete would get no prompts.
   */
  const incomingSupervisorRef = React.useRef<SupervisedChannel | null>(null);
  React.useEffect(() => {
    if (isLive) incomingSupervisorRef.current?.resume();
  }, [isLive]);

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
      entryPeerRef.current = peerId;
      enteredIdsRef.current.add(challengeId);
      acceptedNotEnteredRef.current.delete(challengeId);
      clearAccepted(athleteIdRef.current);
      settle(challengeId);
      // My own challenge that did not become this match is over too. Settled
      // now, so recovery's restore cannot put its plate back while the
      // withdrawal below is in flight.
      const mine = outgoingRef.current;
      const stranded =
        mine && mine.challengeId !== challengeId ? mine.challengeId : null;
      if (stranded) settle(stranded);
      setIncomingBoth(null);
      setOutgoingBoth(null);
      // Entering declines every other pending challenge to me, so none of
      // them is waiting any more.
      setKnownIncoming((prev) => (prev.size === 0 ? prev : new Map()));
      router.push(arenaMatchHref(matchId));
      void settleOthersAfterEntry(
        athleteIdRef.current,
        challengeId,
        peerId,
        stranded,
        settle,
      );
    },
    [router, entryBlocked, setIncomingBoth, setOutgoingBoth, settle],
  );

  /**
   * My outgoing challenge is over without a match: drop the waiting plate.
   * `toastMessage` is null for a quiet end (my own cancel, a cancel sweep).
   */
  const endOutgoing = React.useCallback(
    (challengeId: string, toastMessage: string | null) => {
      settle(challengeId);
      if (outgoingRef.current?.challengeId !== challengeId) return;
      setOutgoingBoth(null);
      // A slot freed up, so the cap can no longer be asserted.
      setCapReached(false);
      if (toastMessage) toast.info(toastMessage);
    },
    [setOutgoingBoth, settle],
  );

  /**
   * Decline a challenge that arrived while I am entering or in a match, and
   * tell its challenger, so their plate clears instead of waiting on me.
   */
  const declineAsBusy = React.useCallback(
    (challengeId: string) => {
      if (settledRef.current.has(challengeId)) return;
      settle(challengeId);
      void declineChallenge(supabase, challengeId).then((result) => {
        if (result.ok) void broadcast(challengeId, "declined", {});
      });
    },
    [settle],
  );

  /**
   * An INSERT that landed while I am entering or in a match. From the athlete
   * I am matched with, it is the late other half of a crossing pair: they are
   * on their way into the same match, so it is withdrawn quietly rather than
   * answered "declined". Anyone else is declined as busy.
   */
  const settleBusyInsert = React.useCallback(
    (row: ChallengeRow) => {
      if (row.challenger_id !== entryPeerRef.current) {
        declineAsBusy(row.id);
        return;
      }
      if (settledRef.current.has(row.id)) return;
      settle(row.id);
      void cancelChallenge(supabase, row.id, { onlyIfPending: true });
    },
    [declineAsBusy, settle],
  );

  /**
   * My outgoing challenges this instance withdrew because their live window
   * passed (see the freshness lapse below). Their `cancelled` is told as
   * "expired", whichever of the cancel's reply or its realtime UPDATE clears
   * the plate first.
   */
  const lapsedOutgoingRef = React.useRef<Set<string>>(new Set());

  /** Why my outgoing challenge ended, as a toast (or null for a quiet end). */
  const outgoingEndedToast = React.useCallback(
    (challengeId: string, status: string, opponentName: string) =>
      // My own cancel is never news, even after a lapse that failed first.
      status === "cancelled" &&
      lapsedOutgoingRef.current.has(challengeId) &&
      !selfCancelledRef.current.has(challengeId)
        ? `Your challenge to ${opponentName} expired.`
        : endedToast(
            status,
            opponentName,
            acceptedSeenRef.current.has(challengeId) &&
              !selfCancelledRef.current.has(challengeId),
          ),
    [],
  );

  /**
   * Re-read my outgoing challenge's row and act on it: the recovery for a
   * challenger that missed the realtime UPDATE and the broadcast (backgrounded
   * while waiting, socket down, channel rebuilt). Only `started` enters: on
   * `accepted` the accepter is mid-way through starting it, and starting it
   * from here as well is the jits-njyd race (the accepter's own start then
   * fails `not_accepted`); its broadcast or the `started` UPDATE follows.
   *
   * `mode`: "read" is the plain re-read; "fallback" also starts a row still
   * at `accepted` (see `scheduleAcceptedFallback`); "retry" is the single
   * re-read after a start that failed, which joins a `started` row but arms
   * nothing further, so a start that keeps failing cannot loop.
   */
  const recheckOutgoing = React.useCallback(
    async (challengeId: string, mode: "read" | "fallback" | "retry" = "read") => {
      const mine = outgoingRef.current;
      if (!mine || mine.challengeId !== challengeId) return;
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
        // it withdrew it: read once more shortly and follow the row.
        if (mode !== "retry") scheduleStartRetryRef.current(challengeId);
        return;
      }
      if (status === "accepted") {
        // After a failed fallback start the row may still be `accepted`
        // (nobody started it): arm the fallback once more, and only once, so
        // a start that keeps failing cannot loop.
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
  const recheckOutgoingRef = React.useRef(recheckOutgoing);
  recheckOutgoingRef.current = recheckOutgoing;
  /** Outgoing challenges whose fallback was re-armed after a retry (N2). */
  const fallbackRearmedRef = React.useRef<Set<string>>(new Set());

  /**
   * Safety net for a challenge that sits at `accepted`. Normally the accepter
   * starts it within a second and its broadcast (or the `started` UPDATE)
   * takes me in; I never start it myself at that point, because that is the
   * jits-njyd race. But if the accepter's start failed or its app died, the
   * row stays `accepted` and my plate would wait forever. So one re-read
   * `ACCEPTED_FALLBACK_MS` later: still `accepted` means nobody is starting
   * it, and I start it myself (the RPC is idempotent, and the accepter's
   * accept retries a start that lost the row lock).
   */
  const acceptedFallbackRef = React.useRef<{
    challengeId: string;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const scheduleAcceptedFallback = React.useCallback((challengeId: string) => {
    if (acceptedFallbackRef.current?.challengeId === challengeId) return;
    if (acceptedFallbackRef.current) clearTimeout(acceptedFallbackRef.current.timer);
    const timer = setTimeout(() => {
      acceptedFallbackRef.current = null;
      void recheckOutgoingRef.current(challengeId, "fallback");
    }, ACCEPTED_FALLBACK_MS);
    acceptedFallbackRef.current = { challengeId, timer };
  }, []);
  const scheduleAcceptedFallbackRef = React.useRef(scheduleAcceptedFallback);
  scheduleAcceptedFallbackRef.current = scheduleAcceptedFallback;

  /** The one re-read after a failed start of my outgoing (`START_RETRY_MS`). */
  const startRetryRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleStartRetry = React.useCallback((challengeId: string) => {
    if (startRetryRef.current) clearTimeout(startRetryRef.current);
    startRetryRef.current = setTimeout(() => {
      startRetryRef.current = null;
      void recheckOutgoingRef.current(challengeId, "retry");
    }, START_RETRY_MS);
  }, []);
  const scheduleStartRetryRef = React.useRef(scheduleStartRetry);
  scheduleStartRetryRef.current = scheduleStartRetry;

  React.useEffect(
    () => () => {
      if (acceptedFallbackRef.current) clearTimeout(acceptedFallbackRef.current.timer);
      acceptedFallbackRef.current = null;
      if (startRetryRef.current) clearTimeout(startRetryRef.current);
      startRetryRef.current = null;
    },
    [],
  );

  /**
   * Back into a match the challenger started without me (F1, jits-6ziw).
   *
   * I accepted, then my app died or lost the network before my start or its
   * broadcast went out; the challenger's `ACCEPTED_FALLBACK_MS` safety net
   * started the match alone, and nothing on my side knows. So on launch (once
   * the app is in the foreground), on return from the background and on a
   * re-subscribe, check the ONE challenge I persisted on accept and never
   * entered. It is joined only when all of these hold:
   *  - it is within the live window (`ARENA_CHALLENGE_FRESH_MS`) of my accept;
   *  - the server says it is `started`, its match is still `pending`, and
   *    the challenger (not I) started it, see `getStartedChallengesToJoin`;
   *  - this instance never entered it, and no accept, prompt or match screen
   *    is in the way.
   * A match I entered clears the record, so a match I left on purpose (or one
   * entered by another route) is never joined again.
   */
  const rejoinStartedMatch = React.useCallback(async () => {
    const me = athleteIdRef.current;
    const blocked = () =>
      busyRef.current || entryBlocked() || !!incomingRef.current;
    if (!me || blocked()) return;
    const stored = await readAccepted(me);
    if (!stored) return;
    if (
      Date.now() - stored.at > ARENA_CHALLENGE_FRESH_MS ||
      enteredIdsRef.current.has(stored.challengeId)
    ) {
      clearAccepted(me);
      return;
    }
    const since = new Date(Date.now() - ARENA_CHALLENGE_FRESH_MS).toISOString();
    const read = await getStartedChallengesToJoin(supabase, me, since);
    if (!read.ok) return;
    // Not there (yet): the challenger's fallback may still be counting down,
    // so the record stays until it goes stale or a later check finds it.
    const pick = read.data.find((c) => c.challengeId === stored.challengeId);
    if (!pick || blocked()) return;
    enterMatch(pick.challengeId, pick.matchId, pick.challengerId);
  }, [entryBlocked, enterMatch]);
  const rejoinRef = React.useRef(rejoinStartedMatch);
  rejoinRef.current = rejoinStartedMatch;

  /**
   * A launch in the background (a silent push) must not navigate: the
   * launch-time check waits for the first "active" instead.
   */
  const pendingLaunchRejoinRef = React.useRef(false);
  React.useEffect(() => {
    if (!athleteId) return;
    if (AppState.currentState === "active") {
      void rejoinRef.current();
    } else {
      pendingLaunchRejoinRef.current = true;
    }
  }, [athleteId]);

  /**
   * The `started` UPDATE for a challenge I accepted but never entered (my
   * start failed, or the network dropped under it): the challenger's fallback
   * started it, so ask for that match and join it. Left to `accept` while
   * one is running, since it enters the match itself.
   */
  const joinAccepted = React.useCallback(
    async (challengeId: string, challengerId: string) => {
      if (busyRef.current || enteredIdsRef.current.has(challengeId)) return;
      const started = await startMatchFromChallenge(supabase, challengeId);
      if (started.ok) enterMatch(challengeId, started.data.match_id, challengerId);
    },
    [enterMatch],
  );

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
    if (!inMatch) entryPeerRef.current = null;
    const mine = outgoingRef.current;
    if (!inMatch && mine) void recheckOutgoingRef.current(mine.challengeId);
  }, [inMatch]);

  // Back from the background with a plate up: the accept broadcast and the
  // status UPDATE were both likely missed while suspended. Tracked from
  // "background" specifically; Control Center is not a return. Also the
  // accepter's way back into a match started while it was away.
  React.useEffect(() => {
    let wasBackground = false;
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "background") {
        wasBackground = true;
        return;
      }
      if (next !== "active") return;
      // The launch-time rejoin deferred by a background launch, on the first
      // "active" whatever came before it.
      const launchRejoin = pendingLaunchRejoinRef.current;
      pendingLaunchRejoinRef.current = false;
      if (!wasBackground) {
        if (launchRejoin) void rejoinRef.current();
        return;
      }
      wasBackground = false;
      const mine = outgoingRef.current;
      if (mine) void recheckOutgoingRef.current(mine.challengeId);
      void rejoinRef.current();
    });
    return () => sub.remove();
  }, []);

  /**
   * When the app last came back to the foreground (0: it has not been away),
   * so a realtime INSERT flushed on resume is not taken as a clock sample.
   */
  const activeSinceRef = React.useRef(0);
  React.useEffect(() => {
    let wasActive = AppState.currentState === "active";
    const sub = AppState.addEventListener("change", (next) => {
      const active = next === "active";
      if (active && !wasActive) activeSinceRef.current = Date.now();
      wasActive = active;
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
            // Delivered as it is written, so this row's `created_at` is the
            // server's "now": it calibrates the live-window clock. Not while
            // the app is not active: frames flushed on the way back from a
            // suspension arrive late by the length of the suspension, and the
            // estimator already distrusts a lone late sample.
            if (
              AppState.currentState === "active" &&
              Date.now() - activeSinceRef.current >= CLOCK_RESUME_SETTLE_MS
            ) {
              noteServerTime(row.created_at);
            }
            if (row.status !== "pending") return;
            if (row.expires_at && new Date(row.expires_at) <= new Date()) return;
            // Entering or in a match: I am busy, so the challenger is told
            // now (declined, with the broadcast) rather than left waiting on
            // a plate nobody will answer. My match peer's is withdrawn
            // quietly instead, see `settleBusyInsert`.
            if (settledRef.current.has(row.id)) return;
            if (entryBlocked()) {
              settleBusyInsert(row);
              return;
            }
            const times: ChallengeTimes = {
              createdAt: row.created_at ?? null,
              expiresAt: row.expires_at ?? null,
            };
            // Counted whether or not it gets the prompt: one queued behind
            // the prompt still "wants to roll" (the chip's `! 3`).
            rememberIncoming({
              challengeId: row.id,
              challengerId: row.challenger_id,
              ...times,
            });
            // Already showing a prompt: the first one keeps the surface rather
            // than being silently replaced mid-decision (recovery offers the
            // next one when it clears). Offline: no live prompt; recovery
            // offers it on going live if it is still fresh.
            // Nor on the way out of a manual go-offline: `isLive` is still
            // true until that transition commits (decision Q3).
            const skip = () =>
              !!incomingRef.current ||
              !isLiveRef.current ||
              offersSuppressedRef.current ||
              settledRef.current.has(row.id) ||
              dismissedRef.current.has(row.id);
            if (skip()) return;

            const next = await loadIncoming(row.id, row.challenger_id, times);
            // Re-checked after the read: another INSERT, a recovery offer, a
            // match or going offline can land inside that await, and the first
            // prompt keeps the surface.
            if (entryBlocked()) {
              settleBusyInsert(row);
              return;
            }
            if (skip() || next === "gone") return;
            surfaceIncoming(next);
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
            settle(row.id);
            // One I accepted but never entered, now started by the
            // challenger's fallback: join it (F1). Any other status for it
            // means there will be no match to join.
            if (acceptedNotEnteredRef.current.has(row.id)) {
              if (row.status === "started") {
                void joinAccepted(row.id, row.challenger_id);
              } else if (row.status !== "accepted") {
                acceptedNotEnteredRef.current.delete(row.id);
                clearAccepted(athleteId);
              }
            }
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
              endOutgoing(
                row.id,
                outgoingEndedToast(row.id, row.status, mine.opponentName),
              );
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
              if (started.ok) {
                enterMatch(row.id, started.data.match_id, mine.opponentId);
              } else {
                scheduleStartRetryRef.current(row.id);
              }
              return;
            }
            // `accepted`: wait for the accepter, with a safety net if its
            // start never lands.
            acceptedSeenRef.current.add(row.id);
            scheduleAcceptedFallbackRef.current(row.id);
          },
        );

    // Any SUBSCRIBED after the first (a phoenix rejoin after a network drop,
    // or a rebuild after a server close) may have missed an INSERT (recovery
    // reads pending challenges again), my plate's UPDATE (re-read it), or the
    // `started` UPDATE for a match I accepted and never entered (rejoin).
    let subscribedBefore = false;
    const supervised = superviseChannel(
      "incoming challenge",
      build,
      () => {
        if (!subscribedBefore) {
          subscribedBefore = true;
          return;
        }
        requestPendingChallengeResync();
        const mine = outgoingRef.current;
        if (mine) void recheckOutgoingRef.current(mine.challengeId);
        void rejoinRef.current();
      },
      // A live athlete is held awake and challengeable, so no foreground
      // would ever resume a channel that gave up: keep rebuilding at 30s.
      { keepRetrying: () => isLiveRef.current },
    );
    incomingSupervisorRef.current = supervised;
    return () => {
      if (incomingSupervisorRef.current === supervised) incomingSupervisorRef.current = null;
      supervised();
    };
  }, [
    athleteId,
    enterMatch,
    endOutgoing,
    entryBlocked,
    settleBusyInsert,
    outgoingEndedToast,
    joinAccepted,
    setIncomingBoth,
    rememberIncoming,
    surfaceIncoming,
    settle,
  ]);

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

  // --- The live window of my outgoing challenge -----------------------------
  // The recipient's prompt clears itself 10 minutes after the challenge was
  // sent (`ARENA_CHALLENGE_FRESH_MS`) without writing anything, as does a
  // prompt soft-cleared or dropped by a manual go-offline. So the challenger
  // cannot wait on the realtime UPDATE (or `expires_at`, 7 days out): at the
  // same deadline the challenge is withdrawn here, pending-guarded, and the
  // plate clears with "expired" (AC-H7: the chip returns to base at 0:00).
  // No row changed means it is already past pending: the row is read and
  // followed, so a match started at the last second is still joined. Timers
  // do not run while iOS has the app suspended, so the same check runs on
  // every return to the foreground.
  const outgoingCreatedAt = outgoing?.createdAt ?? null;
  const outgoingIdForFresh = outgoing?.challengeId;
  React.useEffect(() => {
    if (!outgoingIdForFresh || !outgoingCreatedAt) return;
    const id = outgoingIdForFresh;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;
    let disposed = false;
    // An earlier withdrawal came back unknown: it may have landed with only
    // its reply lost, so a later `cancelled` is still this lapse's doing.
    let priorUnknown = false;
    let retries = 0;

    const deadline = () => {
      const at = freshDeadline({ createdAt: outgoingCreatedAt });
      if (at === null) return null;
      return isServerClockEstablished() ? at : at + OUTGOING_LAPSE_UNLEARNED_CLOCK_MARGIN_MS;
    };
    const schedule = (delay: number) => {
      if (disposed) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void lapse();
      }, Math.max(0, Math.min(delay, MAX_TIMER_MS)));
    };

    // Try the lapse again shortly, or past the retry budget clear the plate
    // locally. A row known to have moved past pending ends quietly (it may
    // have been answered); otherwise it is told as expired.
    const retryOrGiveUp = (opponentName: string, rowMoved: boolean) => {
      if (retries < OUTGOING_LAPSE_MAX_RETRIES) {
        retries += 1;
        schedule(OUTGOING_LAPSE_RETRY_MS);
        return;
      }
      endOutgoing(
        id,
        rowMoved ? null : `Your challenge to ${opponentName} expired.`,
      );
    };

    const lapse = async (): Promise<void> => {
      if (disposed || inFlight) return;
      if (outgoingRef.current?.challengeId !== id) return;
      const at = deadline();
      if (at === null) return;
      // Re-read at fire time: the learned clock offset may have moved.
      if (Date.now() < at) {
        schedule(at - Date.now());
        return;
      }
      // Mid-accept, mid-cancel or on the way into a match: those settle my
      // plate themselves; look again shortly.
      if (busyRef.current || entryBlocked()) {
        schedule(START_RETRY_MS);
        return;
      }
      inFlight = true;
      try {
        await runExclusive(async () => {
          const mine = outgoingRef.current;
          if (!mine || mine.challengeId !== id) return;
          lapsedOutgoingRef.current.add(id);
          const withdrawn = await cancelChallenge(supabase, id, {
            onlyIfPending: true,
          });
          if (!withdrawn.ok) {
            // Unknown (network): the challenge may still be live, so the
            // plate stays and the lapse is tried again. The id stays marked:
            // the cancel may have landed with only its reply lost, and past
            // the window only this lapse (or a stale sweep) withdraws the
            // row, so a `cancelled` UPDATE that follows is "expired".
            priorUnknown = true;
            retryOrGiveUp(mine.opponentName, false);
            return;
          }
          if (withdrawn.data.cancelled) {
            endOutgoing(id, `Your challenge to ${mine.opponentName} expired.`);
            return;
          }
          // Already past pending: accepted, started, declined or cancelled
          // by someone else. Follow the row, whatever it says. After an
          // unknown attempt the mark stays: the `cancelled` found now is most
          // likely that earlier withdrawal, and is still "expired".
          if (!priorUnknown) lapsedOutgoingRef.current.delete(id);
          await recheckOutgoingRef.current(id);
          // The re-read settles the plate on any terminal state. Still up
          // means it could not tell (read failed, or the row still reads
          // live): look again rather than strand the plate past 0:00.
          if (outgoingRef.current?.challengeId === id) {
            retryOrGiveUp(mine.opponentName, true);
          }
        });
      } finally {
        inFlight = false;
      }
    };

    const at = deadline();
    if (at !== null) schedule(at - Date.now());
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") void lapse();
    });
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      sub.remove();
      // The plate is over (its toast already told), so its mark goes too;
      // the set only holds challenges still on the plate.
      if (outgoingRef.current?.challengeId !== id) {
        lapsedOutgoingRef.current.delete(id);
      }
    };
  }, [outgoingIdForFresh, outgoingCreatedAt, endOutgoing, entryBlocked, runExclusive]);

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
        // F13: only someone on the mat right now can answer a live prompt.
        // An athlete still flagged "open to challenges" but gone from the
        // lobby is stale, and a challenge to them would sit unanswered for
        // the whole live window, holding one of my three pending slots.
        const lobby = lobbyIdsRef.current;
        if (lobby === null) {
          // Presence is unknown (the lobby channel is syncing or rejoining):
          // refuse rather than send to someone who may have left.
          toast.info("Reconnecting to the mat, try again in a moment.");
          return;
        }
        if (lobby && !lobby.has(opponentId)) {
          toast.info(`${opponentName} isn't on the mat right now.`);
          unavailableRef.current?.(opponentId);
          return;
        }
        const create = () =>
          createChallenge(supabase, {
            opponentId,
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
              settle(c.challengeId);
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
        noteServerTime(result.data.createdAt, Date.now(), "roundtrip");
        setOutgoingBoth({
          challengeId: result.data.id,
          opponentId,
          opponentName,
          expiresAt: result.data.expiresAt ?? null,
          createdAt: result.data.createdAt ?? null,
        });
      }),
    [runExclusive, setOutgoingBoth, explainRefusedInsert, settle],
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
        acceptedSeenRef.current.add(mine.challengeId);
        scheduleAcceptedFallbackRef.current(mine.challengeId);
        settle(current.challengeId);
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

      // Quietly: I am walking into a different match, so "declined" or
      // "expired" for my own challenge is noise at this moment.
      endOutgoing(mine.challengeId, null);
      return "proceed";
    },
    [endOutgoing, enterMatch, setIncomingBoth, settle],
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
        // Until I am in its match: if my start below never lands, the
        // challenger's fallback starts it, and its `started` UPDATE (or the
        // rejoin read) brings me in.
        acceptedNotEnteredRef.current.add(current.challengeId);
        writeAccepted(athleteIdRef.current, {
          challengeId: current.challengeId,
          at: Date.now(),
        });

        // `acceptChallenge` filters on `status = 'pending'`, and a PostgREST
        // update that matches no rows is not an error, so a challenge that was
        // cancelled or expired a moment ago still returns ok above. The real
        // answer arrives here, as `not_accepted`. That answer can also be a
        // lost race with the challenger's own start (an older build that
        // starts on `accepted`, jits-njyd): the row lock made my call re-read
        // `started`. Once more then finds the match that call created.
        // Any other failure (network) gets the same one retry.
        let started = await startMatchFromChallenge(supabase, current.challengeId);
        if (!started.ok) {
          started = await startMatchFromChallenge(supabase, current.challengeId);
        }
        if (!started.ok && started.error.code !== "CHALLENGE_NOT_ACCEPTED") {
          // I accepted but could not start it: left alone the row sits at
          // `accepted` and the challenger's plate waits on me. Withdraw it
          // (`challenges_update_cancel` allows `accepted`) so their UPDATE
          // clears the plate. No row changed means it is not `accepted` any
          // more: most likely my start DID land and only its reply was lost,
          // so ask once more for the match that now exists.
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
          settle(current.challengeId);
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
    [runExclusive, resolveOwnOutgoing, setIncomingBoth, entryBlocked, enterMatch, settle],
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

        settle(current.challengeId);
        await broadcast(current.challengeId, "declined", {});
        setIncomingBoth(null);
        // The next challenger queued behind this one gets offered.
        requestPendingChallengeResync();
      }),
    [runExclusive, setIncomingBoth, settle],
  );

  const cancelOutgoing = React.useCallback(
    () =>
      runExclusive(async () => {
        const current = outgoingRef.current;
        if (!current) return;

        selfCancelledRef.current.add(current.challengeId);
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
    async (
      challengeId: string,
      challengerId: string,
      times?: ChallengeTimes,
      options: OfferIncomingOptions = {},
    ): Promise<OfferResult> => {
      /** The prompt this offer may take over: tucked, and a different one. */
      const replaceable = (): IncomingChallenge | null => {
        const current = incomingRef.current;
        if (!options.replaceTucked || !current) return null;
        if (current.challengeId === challengeId) return null;
        return tuckedIdsRef.current.has(current.challengeId) ? current : null;
      };
      const check = (): OfferResult | null => {
        // Final: this challenge has been answered, withdrawn, entered, or
        // taken off the prompt without an answer (see `dismissIncoming`).
        if (
          settledRef.current.has(challengeId) ||
          dismissedRef.current.has(challengeId) ||
          enteredForRef.current === challengeId
        ) {
          return "final";
        }
        // Past its live window: the challenger is no longer waiting.
        if (times && !isFreshIncoming(times, Date.now())) return "final";
        // Retryable: the surface is busy right now, not the challenge dead.
        if (entryBlocked()) return "retry";
        if (incomingRef.current && !replaceable()) return "retry";
        // Retryable too: no live prompt for an athlete who is offline or on
        // the way out (a manual go-offline commits `isLive` a beat later).
        // Going live re-reads and offers it then, if it is still fresh.
        if (!isLiveRef.current || offersSuppressedRef.current) return "retry";
        return null;
      };
      const before = check();
      if (before) return before;
      const next = await loadIncoming(challengeId, challengerId, times);
      if (next === "gone") {
        // No longer pending (answered, withdrawn, expired): stop counting it
        // now rather than waiting on a realtime UPDATE that may have been
        // missed while the socket was down.
        settle(challengeId);
        return "final";
      }
      // Re-checked after the read: the realtime INSERT or an answer can land
      // inside that await, and the first prompt keeps the surface.
      const after = check();
      if (after) return after;
      if (!isFreshIncoming(next, Date.now())) return "final";
      const displaced = replaceable();
      surfaceIncoming(next);
      // The tucked challenge it replaced was never answered: recovery may
      // offer it again once this prompt clears, and it keeps its tuck.
      if (displaced) requestPendingChallengeResync({ reoffer: displaced.challengeId });
      return "raised";
    },
    [entryBlocked, surfaceIncoming, settle],
  );

  const restoreOutgoing = React.useCallback(
    (challenge: OutgoingChallenge) => {
      if (outgoingRef.current) return;
      if (settledRef.current.has(challenge.challengeId)) return;
      // Mid-accept (my own outgoing may be being withdrawn right now) or on
      // the way into a match: a restore would resurrect a plate that is over.
      if (busyRef.current || entryBlocked()) return;
      setOutgoingBoth(challenge);
    },
    [entryBlocked, setOutgoingBoth],
  );

  // --- Later, auto-clear and the count (spec 5) -----------------------------
  const incomingId = incoming?.challengeId ?? null;
  // A tuck belongs to one challenge: a new prompt always opens as a sheet,
  // and one the athlete set aside comes back into the chip.
  const incomingTucked = incomingId !== null && tuckedIds.has(incomingId);

  const tuckIncoming = React.useCallback(() => {
    const current = incomingRef.current;
    if (!current) return;
    setTuckedIds((prev) => {
      if (prev.has(current.challengeId)) return prev;
      const next = new Set(prev);
      next.add(current.challengeId);
      return next;
    });
  }, []);
  const reopenIncoming = React.useCallback(() => {
    const current = incomingRef.current;
    if (current) untuck(current.challengeId);
  }, [untuck]);
  const beginManualOffline = React.useCallback(() => {
    offersSuppressedRef.current = true;
    // EVERY challenge set aside with "Later", not only the one on the prompt:
    // a tucked challenge soft-cleared because its challenger stepped out of
    // the lobby keeps its tuck, and without this recovery would re-offer it
    // into the chip after the athlete went offline on purpose (decision Q3).
    const tucked = [...tuckedIdsRef.current];
    return (wentOffline: boolean) => {
      // Offline and committed: `isLive` gates the offers from here on.
      // Still live (the transition failed): nothing to hold back any more.
      if (!wentOffline || !isLiveRef.current) offersSuppressedRef.current = false;
      if (!wentOffline) {
        // An INSERT or a recovery pass during the suppressed window was
        // skipped (recovery got "retry"), and nothing else re-runs it on a
        // quiet lobby: read again so a fresh challenge still gets its prompt.
        requestPendingChallengeResync();
        return;
      }
      for (const id of tucked) {
        // Reopened while the go-offline was in flight: the athlete brought
        // it back up, so it is no longer "tucked away" and stays.
        if (!tuckedIdsRef.current.has(id)) continue;
        // Quietly and for good: no decline is sent, nothing is offered in
        // its place, and it is never offered again (it lapses server-side).
        dismissIncoming(id, { resync: false });
      }
    };
  }, [dismissIncoming]);

  const noteIncomingRead = React.useCallback<UseArenaChallengeResult["noteIncomingRead"]>(
    (fresh, readStartedAt) => {
      const surfaced = incomingRef.current?.challengeId;
      const keep = surfaced ? new Set([surfaced]) : undefined;
      const read = fresh.map((c) => ({
        challengeId: c.challengeId,
        challengerId: c.challengerId,
        createdAt: c.createdAt,
        expiresAt: c.expiresAt,
      }));
      const skip = (id: string) =>
        settledRef.current.has(id) || dismissedRef.current.has(id);
      // A known challenge the read drops is no longer a pending, fresh one
      // (its UPDATE was missed), so it can never come back: its tuck goes
      // with it, keeping the tuck set to challenges that still could.
      // Computed once, against the latest set (the ref moves with every
      // update, not at render, so a read or INSERT that landed before a
      // re-render is already in it).
      let dropped: string[] = [];
      setKnownIncoming((prev) => {
        const after = mergeIncomingRead(prev, read, readStartedAt, skip, keep);
        dropped = [...prev.keys()].filter((id) => !after.has(id));
        return after;
      });
      untuckAll(dropped);
      for (const id of dropped) notifyIncomingChallengeEnded(id);
    },
    [untuckAll, setKnownIncoming],
  );

  // The live window. Lapsed challenges stop counting, and a prompt (up or
  // tucked) whose window passed clears itself without an answer: the
  // challenger has stopped waiting. Timers do not run while iOS has the app
  // suspended, so the same check runs on every return to the foreground.
  const incomingDeadline = incoming ? freshDeadline(incoming) : null;
  const knownDeadline = nextDeadline(knownIncoming);
  React.useEffect(() => {
    const deadlines = [incomingDeadline, knownDeadline].filter(
      (d): d is number => d !== null,
    );
    if (deadlines.length === 0) return;
    const lapse = () => {
      const now = Date.now();
      // A tucked challenge that lapsed while NOT on the prompt (soft-cleared,
      // its challenger off the mat) leaves the tuck set too, so the set only
      // ever holds challenges that could still come back.
      const lapsed: string[] = [];
      for (const [id, c] of knownIncomingRef.current) {
        if (!isFreshIncoming(c, now)) lapsed.push(id);
      }
      untuckAll(lapsed);
      setKnownIncoming((prev) => pruneLapsed(prev, now));
      const current = incomingRef.current;
      if (current && !isFreshIncoming(current, now)) {
        dismissIncoming(current.challengeId);
      }
    };
    const delay = Math.min(...deadlines) - Date.now();
    if (delay <= 0) {
      lapse();
      return;
    }
    const timer = setTimeout(lapse, Math.min(delay, MAX_TIMER_MS));
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") lapse();
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [incomingDeadline, knownDeadline, dismissIncoming, untuckAll]);

  // The challenger LEFT the mat (AC-S5): they cannot drop into a match any
  // more, so the prompt (or the tucked chip) clears, after a short grace for
  // a presence re-track. Only once they have been SEEN in the lobby with this
  // prompt up (including at the moment it surfaced): a challenger never seen
  // there did not leave, they may never have been in it at all (a web
  // profile-sheet challenge, spec F2, comes from outside the Arena), and
  // recovery would never re-offer such a challenge, so clearing it would
  // leave them waiting on an answer that cannot come. The 10-minute live
  // window bounds how long a never-seen prompt stays up. Never while presence
  // is unknown (`lobbyIds` undefined or null: a lost lobby channel is not
  // everyone leaving).
  //
  // The grace runs from when they were first seen MISSING, not from the
  // latest presence sync: every sync (anyone joining, leaving or re-tracking)
  // hands this effect a new set, and restarting a full grace on each would
  // let a busy lobby hold a dead prompt up until it lapses.
  //
  // A soft clear (`final: false`): a challenger back on the mat with the
  // challenge still pending and fresh is offered again by recovery.
  const seenChallengerRef = React.useRef<string | null>(null);
  const missingSinceRef = React.useRef<{ key: string; at: number } | null>(null);
  const challengerId = incoming?.challengerId ?? null;
  React.useEffect(() => {
    if (!incomingId || !challengerId) {
      missingSinceRef.current = null;
      return;
    }
    const key = `${incomingId}:${challengerId}`;
    if (missingSinceRef.current?.key !== key) missingSinceRef.current = null;
    if (!lobbyIds) return;
    if (lobbyIds.has(challengerId)) {
      seenChallengerRef.current = key;
      missingSinceRef.current = null;
      return;
    }
    // Never seen with this prompt up: they have not left, see above.
    if (seenChallengerRef.current !== key) return;
    const grace = CHALLENGER_LEFT_GRACE_MS;
    missingSinceRef.current ??= { key, at: Date.now() };
    const clear = () => {
      const lobby = lobbyIdsRef.current;
      const current = incomingRef.current;
      if (!lobby || !current) return;
      if (current.challengeId !== incomingId || lobby.has(challengerId)) return;
      missingSinceRef.current = null;
      dismissIncoming(incomingId, { final: false });
    };
    const delay = missingSinceRef.current.at + grace - Date.now();
    if (delay <= 0) {
      clear();
      return;
    }
    const timer = setTimeout(clear, delay);
    return () => clearTimeout(timer);
  }, [lobbyIds, incomingId, challengerId, dismissIncoming]);

  // Offline, only the challenge already in hand counts (one tucked away when
  // the app was backgrounded): an athlete who is not live gets no live
  // prompts, so "! 2 WANT TO ROLL" would be a call to something they cannot
  // answer. The rest stay known, and count again the moment they go live.
  const incomingCount = React.useMemo(
    () =>
      isLive
        ? countWaitingIncoming(knownIncoming, incomingId, lobbyIds ?? null, Date.now())
        : incomingId
          ? 1
          : 0,
    [isLive, knownIncoming, incomingId, lobbyIds],
  );

  const isIncomingDismissed = React.useCallback(
    (challengeId: string) => dismissedRef.current.has(challengeId),
    [],
  );

  return {
    incoming,
    outgoing,
    incomingCount,
    incomingTucked,
    tuckIncoming,
    reopenIncoming,
    isIncomingDismissed,
    beginManualOffline,
    noteIncomingRead,
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

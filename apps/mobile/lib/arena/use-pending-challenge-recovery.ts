/**
 * Surface a live challenge that arrived while nobody was listening.
 *
 * The incoming prompt is driven by a realtime INSERT, and an INSERT that lands
 * while the app is suspended, or before the listener has subscribed, is simply
 * never delivered. `getPendingChallengesForAthlete()` is the read that closes
 * that gap. It runs:
 *  - when the owner mounts (cold start, sign-in),
 *  - when the athlete goes live,
 *  - when the app returns from the background,
 *  - whenever the challenge hook asks for it (`requestPendingChallengeResync`):
 *    a prompt cleared without a match (declined, withdrawn, expired, dead on
 *    accept), so the next challenger queued behind it is offered, and the
 *    incoming realtime channel was rebuilt after a server close, so an INSERT
 *    that landed while it was down is not lost.
 *
 * What counts as ACTIONABLE is narrower than "pending", on purpose. A
 * challenge stays `pending` for up to 7 days (`expires_at`), but the prompt
 * promises "accept and you both drop straight into the match", which is only
 * true while the challenger is still there to be dropped in. So an incoming
 * challenge is offered only when:
 *  - I am live (a prompt to an athlete who went offline is not a live prompt),
 *  - it is not expired and was sent within `PENDING_PROMPT_MAX_AGE_MS`,
 *  - its challenger is present in `lobby:online` right now.
 * Only the OLDEST such challenge is offered (spec 4.3: the prompt, and the
 * chip's multiple-incoming tap, open on the first fresh challenge, the one
 * that has waited longest), never over a prompt that is
 * already up, and each one only once per instance, so a burst of presence
 * syncs cannot re-raise one the athlete already answered.
 *
 * My own newest fresh OUTGOING challenge is put back too, so after a relaunch
 * the "Sent" plate returns and the accept broadcast still has a listener.
 *
 * And my own STALE outgoing challenges (older than the same window) are
 * withdrawn on each of those triggers (jits-celf). Nobody will answer them
 * live, but every pending row counts toward the 3-pending cap until
 * `expires_at`, 7 days out, so left alone they lock me out of challenging.
 * The one on my waiting plate right now is never touched: I can see it and
 * cancel it myself, and the prompt for it may still be up on the other side.
 */
import * as React from "react";
import { AppState, type AppStateStatus } from "react-native";
import { ARENA_CHALLENGE_FRESH_MS } from "@jits/shared/constants";
import { cancelStaleOutgoingChallenges } from "@jits/shared/api/mutations";
import { getPendingChallengesForAthlete } from "@jits/shared/api/queries";
import type { PendingChallenge } from "@jits/shared/types/composites";
import { supabase } from "../supabase/client";
import { getServerClockOffsetMs } from "./incoming-challenges";
import { subscribeIncomingChallengeEnded } from "./arena-store";
import type {
  ChallengeTimes,
  OfferIncomingOptions,
  OfferResult,
  OutgoingChallenge,
} from "./use-arena-challenge";

/**
 * How old a pending challenge can be and still be a LIVE prompt. The shared
 * constant, so web and mobile agree on what "stale" means.
 */
export const PENDING_PROMPT_MAX_AGE_MS = ARENA_CHALLENGE_FRESH_MS;

/** Mounted recovery passes; one in practice (`<ArenaBootstrap />`). */
const resyncListeners = new Set<(reofferId?: string, preferId?: string) => void>();

/**
 * Read pending challenges again now. Called by the challenge hook when a
 * prompt clears without a match, or its incoming channel was rebuilt. A
 * module-level signal rather than a prop, so the two hooks stay wired only
 * through `<ArenaBootstrap />`'s existing arguments. Ignored mid-match: the
 * match exit re-reads anyway.
 *
 * `reoffer` names a challenge whose prompt this instance raised and that was
 * then cleared WITHOUT being settled (its challenger stepped out of the
 * lobby): it is made eligible again, so recovery offers it once its
 * challenger is back on the mat, if it is still pending and fresh.
 *
 * `prefer` names a challenge the athlete asked for by opening its push
 * (`/arena?challenge=<id>`, AC-A8): it is also made eligible again, and it
 * is offered AHEAD of the oldest candidate (the default order) while it is still eligible
 * (pending, fresh, challenger on the mat). Anything else about the offer is
 * unchanged: never over a prompt that is up, never mid-match. A DIFFERENT
 * challenge tucked away with "Later" is not up (its sheet is down), so the
 * preferred one may take its place; the tucked one is not declined and is
 * offered again, back into the chip, once the prompt clears.
 */
export function requestPendingChallengeResync(
  options: { reoffer?: string; prefer?: string } = {},
): void {
  for (const listener of [...resyncListeners]) listener(options.reoffer, options.prefer);
}

export interface UsePendingChallengeRecoveryArgs {
  athleteId: string;
  isLive: boolean;
  /** True while a match screen is mounted; nothing is offered mid-match. */
  inMatch?: boolean;
  /** Whether a prompt is already up; the first prompt keeps the surface. */
  hasIncoming: boolean;
  /**
   * The prompt's challenge id when it is tucked away with "Later" (sheet
   * down), else null. Only a push-preferred challenge may replace it.
   */
  tuckedIncomingId?: string | null;
  /** Athlete ids present in `lobby:online`. */
  lobbyIds: Set<string>;
  /**
   * Whether `lobbyIds` reflects a real sync of the current lobby channel
   * (`useLobbyKnown()`). While the channel is down or rejoining the ids are
   * the ones from before the outage, so nothing is offered until a sync
   * vouches for the challenger again. Defaults to true.
   */
  lobbyKnown?: boolean;
  /** What happened to the offer; see `OfferResult`. */
  offerIncoming: (
    challengeId: string,
    challengerId: string,
    times?: ChallengeTimes,
    options?: OfferIncomingOptions,
  ) => Promise<OfferResult>;
  restoreOutgoing: (challenge: OutgoingChallenge) => void;
  /** The challenge on my waiting plate right now; never swept as stale. */
  outgoingChallengeId?: string | null;
  /** Called after stale outgoing challenges were withdrawn (roster refresh). */
  onStaleCancelled?: () => void;
  /**
   * Every successful read's fresh incoming challenges, whatever the lobby
   * says, with when the read was issued. Feeds the challenge hook's incoming
   * count (`noteIncomingRead`), so a relaunch counts the challenges already
   * waiting, and one whose UPDATE was missed stops being counted.
   */
  onIncomingRead?: (fresh: PendingChallenge[], readStartedAt: number) => void;
}

/**
 * Still answerable, and recent enough that the other side is still waiting.
 * `now` is device time; it is moved onto the server clock (the one the row's
 * timestamps are in) with the offset `incoming-challenges.ts` has learned.
 */
export function isFreshPending(c: PendingChallenge, now: number): boolean {
  const created = Date.parse(c.createdAt);
  const expires = Date.parse(c.expiresAt);
  if (Number.isNaN(created) || Number.isNaN(expires)) return false;
  const serverNow = now - getServerClockOffsetMs();
  return expires > serverNow && serverNow - created <= PENDING_PROMPT_MAX_AGE_MS;
}

/** A push preference (`prefer`) and when it was set (device time). */
export interface ChallengePreference {
  id: string;
  setAt: number;
}

/**
 * Whether a read keeps the push preference. A read issued at or after the
 * preference was set that no longer lists the challenge as fresh and pending
 * (expired, cancelled, answered elsewhere, dropped) ends it, so it cannot
 * linger as armed state for the rest of the session. A read issued BEFORE
 * the preference was set proves nothing about it and keeps it.
 */
export function keepsPreference(
  pref: ChallengePreference | null,
  freshIncoming: readonly PendingChallenge[],
  readStartedAt: number,
): boolean {
  if (!pref) return false;
  if (readStartedAt < pref.setAt) return true;
  return freshIncoming.some((c) => c.challengeId === pref.id);
}

export function usePendingChallengeRecovery({
  athleteId,
  isLive,
  inMatch = false,
  hasIncoming,
  tuckedIncomingId = null,
  lobbyIds,
  lobbyKnown = true,
  offerIncoming,
  restoreOutgoing,
  outgoingChallengeId = null,
  onStaleCancelled,
  onIncomingRead,
}: UsePendingChallengeRecoveryArgs): void {
  const [candidates, setCandidates] = React.useState<PendingChallenge[]>([]);
  /** Challenges whose prompt was actually raised by this instance. */
  const offeredRef = React.useRef<Set<string>>(new Set());
  /** Offers still waiting on their challenger read; never doubled up. */
  const offeringRef = React.useRef<Set<string>>(new Set());
  /** A challenge opened from its push: offered first while it is eligible. */
  const preferRef = React.useRef<ChallengePreference | null>(null);

  const restoreRef = React.useRef(restoreOutgoing);
  restoreRef.current = restoreOutgoing;
  const outgoingIdRef = React.useRef(outgoingChallengeId);
  outgoingIdRef.current = outgoingChallengeId;
  const staleCancelledRef = React.useRef(onStaleCancelled);
  staleCancelledRef.current = onStaleCancelled;
  const inMatchRef = React.useRef(inMatch);
  inMatchRef.current = inMatch;
  const incomingReadRef = React.useRef(onIncomingRead);
  incomingReadRef.current = onIncomingRead;

  const fetchPending = React.useCallback(async () => {
    if (!athleteId) return;
    const startedAt = Date.now();
    const result = await getPendingChallengesForAthlete(supabase, athleteId);
    // A failed read leaves things as they were: the realtime listener is
    // still up, and the next trigger reads again.
    if (!result.ok) return;
    const now = Date.now();
    // Both lists arrive newest first.
    const freshIncoming = result.data.incoming.filter((c) => isFreshPending(c, now));
    setCandidates(freshIncoming);
    if (!keepsPreference(preferRef.current, freshIncoming, startedAt)) preferRef.current = null;
    incomingReadRef.current?.(freshIncoming, startedAt);
    const mine = result.data.outgoing.find((c) => isFreshPending(c, now));
    if (mine) {
      restoreRef.current({
        challengeId: mine.challengeId,
        opponentId: mine.opponentId,
        opponentName: mine.opponentName,
        expiresAt: mine.expiresAt,
        createdAt: mine.createdAt,
      });
    }

    // Free the cap from my own stale challenges. Reuses the read above; the
    // cancel is guarded on `pending`, so one accepted a moment ago survives.
    const swept = await cancelStaleOutgoingChallenges(supabase, athleteId, {
      outgoing: result.data.outgoing,
      keepChallengeId: outgoingIdRef.current,
      // Server time: the sweep compares with the rows' own timestamps, and a
      // fast device clock must not withdraw my still-fresh challenges.
      now: now - getServerClockOffsetMs(),
    });
    if (swept.ok && swept.data.cancelled.length > 0) {
      staleCancelledRef.current?.();
    }
  }, [athleteId]);

  const fetchRef = React.useRef(fetchPending);
  fetchRef.current = fetchPending;

  // Mount, and every time the athlete goes live.
  React.useEffect(() => {
    void fetchRef.current();
  }, [athleteId]);
  React.useEffect(() => {
    if (isLive) void fetchRef.current();
  }, [isLive]);

  // Leaving a match. A prompt that was up when the match started (by a deep
  // link, say) was dropped rather than held, so read again and let a still
  // fresh one be offered again. The "already offered" memory is reset for
  // the same reason; anything actually answered is remembered by the
  // challenge hook (`settledRef`), not here.
  const wasInMatchRef = React.useRef(inMatch);
  React.useEffect(() => {
    if (inMatch === wasInMatchRef.current) return;
    wasInMatchRef.current = inMatch;
    if (inMatch) return;
    offeredRef.current.clear();
    void fetchRef.current();
  }, [inMatch]);

  // The challenge hook asked for a fresh read (see the header).
  React.useEffect(() => {
    const listener = (reofferId?: string, preferId?: string) => {
      if (reofferId) offeredRef.current.delete(reofferId);
      if (preferId) {
        offeredRef.current.delete(preferId);
        preferRef.current = { id: preferId, setAt: Date.now() };
      }
      if (!inMatchRef.current) void fetchRef.current();
    };
    resyncListeners.add(listener);
    return () => {
      resyncListeners.delete(listener);
    };
  }, []);

  // A preferred challenge that ended (cancelled, answered elsewhere, expired,
  // dropped by a read) is no longer preferred.
  React.useEffect(
    () =>
      subscribeIncomingChallengeEnded((id) => {
        if (preferRef.current?.id === id) preferRef.current = null;
      }),
    [],
  );

  // Back from the background. Tracked from "background" specifically, for
  // the same reason the live hook ignores "inactive": Control Center and the
  // notification shade are not a return.
  React.useEffect(() => {
    let wasBackground = false;
    const onChange = (next: AppStateStatus) => {
      if (next === "background") {
        wasBackground = true;
        return;
      }
      if (next !== "active" || !wasBackground) return;
      wasBackground = false;
      void fetchRef.current();
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, []);

  // Offer at most one: the OLDEST candidate whose challenger is still here
  // (first arrival, as the realtime path does; spec 4.3). Sorted here by
  // `createdAt` rather than trusting the read's order. Re-evaluated as presence
  // syncs, because the lobby is usually still empty on the first frame after
  // mount.
  React.useEffect(() => {
    if (!isLive || inMatch) return;
    // A lobby outage keeps the ids from before it: a challenger who left
    // meanwhile would still pass `lobbyIds.has`, and a prompt raised for them
    // would never be cleared by the challenger-left rule. Wait for a sync.
    if (!lobbyKnown) return;
    // A prompt that is up keeps the surface. One tucked away with "Later"
    // yields only to the challenge the athlete opened from its push (AC-A8).
    const now = Date.now();
    // A preferred challenge whose window has passed is dropped here too: this
    // effect can run long after the read that listed it.
    const stalePreferred = preferRef.current
      ? candidates.find((c) => c.challengeId === preferRef.current?.id)
      : undefined;
    if (stalePreferred && !isFreshPending(stalePreferred, now)) preferRef.current = null;
    const preferId = preferRef.current?.id ?? null;
    const replacing =
      hasIncoming && !!preferId && !!tuckedIncomingId && tuckedIncomingId !== preferId;
    if (hasIncoming && !replacing) return;
    // Freshness is re-checked here, not only at fetch: this effect re-runs on
    // every presence sync, long after the read that produced the candidates.
    const eligible = (c: PendingChallenge) =>
      !offeredRef.current.has(c.challengeId) &&
      !offeringRef.current.has(c.challengeId) &&
      lobbyIds.has(c.challengerId) &&
      isFreshPending(c, now);
    const preferred = preferId ? candidates.find((c) => c.challengeId === preferId) : undefined;
    const pick =
      preferred && eligible(preferred)
        ? preferred
        : replacing
          ? undefined
          : [...candidates]
              .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
              .find(eligible);
    if (!pick) return;
    // Marked offered once the prompt was raised, or once the challenge hook
    // says it is final (answered, withdrawn, entered), so a settled challenge
    // cannot sit at the head of the list blocking later candidates. A
    // retryable skip (another prompt up, a match starting or on screen) stays
    // eligible, and the next pass (a resync, the prompt clearing, the match
    // exit) offers it again.
    const id = pick.challengeId;
    offeringRef.current.add(id);
    const times = { createdAt: pick.createdAt, expiresAt: pick.expiresAt };
    void (replacing
      ? offerIncoming(id, pick.challengerId, times, { replaceTucked: true })
      : offerIncoming(id, pick.challengerId, times))
      .then((outcome) => {
        // A retryable skip keeps the push preference, so the next pass
        // still offers the challenge the athlete opened (AC-A8).
        if (outcome === "retry") return;
        offeredRef.current.add(id);
        // Raised or final: the push preference has done its job.
        if (preferRef.current?.id === id) preferRef.current = null;
      })
      .finally(() => {
        offeringRef.current.delete(id);
      });
  }, [candidates, lobbyIds, lobbyKnown, isLive, inMatch, hasIncoming, tuckedIncomingId, offerIncoming]);
}

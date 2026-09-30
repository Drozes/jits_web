/**
 * The `?challenge=<id>` handoff from a challenge push (spec 8, F1, AC-A8,
 * jits-dq85.11). The push lands on `/arena?challenge=<id>`
 * (`lib/notifications/handlers.ts` honours `data.route`).
 *
 * The id is copied into local state and cleared from THIS route at once, so
 * a later visit never replays it. Then:
 *  - the challenge is already the one on the prompt: a prompt tucked away
 *    with "Later" is reopened; one that is up needs nothing;
 *  - otherwise it is read (`getPendingChallengesForAthlete`), and only a
 *    challenge still pending and FRESH (the same 10-minute window recovery
 *    uses), and not dismissed on this device (a manual go-offline dropped
 *    it from the chip, decision Q3), goes on. A stale or unknown id shows nothing, no error: the push
 *    simply outlived the challenge.
 *  - live: recovery is asked to read again and offer THIS challenge first
 *    (`requestPendingChallengeResync({ prefer })`); the existing rules still
 *    apply (never over a prompt that is up, only while its challenger is on
 *    the mat), except that a DIFFERENT challenge tucked away with "Later" is
 *    not up, so this one takes the prompt from it;
 *  - offline: the Arena offers going live (`offer`, the strip's go-live).
 *    Going live makes recovery read, and the preference raises this one.
 *    The offer shows only while its challenger is on the mat (in
 *    `lobby:online`): recovery raises the prompt only then, so offering a
 *    red go-live for someone who left would take the athlete live for
 *    nothing. It is hidden while they are away and back if they return in
 *    the window. It clears itself once the athlete is live, once the
 *    challenge reaches the prompt, when its 10-minute window passes, or as
 *    soon as the challenge ends (cancelled by its challenger, answered on
 *    another device, expired, dropped by a read: the challenge hook's
 *    `notifyIncomingChallengeEnded`), so its red go-live never outlives it.
 *
 * Without a param (the athlete opened the Arena tab from its red count, not
 * from the push or the bell row), the same offer is seeded from the fresh
 * incoming challenges the bell counts (`freshIncomingCount`, the tab badge's
 * source, AC-T1): while offline, the oldest fresh challenge that is not
 * dismissed, has not ended, and whose challenger is on the mat. A seeded
 * offer never outranks a prompt already in hand (up or tucked with Later):
 * the athlete did not pick it, so the chip and the Arena strip would name
 * different challengers. A deep-linked offer, when showing, comes first.
 *
 * Every other fresh challenge the bell counts is still accounted for on the
 * Arena (spec 14, "Arena tab red count"), so a red count on the tab always
 * has something visible behind it:
 *  - `away`: fresh challenges whose challenger is OFF the mat (live or
 *    offline). The Arena cannot raise them (recovery only raises a
 *    challenger in `lobby:online`), so they get a neutral, actionless strip
 *    (`ALEX WANTS TO ROLL · 8:41 · +1`, "Not on the mat");
 *  - `moreOnMat`: offline only, fresh challenges from on-mat challengers
 *    that are neither in hand nor the offer. They are added to the leading
 *    strip's `+N` (going live raises them). While live, recovery already
 *    counts them in the Arena store's incoming count.
 */
import * as React from "react";
import { useLocalSearchParams, useNavigation } from "expo-router";
import type { NavigationProp } from "@react-navigation/native";
import { getPendingChallengesForAthlete } from "@jits/shared/api/queries";
import { isUuid } from "@jits/shared/utils";
import { supabase } from "../supabase/client";
import {
  arenaActions,
  isIncomingChallengeDismissed,
  subscribeIncomingChallengeEnded,
} from "./arena-store";
import { goLiveWithFeedback } from "./go-live-feedback";
import { freshDeadline } from "./incoming-challenges";
import { isFreshPending, requestPendingChallengeResync } from "./use-pending-challenge-recovery";
import type { IncomingChallenge } from "./use-arena-challenge";

/** A fresh challenge the athlete opened from its push while offline. */
export interface ChallengeOffer {
  challengeId: string;
  challengerId: string;
  challengerName: string;
  createdAt: string;
  expiresAt: string;
}

export interface ChallengeDeepLinkInput {
  athleteId: string | null;
  isLive: boolean;
  /** The challenge on the prompt right now (up or tucked), if any. */
  incoming: IncomingChallenge | null;
  incomingTucked: boolean;
  /** Who is on the mat (`lobby:online`), observed even while offline. */
  lobbyIds: ReadonlySet<string>;
  /**
   * Whether `lobbyIds` reflects a real sync (`useLobbyKnown()`). During a
   * lobby outage the ids are stale, so the offer stays hidden: it must not
   * show the red go-live for a challenger who may have left. Defaults to true.
   */
  lobbyKnown?: boolean;
  /**
   * The bell's fresh incoming count (`useFreshIncomingCount()`, which also
   * drives the Arena tab's red count). While offline and above 0, the fresh
   * incoming challenges are read so the Arena can offer one without a param.
   * Defaults to 0 (no read).
   */
  freshIncomingCount?: number;
}

export interface ChallengeDeepLink {
  /**
   * Set only while offline with a fresh deep-linked challenge whose
   * challenger is on the mat (or, with no prompt in hand, one seeded from
   * the bell's fresh count).
   */
  offer: ChallengeOffer | null;
  /**
   * Fresh incoming challenges whose challenger is off the mat, oldest
   * first, while the lobby is known. Never the prompt in hand nor the offer.
   */
  away: ChallengeOffer[];
  /**
   * Offline only: fresh on-mat challenges that are neither in hand nor the
   * offer (the leading strip's `+N` adds them). 0 while live.
   */
  moreOnMat: number;
  /**
   * Go live to answer the offer. Guarded like every live tap (the switch
   * cooldown may swallow it, silently); a failed go-live says so. Recovery
   * raises the prompt once live.
   */
  acceptOffer: () => void;
}

export function useChallengeDeepLink({
  athleteId,
  isLive,
  incoming,
  incomingTucked,
  lobbyIds,
  lobbyKnown = true,
  freshIncomingCount = 0,
}: ChallengeDeepLinkInput): ChallengeDeepLink {
  const navigation = useNavigation<NavigationProp<{ arena: { challenge?: string } }>>();
  const params = useLocalSearchParams<{ challenge?: string | string[] }>();
  const param = Array.isArray(params.challenge) ? params.challenge[0] : params.challenge;
  const [requested, setRequested] = React.useState<string | null>(null);
  const [offer, setOffer] = React.useState<ChallengeOffer | null>(null);
  /** Fresh incoming challenges to offer without a param, oldest first. */
  const [fallback, setFallback] = React.useState<ChallengeOffer[]>(NO_OFFERS);

  const liveRef = React.useRef(isLive);
  liveRef.current = isLive;
  const incomingRef = React.useRef({ incoming, incomingTucked });
  incomingRef.current = { incoming, incomingTucked };

  // Challenges that ended while this screen was up. The offer for one goes
  // at once, and a read still in flight for one never raises it.
  const endedRef = React.useRef<Set<string>>(new Set());
  React.useEffect(
    () =>
      subscribeIncomingChallengeEnded((id) => {
        endedRef.current.add(id);
        setOffer((current) => (current?.challengeId === id ? null : current));
        setFallback((current) =>
          current.some((c) => c.challengeId === id)
            ? current.filter((c) => c.challengeId !== id)
            : current,
        );
      }),
    [],
  );

  // Copy the param, then clear it on this route.
  React.useEffect(() => {
    if (!param) return;
    navigation.setParams({ challenge: undefined });
    // Only a real id ever reaches a query filter.
    if (!isUuid(param)) return;
    setRequested(param);
  }, [param, navigation]);

  // Resolve a requested id once.
  React.useEffect(() => {
    if (!requested || !athleteId) return;
    const id = requested;
    const current = incomingRef.current;
    if (current.incoming?.challengeId === id) {
      if (current.incomingTucked) arenaActions.reopenIncoming();
      setRequested(null);
      return;
    }
    let cancelled = false;
    void getPendingChallengesForAthlete(supabase, athleteId)
      .then((res) => {
        if (cancelled || !res.ok) return;
        const hit = res.data.incoming.find((c) => c.challengeId === id);
        if (!hit || !isFreshPending(hit, Date.now())) return;
        if (endedRef.current.has(id)) return;
        // Dropped for good on this device (a manual go-offline with it
        // tucked away, decision Q3; or its live window passed): recovery
        // never raises it again, so neither a resync nor a red go-live.
        if (isIncomingChallengeDismissed(id)) return;
        // Recovery offers it first whenever it may (now if live, once live
        // otherwise).
        requestPendingChallengeResync({ prefer: id });
        if (liveRef.current) return;
        setOffer({
          challengeId: hit.challengeId,
          challengerId: hit.challengerId,
          challengerName: hit.challengerName,
          createdAt: hit.createdAt,
          expiresAt: hit.expiresAt,
        });
      })
      .catch(() => {
        // Nothing to show for a read that failed; the push was a hint.
      })
      .finally(() => {
        if (!cancelled) setRequested(null);
      });
    return () => {
      cancelled = true;
    };
  }, [requested, athleteId]);

  // The offer ends once live, once it reached the prompt, or at its window.
  React.useEffect(() => {
    if (!offer) return;
    if (isLive || incoming?.challengeId === offer.challengeId) {
      setOffer(null);
      return;
    }
    const deadline = freshDeadline(offer);
    if (deadline === null) return;
    const t = setTimeout(() => setOffer(null), Math.max(0, deadline - Date.now()));
    return () => clearTimeout(t);
  }, [offer, isLive, incoming]);

  // Read the fresh incoming challenges the bell counts (live or offline).
  // Re-read whenever that count changes, and on a live switch. Offline they
  // seed the offer; either way the ones the Arena cannot raise are `away`.
  React.useEffect(() => {
    if (!athleteId || freshIncomingCount <= 0) {
      setFallback(NO_OFFERS);
      return;
    }
    let cancelled = false;
    void getPendingChallengesForAthlete(supabase, athleteId)
      .then((res) => {
        if (cancelled || !res.ok) return;
        const now = Date.now();
        const fresh = res.data.incoming
          .filter(
            (c) =>
              isFreshPending(c, now) &&
              !endedRef.current.has(c.challengeId) &&
              !isIncomingChallengeDismissed(c.challengeId),
          )
          .map(
            (c): ChallengeOffer => ({
              challengeId: c.challengeId,
              challengerId: c.challengerId,
              challengerName: c.challengerName,
              createdAt: c.createdAt,
              expiresAt: c.expiresAt,
            }),
          )
          .sort((a, b) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0));
        setFallback(fresh.length > 0 ? fresh : NO_OFFERS);
      })
      .catch(() => {
        // Nothing to offer for a failed read; the bell still lists them.
      });
    return () => {
      cancelled = true;
    };
  }, [athleteId, isLive, freshIncomingCount]);

  // Drop each seeded offer at the end of its window.
  React.useEffect(() => {
    if (fallback.length === 0) return;
    let next: number | null = null;
    for (const c of fallback) {
      const d = freshDeadline(c);
      if (d !== null && (next === null || d < next)) next = d;
    }
    if (next === null) return;
    const t = setTimeout(
      () =>
        setFallback((current) => {
          const now = Date.now();
          const kept = current.filter((c) => {
            const d = freshDeadline(c);
            return d !== null && d > now;
          });
          return kept.length === current.length ? current : kept;
        }),
      Math.max(0, next - Date.now()),
    );
    return () => clearTimeout(t);
  }, [fallback]);

  const onMat = (c: ChallengeOffer) => lobbyKnown && lobbyIds.has(c.challengerId);
  // Fresh, not ended, not dismissed, and not the prompt in hand.
  const candidates = fallback.filter(
    (c) =>
      c.challengeId !== incoming?.challengeId &&
      !endedRef.current.has(c.challengeId) &&
      !isIncomingChallengeDismissed(c.challengeId),
  );
  const visible =
    (offer && onMat(offer) ? offer : null) ??
    // A seeded offer never outranks a prompt in hand (see the header).
    (isLive || incoming ? null : (candidates.find(onMat) ?? null));
  // A deep-linked offer hidden because its challenger left is `away` too.
  const unshown = candidates.filter((c) => c.challengeId !== visible?.challengeId);
  // Only while the lobby is known: during an outage "not on the mat" could
  // be false, and the control bar already reads CONNECTING.
  const away = lobbyKnown ? unshown.filter((c) => !lobbyIds.has(c.challengerId)) : NO_OFFERS;
  const moreOnMat = isLive ? 0 : unshown.filter(onMat).length;

  const visibleId = visible?.challengeId ?? null;
  const visibleIdRef = React.useRef(visibleId);
  visibleIdRef.current = visibleId;
  const acceptOffer = React.useCallback(() => {
    // Recovery raises THIS challenge first once live (a deep-linked offer
    // already asked; a seeded one has not).
    const id = visibleIdRef.current;
    if (id) requestPendingChallengeResync({ prefer: id });
    void goLiveWithFeedback();
  }, []);

  return { offer: visible, away: away.length > 0 ? away : NO_OFFERS, moreOnMat, acceptOffer };
}

const NO_OFFERS: ChallengeOffer[] = [];

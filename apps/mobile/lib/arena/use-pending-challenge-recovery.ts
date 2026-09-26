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
 * Only the newest such challenge is offered, never over a prompt that is
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
import type { OutgoingChallenge } from "./use-arena-challenge";

/**
 * How old a pending challenge can be and still be a LIVE prompt. The shared
 * constant, so web and mobile agree on what "stale" means.
 */
export const PENDING_PROMPT_MAX_AGE_MS = ARENA_CHALLENGE_FRESH_MS;

/** Mounted recovery passes; one in practice (`<ArenaBootstrap />`). */
const resyncListeners = new Set<() => void>();

/**
 * Read pending challenges again now. Called by the challenge hook when a
 * prompt clears without a match, or its incoming channel was rebuilt. A
 * module-level signal rather than a prop, so the two hooks stay wired only
 * through `<ArenaBootstrap />`'s existing arguments. Ignored mid-match: the
 * match exit re-reads anyway.
 */
export function requestPendingChallengeResync(): void {
  for (const listener of [...resyncListeners]) listener();
}

export interface UsePendingChallengeRecoveryArgs {
  athleteId: string;
  isLive: boolean;
  /** True while a match screen is mounted; nothing is offered mid-match. */
  inMatch?: boolean;
  /** Whether a prompt is already up; the first prompt keeps the surface. */
  hasIncoming: boolean;
  /** Athlete ids present in `lobby:online`. */
  lobbyIds: Set<string>;
  /** Resolves true only when the prompt was actually raised. */
  offerIncoming: (challengeId: string, challengerId: string) => Promise<boolean>;
  restoreOutgoing: (challenge: OutgoingChallenge) => void;
  /** The challenge on my waiting plate right now; never swept as stale. */
  outgoingChallengeId?: string | null;
  /** Called after stale outgoing challenges were withdrawn (roster refresh). */
  onStaleCancelled?: () => void;
}

/** Still answerable, and recent enough that the other side is still waiting. */
export function isFreshPending(c: PendingChallenge, now: number): boolean {
  const created = Date.parse(c.createdAt);
  const expires = Date.parse(c.expiresAt);
  if (Number.isNaN(created) || Number.isNaN(expires)) return false;
  return expires > now && now - created <= PENDING_PROMPT_MAX_AGE_MS;
}

export function usePendingChallengeRecovery({
  athleteId,
  isLive,
  inMatch = false,
  hasIncoming,
  lobbyIds,
  offerIncoming,
  restoreOutgoing,
  outgoingChallengeId = null,
  onStaleCancelled,
}: UsePendingChallengeRecoveryArgs): void {
  const [candidates, setCandidates] = React.useState<PendingChallenge[]>([]);
  /** Challenges whose prompt was actually raised by this instance. */
  const offeredRef = React.useRef<Set<string>>(new Set());
  /** Offers still waiting on their challenger read; never doubled up. */
  const offeringRef = React.useRef<Set<string>>(new Set());

  const restoreRef = React.useRef(restoreOutgoing);
  restoreRef.current = restoreOutgoing;
  const outgoingIdRef = React.useRef(outgoingChallengeId);
  outgoingIdRef.current = outgoingChallengeId;
  const staleCancelledRef = React.useRef(onStaleCancelled);
  staleCancelledRef.current = onStaleCancelled;
  const inMatchRef = React.useRef(inMatch);
  inMatchRef.current = inMatch;

  const fetchPending = React.useCallback(async () => {
    if (!athleteId) return;
    const result = await getPendingChallengesForAthlete(supabase, athleteId);
    // A failed read leaves things as they were: the realtime listener is
    // still up, and the next trigger reads again.
    if (!result.ok) return;
    const now = Date.now();
    // Both lists arrive newest first.
    setCandidates(result.data.incoming.filter((c) => isFreshPending(c, now)));
    const mine = result.data.outgoing.find((c) => isFreshPending(c, now));
    if (mine) {
      restoreRef.current({
        challengeId: mine.challengeId,
        opponentId: mine.opponentId,
        opponentName: mine.opponentName,
        expiresAt: mine.expiresAt,
      });
    }

    // Free the cap from my own stale challenges. Reuses the read above; the
    // cancel is guarded on `pending`, so one accepted a moment ago survives.
    const swept = await cancelStaleOutgoingChallenges(supabase, athleteId, {
      outgoing: result.data.outgoing,
      keepChallengeId: outgoingIdRef.current,
      now,
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
    const listener = () => {
      if (!inMatchRef.current) void fetchRef.current();
    };
    resyncListeners.add(listener);
    return () => {
      resyncListeners.delete(listener);
    };
  }, []);

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

  // Offer at most one: the newest candidate whose challenger is still here.
  // Re-evaluated as presence syncs, because the lobby is usually still empty
  // on the first frame after mount.
  React.useEffect(() => {
    if (!isLive || inMatch || hasIncoming) return;
    // Freshness is re-checked here, not only at fetch: this effect re-runs on
    // every presence sync, long after the read that produced the candidates.
    const now = Date.now();
    const pick = candidates.find(
      (c) =>
        !offeredRef.current.has(c.challengeId) &&
        !offeringRef.current.has(c.challengeId) &&
        lobbyIds.has(c.challengerId) &&
        isFreshPending(c, now),
    );
    if (!pick) return;
    // Marked offered once the prompt was really raised. An offer the
    // challenge hook skipped because a match started during the challenger
    // read stays eligible and is offered again after the match. Any other
    // skip (already answered, another prompt up) is final, as before, so a
    // settled challenge cannot sit at the head of the list blocking newer
    // candidates.
    const id = pick.challengeId;
    offeringRef.current.add(id);
    void offerIncoming(id, pick.challengerId)
      .then((raised) => {
        if (raised || !inMatchRef.current) offeredRef.current.add(id);
      })
      .finally(() => {
        offeringRef.current.delete(id);
      });
  }, [candidates, lobbyIds, isLive, inMatch, hasIncoming, offerIncoming]);
}

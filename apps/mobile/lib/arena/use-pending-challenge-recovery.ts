/**
 * Surface a live challenge that arrived while nobody was listening.
 *
 * The incoming prompt is driven by a realtime INSERT, and an INSERT that lands
 * while the app is suspended, or before the listener has subscribed, is simply
 * never delivered. `getPendingChallengesForAthlete()` is the read that closes
 * that gap. It runs:
 *  - when the owner mounts (cold start, sign-in),
 *  - when the athlete goes live,
 *  - when the app returns from the background.
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
 */
import * as React from "react";
import { AppState, type AppStateStatus } from "react-native";
import { getPendingChallengesForAthlete } from "@jits/shared/api/queries";
import type { PendingChallenge } from "@jits/shared/types/composites";
import { supabase } from "../supabase/client";
import type { OutgoingChallenge } from "./use-arena-challenge";

/** How old a pending challenge can be and still be a LIVE prompt. */
export const PENDING_PROMPT_MAX_AGE_MS = 10 * 60_000;

export interface UsePendingChallengeRecoveryArgs {
  athleteId: string;
  isLive: boolean;
  /** True while a match screen is mounted; nothing is offered mid-match. */
  inMatch?: boolean;
  /** Whether a prompt is already up; the first prompt keeps the surface. */
  hasIncoming: boolean;
  /** Athlete ids present in `lobby:online`. */
  lobbyIds: Set<string>;
  offerIncoming: (challengeId: string, challengerId: string) => Promise<void>;
  restoreOutgoing: (challenge: OutgoingChallenge) => void;
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
}: UsePendingChallengeRecoveryArgs): void {
  const [candidates, setCandidates] = React.useState<PendingChallenge[]>([]);
  const offeredRef = React.useRef<Set<string>>(new Set());

  const restoreRef = React.useRef(restoreOutgoing);
  restoreRef.current = restoreOutgoing;

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
      });
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
        lobbyIds.has(c.challengerId) &&
        isFreshPending(c, now),
    );
    if (!pick) return;
    offeredRef.current.add(pick.challengeId);
    void offerIncoming(pick.challengeId, pick.challengerId);
  }, [candidates, lobbyIds, isLive, inMatch, hasIncoming, offerIncoming]);
}

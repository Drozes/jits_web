import { ARENA_CHALLENGE_FRESH_MS } from "../constants";

/**
 * Whether a challenge created at `createdAt` is still inside the live Arena
 * window (`ARENA_CHALLENGE_FRESH_MS`). The boundary is INCLUSIVE: a challenge
 * exactly `ARENA_CHALLENGE_FRESH_MS` old is still fresh, one millisecond later
 * it is not. This is the one rule web and mobile share, so the Arena, the
 * bell and the stale-outgoing sweep (`isStaleOutgoingChallenge`, strictly
 * greater) never disagree at the boundary.
 *
 * An unparseable or missing timestamp is not fresh: nothing is restored,
 * joined, counted or shown as pending on a row we cannot date.
 */
export function isFreshChallenge(
  createdAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!createdAt) return false;
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return false;
  return now - created <= ARENA_CHALLENGE_FRESH_MS;
}

/**
 * The first instant a challenge created at `createdAt` is no longer fresh,
 * or null when it cannot be dated.
 */
export function challengeStaleAt(createdAt: string | null | undefined): number | null {
  if (!createdAt) return null;
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return null;
  return created + ARENA_CHALLENGE_FRESH_MS + 1;
}

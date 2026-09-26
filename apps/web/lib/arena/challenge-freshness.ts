import { ARENA_CHALLENGE_FRESH_MS } from "@jits/shared/constants";

/**
 * Whether a challenge created at `createdAt` is still inside the live Arena
 * window (`ARENA_CHALLENGE_FRESH_MS`). An unparseable or missing timestamp is
 * not fresh: nothing is restored, joined or shown as pending on a row we
 * cannot date.
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

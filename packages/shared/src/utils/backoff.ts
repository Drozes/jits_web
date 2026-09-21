/**
 * Exponential backoff with jitter, shared by both apps' video-upload retry
 * loops (mobile `lib/video/video-upload-manager.ts`, web
 * `hooks/use-video-recorder.ts`).
 *
 * WHY JITTER. Every athlete in a gym finishes their match on the same
 * timekeeper cue and every phone on the same congested gym wifi starts
 * uploading a 300-600 MB clip at the same moment. Undithered exponential
 * backoff makes them all retry in lockstep, which reproduces the exact
 * congestion that caused the first failure. Spreading the retries is the
 * point; the exponent alone is not enough.
 *
 * WHY "EQUAL JITTER" AND NOT "FULL JITTER". Full jitter (`random() * ceiling`)
 * can return a delay of ~0 ms, which turns the first retry of a genuinely
 * dead link into an immediate re-attempt -- the behaviour this replaces.
 * Equal jitter keeps a hard floor of half the ceiling, so a retry is always
 * meaningfully later than the failure that triggered it, while still
 * dispersing a fleet of clients across the window.
 */
export interface BackoffOptions {
  /** Delay for attempt 1's ceiling, doubled per subsequent attempt. */
  baseMs: number;
  /** Hard cap on the ceiling, so a long retry chain never sleeps for hours. */
  maxMs: number;
  /** Injectable for deterministic tests. Defaults to `Math.random`. */
  random?: () => number;
}

/**
 * Delay before retry number `attempt` (1-based: `attempt === 1` is the delay
 * after the FIRST failure). Always in `[ceiling / 2, ceiling]` where
 * `ceiling = min(maxMs, baseMs * 2 ** (attempt - 1))`.
 */
export function backoffDelayMs(
  attempt: number,
  { baseMs, maxMs, random = Math.random }: BackoffOptions,
): number {
  // Clamp the exponent before the shift: `2 ** 1024` is Infinity, and
  // `Infinity * 0` (a random() of exactly 0) is NaN, which would be passed
  // straight to setTimeout and fire immediately.
  const exponent = Math.min(Math.max(attempt, 1) - 1, 30);
  const ceiling = Math.min(maxMs, baseMs * 2 ** exponent);
  const half = ceiling / 2;
  return Math.round(half + random() * half);
}

/**
 * The freshness countdown for a live challenge: `m:ss` until 10 minutes after
 * the row's `created_at` (`ARENA_CHALLENGE_FRESH_MS`), or its `expires_at` if
 * that is sooner. Read through `freshRemainingMs`, so it runs on the same
 * server-clock-corrected deadline that clears the prompt when it passes.
 *
 * The text changes once a second; that is a text update, not an animation
 * (brand rule: no new animations).
 */
import * as React from "react";
import { freshRemainingMs } from "./incoming-challenges";

/**
 * `m:ss`, rounded UP to the whole second, so a fresh challenge reads `10:00`
 * and `0:00` only once the window has actually passed.
 */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

/** The same, spoken: "8 minutes 41 seconds". */
export function spokenCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  const parts: string[] = [];
  if (m > 0) parts.push(`${m} minute${m === 1 ? "" : "s"}`);
  if (s > 0 || m === 0) parts.push(`${s} second${s === 1 ? "" : "s"}`);
  return parts.join(" ");
}

/**
 * The ms until a countdown showing `ceil(remainingMs / 1000)` seconds next
 * changes: the countdown's own whole-second boundary, so `0:01` turns over on
 * time (AC-H7).
 */
export function msToNextSecond(remainingMs: number): number {
  return remainingMs % 1000 || 1000;
}

/** Whether two remaining times read as the same whole second (null only matches null). */
function sameSecond(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  return Math.max(0, Math.ceil(a / 1000)) === Math.max(0, Math.ceil(b / 1000));
}

/**
 * Milliseconds left in the challenge's live window, re-read on each whole
 * second of the remaining time while `challenge` is set and `active` (default
 * true). Null when there is no challenge or neither timestamp is known (no
 * countdown is shown then).
 *
 * This is the one countdown ticker: the header chip, the prompt sheet and
 * the Mat Board strips all use it (or its `msToNextSecond` boundary rule), so
 * surfaces showing the same challenge side by side read the same `m:ss` and
 * turn over together.
 *
 * `active` false (an unfocused tab) stops the timer and freezes the value;
 * turning it back on re-reads during that render, so the first frame after
 * refocus is never stale.
 */
export function useFreshCountdown(
  challenge: { createdAt?: string | null; expiresAt?: string | null } | null,
  active: boolean = true,
): number | null {
  const createdAt = challenge?.createdAt ?? null;
  const expiresAt = challenge?.expiresAt ?? null;
  const has = challenge !== null;
  const read = React.useCallback(
    () => (has ? freshRemainingMs({ createdAt, expiresAt }, Date.now()) : null),
    [has, createdAt, expiresAt],
  );
  // The value is stored WITH the reader that produced it (and whether it was
  // ticking). When the inputs change (the prompt moving straight from
  // challenge A to challenge B), or the countdown resumes, the stored entry
  // no longer matches, and the new value is derived during this render rather
  // than in the effect after it: otherwise the first committed frame for B
  // would show A's remaining time, or a resumed tab its frozen one.
  const [state, setState] = React.useState(() => ({ read, active, value: read() }));
  let current = state;
  if (state.read !== read || state.active !== active) {
    current = { read, active, value: read() };
    setState(current);
  }

  React.useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Scheduled to the next whole-second boundary of the remaining time, so
    // the text turns over on the second rather than drifting up to 1s late.
    // Stops scheduling at 0: no timer outlives the window.
    const tick = () => {
      const value = read();
      // Bail out when the DISPLAYED second is unchanged (m:ss and the spoken
      // label both round up to the whole second): raw milliseconds almost
      // never match, so comparing them would re-render on every tick,
      // including the one run right after mount.
      setState((prev) =>
        prev.read === read && prev.active === active && sameSecond(prev.value, value)
          ? prev
          : { read, active, value },
      );
      if (value === null || value <= 0) return;
      timer = setTimeout(tick, msToNextSecond(value));
    };
    tick();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [read, active]);

  return current.value;
}

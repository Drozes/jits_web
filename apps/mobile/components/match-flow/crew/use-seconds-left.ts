import * as React from "react";
import { getServerClockOffsetMs } from "@/lib/arena/incoming-challenges";

/**
 * The device clock on the server's clock: minus the offset the Arena learned
 * (`getServerClockOffsetMs`, 0 until it has learned one). Every
 * timekeeper-mode deadline is a server timestamp (`expires_at`,
 * `timekeeper_deadline_at`), so a phone whose clock runs ahead or behind
 * counts down to the instant the server lapses or cancels at.
 */
export function serverNow(): number {
  return Date.now() - getServerClockOffsetMs();
}

/** Milliseconds left until `at` on the server's clock (0 or less once it passed); null when unknown. */
export function msLeft(at: string | null | undefined, now: number = serverNow()): number | null {
  const target = at ? Date.parse(at) : NaN;
  return Number.isFinite(target) ? target - now : null;
}

/** True once `at` has passed on the server's clock; false when unknown. */
export function hasPassed(at: string | null | undefined, now: number = serverNow()): boolean {
  const left = msLeft(at, now);
  return left != null && left <= 0;
}

/** Whole seconds left until `at`, rounded up (so a fresh 2:00 reads 2:00 and 0:00 only once it passed); null when unknown. */
export function secondsLeft(at: string | null | undefined, now: number = serverNow()): number | null {
  const left = msLeft(at, now);
  return left == null ? null : Math.max(0, Math.ceil(left / 1000));
}

/**
 * Re-render once `at` passes, and nothing else: for a decision read with
 * `hasPassed` during render (an open request that lapsed, spec 7).
 */
export function useRerenderAt(at: string | null | undefined): void {
  const [, bump] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    const left = msLeft(at);
    if (left == null || left <= 0) return;
    const t = setTimeout(bump, left);
    return () => clearTimeout(t);
  }, [at]);
}

/**
 * `secondsLeft(at)`, re-read on each whole second until it reaches 0 (the
 * timekeeper-mode countdowns: TK-W1 on the picker, TK-T5 on the asked
 * person's sheet). A text update once a second, not an animation.
 */
export function useSecondsLeft(at: string | null | undefined): number | null {
  const [value, setValue] = React.useState(() => secondsLeft(at));
  React.useEffect(() => {
    setValue(secondsLeft(at));
    if (msLeft(at) == null) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      const remainingMs = msLeft(at) ?? 0;
      if (remainingMs <= 0) return;
      // The next whole-second boundary of the remaining time, so 0:01 turns over on time.
      timer = setTimeout(() => {
        setValue(secondsLeft(at));
        schedule();
      }, remainingMs % 1000 || 1000);
    };
    schedule();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [at]);
  return value;
}

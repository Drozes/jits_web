/**
 * Pure date/time helpers for the gym-owner one-time session editor (H3).
 *
 * The session-edit sheet keeps its draft as two local-time `Date` values (start
 * + end). These helpers combine a date and a time into a single instant, derive
 * an end instant from a duration, and produce the ISO strings the
 * createSession / updateSession mutations expect. Kept RN-free so they stay
 * unit-testable in isolation.
 */

/** Milliseconds in one minute / hour, for duration math. */
export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;

/**
 * Combine the calendar date of `date` with the hours/minutes of `time` into a
 * new local-time Date. Seconds and millis are zeroed so the resulting instant
 * lands cleanly on the chosen minute.
 */
export function combineDateAndTime(date: Date, time: Date): Date {
  const combined = new Date(date);
  combined.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return combined;
}

/** End instant = start + durationHours, as a new Date (start is not mutated). */
export function addHours(start: Date, durationHours: number): Date {
  return new Date(start.getTime() + durationHours * HOUR_MS);
}

/**
 * Whole-hour duration between two instants, rounded to the nearest hour and
 * floored at 1. Used to seed the duration preset when editing an existing
 * session whose start/end came back from the backend.
 */
export function durationHours(start: Date, end: Date): number {
  const diffMs = end.getTime() - start.getTime();
  if (diffMs <= 0) return 1;
  return Math.max(1, Math.round(diffMs / HOUR_MS));
}

/**
 * "SAT" + "2:00 PM" parts for an H2 session row. Locale-aware; the weekday is
 * upper-cased for the mono-caps row label.
 */
export function formatSessionRowParts(iso: string): { day: string; time: string } {
  const d = new Date(iso);
  const day = d
    .toLocaleDateString(undefined, { weekday: "short" })
    .toUpperCase();
  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return { day, time };
}

/** "One-time · May 16" sub-label for an H2 session row (one-time only). */
export function formatSessionRowDate(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `One-time · ${date}`;
}

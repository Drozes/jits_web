/**
 * A tab's status mark (spec arena-live-chip section 7, jits-dq85.9). Static:
 * none of the three marks the bar draws animates.
 *
 * - `count`: red count (Signal Red fill), "99+" past 99, counts floored to
 *   whole numbers. At 0 (or less, or non-finite) it shows nothing, whatever
 *   its label: red on the tab bar means only "someone wants you" (spec
 *   section 3), so there is no red text badge. With `inIcon`, the tab's own
 *   icon draws the count (the Arena tab's countable embers, Adding Flare
 *   [09.2], 1 to `MAX_COUNTABLE_EMBERS`), so the bar draws no pill; VoiceOver
 *   still reads the count exactly as it would the pill.
 * - `dot`: a static green dot (`state-positive`), no pulse.
 * - `ring`: a hollow ink-3 ring.
 *
 * `label` is what VoiceOver reads after the tab name (as the button's
 * accessibility VALUE, so the tab's accessibility LABEL stays exactly its
 * title: the match-loop harness finds tabs by that label). A positive count
 * always reads its number (see `badgeText`), defaulting to "N new"; a dot or
 * ring must say what it means.
 */
export type TabBadge =
  | { kind: "count"; count: number; label?: string; inIcon?: boolean }
  | { kind: "dot"; label: string }
  | { kind: "ring"; label: string };

/** A badge count as shown: whole numbers, "99+" past 99. */
export function formatBadgeCount(count: number): string {
  const whole = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  return whole > 99 ? "99+" : String(whole);
}

/**
 * The most pending challenges the Arena tab shows as countable embers (one
 * ember each, Adding Flare [09.2]). Above this the red count pill returns.
 */
export const MAX_COUNTABLE_EMBERS = 3;

/**
 * How many countable embers a pending count draws: the count itself from 1
 * to `MAX_COUNTABLE_EMBERS`, otherwise 0 (nothing pending, or the pill).
 */
export function countableEmbers(count: number): number {
  const whole = Number.isFinite(count) ? Math.floor(count) : 0;
  return whole >= 1 && whole <= MAX_COUNTABLE_EMBERS ? whole : 0;
}

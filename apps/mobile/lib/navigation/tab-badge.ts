/**
 * A tab's status mark (spec arena-live-chip section 7, jits-dq85.9). Static:
 * none of the three animates.
 *
 * - `count`: red count (Signal Red fill), "99+" past 99, counts floored to
 *   whole numbers. At 0 (or less, or non-finite) it shows nothing, whatever
 *   its label: red on the tab bar means only "someone wants you" (spec
 *   section 3), so there is no red text badge.
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
  | { kind: "count"; count: number; label?: string }
  | { kind: "dot"; label: string }
  | { kind: "ring"; label: string };

/** A badge count as shown: whole numbers, "99+" past 99. */
export function formatBadgeCount(count: number): string {
  const whole = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  return whole > 99 ? "99+" : String(whole);
}

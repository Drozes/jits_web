/**
 * Formats the time remaining until `iso` as a compact "3H 14M" countdown for
 * the gym-owner hub next-session plate. Unlike shared `formatTimeUntil`, this
 * has no 2-hour ceiling — the hub shows the next session however far out it is.
 *
 * Returns "0M" once the start time has passed. Pure (no RN deps) so it stays
 * unit-testable in isolation.
 */
export function formatCountdown(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs <= 0) return "0M";
  const totalMin = Math.floor(diffMs / 60_000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}D ${hours}H`;
  if (hours > 0) return `${hours}H ${mins}M`;
  return `${mins}M`;
}

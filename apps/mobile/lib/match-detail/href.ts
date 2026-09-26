/**
 * Route of the pushed match detail screen (`app/(app)/match-detail/[matchId].tsx`).
 * The one place history rows, Past Match Videos and the wizard summary build it,
 * so a route move is a one-line change. Typed routes are off, so this is a plain string.
 */
export function matchDetailHref(matchId: string): string {
  return `/(app)/match-detail/${matchId}`;
}

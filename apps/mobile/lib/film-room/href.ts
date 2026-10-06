/**
 * Route of the Matches tab (`app/(app)/(tabs)/matches/`), the athlete's whole
 * match history. It replaced the pushed Film Room screen (spec
 * specs/matches-tab/spec.md PM2); `app/(app)/film-room.tsx` is now only a
 * redirect here.
 */
export const MATCHES_TAB_HREF = "/(app)/(tabs)/matches";

/**
 * Route of the player (`app/(app)/video/[id].tsx`), optionally starting at
 * `t` seconds (whole seconds; the player clamps to the clip).
 */
export function videoHref(videoId: string, t?: number | null): string {
  const base = `/(app)/video/${videoId}`;
  if (t == null || !Number.isFinite(t) || t <= 0) return base;
  return `${base}?t=${Math.floor(t)}`;
}

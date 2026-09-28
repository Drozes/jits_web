/** Route of the Film Room library (`app/(app)/film-room.tsx`). */
export const FILM_ROOM_HREF = "/(app)/film-room";

/**
 * Route of the player (`app/(app)/video/[id].tsx`), optionally starting at
 * `t` seconds (whole seconds; the player clamps to the clip).
 */
export function videoHref(videoId: string, t?: number | null): string {
  const base = `/(app)/video/${videoId}`;
  if (t == null || !Number.isFinite(t) || t <= 0) return base;
  return `${base}?t=${Math.floor(t)}`;
}

/**
 * The few viewer strings the share module's `SHARE_COPY` does not cover
 * (jr_be spec 014 section 16.6.3). Everything share / save / sheet related
 * comes from `SHARE_COPY` (`@/lib/highlight-share`); strings shared with the
 * phase-1 card (not found, replaced, the regenerating banner, "Improve this
 * reel") come from `highlight-copy.ts`.
 */
export const VIEWER_COPY = {
  close: "Close",
  back: "Back",
  paused: "Highlight reels are paused right now.",
  cannotPlay: "We couldn't play this reel right now.",
} as const;

/** `progress` is a 0..1 fraction (or null before the first byte): whole percent. */
export function progressPercent(progress: number | null): number {
  if (progress == null || !Number.isFinite(progress)) return 0;
  return Math.max(0, Math.min(100, Math.round(progress * 100)));
}

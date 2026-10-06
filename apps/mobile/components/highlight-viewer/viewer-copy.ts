/**
 * The few viewer strings the share module's `SHARE_COPY` does not cover
 * (jr_be spec 015 section 16.6.3). Everything share / save / sheet related
 * comes from `SHARE_COPY` (`@/lib/highlight-share`); strings shared with the
 * phase-1 card (not found, replaced, the regenerating banner, "Improve this
 * reel") come from `highlight-copy.ts`.
 */
export const VIEWER_COPY = {
  close: "Close",
  back: "Back",
  paused: "Highlights are paused right now.",
  cannotPlay: "We couldn't play this reel right now.",
  making: "Your reel is being made. It will play here as soon as it's ready.",
  noHighlight: "No highlight for this video.",
  /** C-V1 (specs/matches-tab section 11). */
  swipeHint: "Swipe up for the next one",
  /** C-V2. */
  caughtUp: "You're all caught up",
  openMatch: "Open match",
  /** C-V5. */
  viewProfile: "View profile",
  /** Short visible rail labels (C-V6 to C-V8); a11y labels stay the full strings. */
  railShare: "Share",
  railSave: "Save",
  railImprove: "Improve",
  /** C-V9: the Photos permission fallback's button. */
  settings: "Settings",
  mute: "Mute",
  unmute: "Unmute",
} as const;

/** `progress` is a 0..1 fraction (or null before the first byte): whole percent. */
export function progressPercent(progress: number | null): number {
  if (progress == null || !Number.isFinite(progress)) return 0;
  return Math.max(0, Math.min(100, Math.round(progress * 100)));
}

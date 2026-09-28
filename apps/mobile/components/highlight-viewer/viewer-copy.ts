/**
 * Every string the full-screen highlight viewer and its pre-share sheet show
 * (jr_be spec 014 section 16.6.3), in one place so tests assert the exact copy.
 * Strings shared with the phase-1 card (not found, invalidated, the
 * regenerating banner, "Improve this reel") come from `highlight-copy.ts`.
 */
export const VIEWER_COPY = {
  title: "Your highlight",
  close: "Close",
  back: "Back",
  tryAgain: "Try again",
  shareInstagram: "Share to Instagram",
  shareReel: "Share reel",
  saveToPhotos: "Save to Photos",
  saving: "Saving…",
  savePermission: "Allow ELO RATED to add to Photos in Settings to save your reel.",
  openSettings: "Open Settings",
  paused: "Highlight reels are paused right now.",
  cannotPlay: "We couldn't play this reel right now.",
  sheetTitle: "Share your highlight",
  captionLabel: "Suggested caption",
  copyCaption: "Copy caption",
  captionCopied: "Caption copied",
  pressAndHold: "Press and hold the caption to copy it.",
  iosReelsNote: "Instagram opens with your reel ready to post. If iOS asks, tap Allow Paste.",
  iosReelsCaptionNote: "Your caption can't travel with the video. Come back here after to copy it.",
  openInstagram: "Open Instagram",
  share: "Share",
  returnedTitle: "Back from Instagram?",
  returnedBody: "Copy your caption, then switch back to Instagram and paste it.",
  openInstagramAgain: "Open Instagram again",
  done: "Done",
  useShareSheet: "Use the share sheet",
} as const;

/** "Preparing your reel… {pct}%": the number is rendered mono by the caller. */
export const PREPARING_PREFIX = "Preparing your reel… ";

/** `progress` is a 0..1 fraction (or null before the first byte): whole percent. */
export function progressPercent(progress: number | null): number {
  if (progress == null || !Number.isFinite(progress)) return 0;
  return Math.max(0, Math.min(100, Math.round(progress * 100)));
}

/**
 * Every share-funnel string (jr_be spec 014 section 16.6.3), in one place so
 * the viewer, the pre-share sheet and the hook cannot drift. The Reels
 * failure messages come from `REELS_FAILURE_MESSAGES` in the Reels module and
 * the oversize advisory from `REELS_OVERSIZE_WARNING`; neither is copied here
 * (the advisory is re-exported so the viewer can toast it without importing
 * the native module outside this directory).
 */
export { REELS_OVERSIZE_WARNING } from "@/modules/instagram-reels";

export const SHARE_COPY = {
  viewerTitle: "Your highlight",
  shareToInstagram: "Share to Instagram",
  shareReel: "Share reel",
  saveToPhotos: "Save to Photos",
  saving: "Saving…",
  improveReel: "Improve this reel",
  saveSuccess: "Saved to Photos",
  saveFailed: "We couldn't save your reel. Try again.",
  savePermissionDenied: "Allow ELO RATED to add to Photos in Settings to save your reel.",
  openSettings: "Open Settings",
  sheetTitle: "Share your highlight",
  /** "Preparing your reel… {pct}%": render the number in mono tabular-nums. */
  downloadProgressPrefix: "Preparing your reel…",
  downloadFailed: "We couldn't download your reel. Check your connection and try again.",
  tryAgain: "Try again",
  /** prepare_highlight_share: highlight_not_ready (no live version any more, e.g. the video was replaced). */
  notReady: "This reel can't be shared right now. A new version may be on the way.",
  /** prepare_highlight_share: highlight_not_found. */
  notFound: "That highlight no longer exists.",
  shareDisabled: "Sharing is turned off right now.",
  /** Not in the spec table: the share sheet itself failed to open. */
  shareSheetFailed: "We couldn't open the share sheet. Try again.",
  captionLabel: "Suggested caption",
  copyCaption: "Copy caption",
  captionCopied: "Caption copied",
  pressAndHoldToCopy: "Press and hold the caption to copy it.",
  iosReelsNote: [
    "Instagram opens with your reel ready to post. If iOS asks, tap Allow Paste.",
    "Your caption can't travel with the video. Come back here after to copy it.",
  ],
  openInstagram: "Open Instagram",
  share: "Share",
  returnedTitle: "Back from Instagram?",
  returnedBody: "Copy your caption, then switch back to Instagram and paste it.",
  openInstagramAgain: "Open Instagram again",
  done: "Done",
  useShareSheet: "Use the share sheet",
} as const;

/** "Preparing your reel… 42%" (for plain-text contexts such as accessibility labels). */
export function downloadProgressLabel(fraction: number): string {
  const pct = Math.max(0, Math.min(100, Math.round(fraction * 100)));
  return `${SHARE_COPY.downloadProgressPrefix} ${pct}%`;
}

/** The URL "Open Instagram again" opens (the app, not the Reels composer). */
export const INSTAGRAM_APP_URL = "instagram://";

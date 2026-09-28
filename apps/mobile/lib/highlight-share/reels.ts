import {
  REELS_MAX_DURATION_MS,
  REELS_MIN_DURATION_MS,
  shareToReels,
  type ReelsShareResult,
} from "@/modules/instagram-reels";

/**
 * Whether a reel of `durationS` may be offered to Instagram Reels (Meta's
 * required 3 to 60 s window). Unknown (null) is allowed: the native half
 * reads the real duration from the file and refuses with too-short /
 * too-long itself.
 */
export function isWithinReelsWindow(durationS: number | null | undefined): boolean {
  if (durationS === null || durationS === undefined || !Number.isFinite(durationS)) return true;
  const ms = durationS * 1000;
  return ms >= REELS_MIN_DURATION_MS && ms <= REELS_MAX_DURATION_MS;
}

/**
 * Hand the downloaded file to the Instagram Reels composer. Never throws
 * (the module's contract). An oversize clip is still a success: Meta only
 * RECOMMENDS the byte ceiling, so `oversize` is reported for the UI to show
 * `REELS_OVERSIZE_WARNING` as an info toast, never a refusal.
 */
export async function handOffToReels(fileUri: string, appId: string): Promise<ReelsShareResult> {
  return shareToReels({ videoUri: fileUri, appId });
}

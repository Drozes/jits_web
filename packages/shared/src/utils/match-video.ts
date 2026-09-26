/**
 * Pure helpers for presenting `match_videos` rows (match detail + player).
 * No Supabase access here; the shared queries and both apps build on these.
 */

/** What the UI may do with a video, derived from `match_videos.status`. */
export type VideoPlayability = "playable" | "processing" | "failed";

const PROCESSING_STATUSES = new Set(["uploading", "merging"]);

/**
 * Map `match_videos.status` to what the UI may do with it.
 *
 * `failed` means the analysis/slicing pipeline failed; the original MP4 is
 * usually still in storage, so the UI still offers Watch for it. An unknown
 * (future) status is treated as playable: attempting playback is cheap and
 * the player handles a storage miss.
 */
export function videoPlayability(status: string): VideoPlayability {
  if (status === "failed") return "failed";
  if (PROCESSING_STATUSES.has(status)) return "processing";
  return "playable";
}

/**
 * "Your recording" when the viewer uploaded it, else "<name>'s recording"
 * ("Opponent's recording" when the uploader name is unknown).
 */
export function videoAngleLabel(
  uploadedBy: string,
  viewerId: string,
  uploaderName: string | null,
): string {
  if (uploadedBy === viewerId) return "Your recording";
  const name = uploaderName?.trim();
  return name ? `${name}'s recording` : "Opponent's recording";
}

/** Viewer's own videos first, then others; input order kept within each group. */
export function sortMatchVideosForViewer<T extends { uploaded_by: string }>(
  videos: T[],
  viewerId: string,
): T[] {
  const mine = videos.filter((v) => v.uploaded_by === viewerId);
  const others = videos.filter((v) => v.uploaded_by !== viewerId);
  return [...mine, ...others];
}

/** m:ss for a duration in seconds, or null when missing or not positive. */
export function formatVideoDuration(
  seconds: number | null | undefined,
): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return null;
  const total = Math.round(seconds);
  if (total <= 0) return null;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

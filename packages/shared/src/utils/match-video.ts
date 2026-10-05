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

/**
 * Deck row order (COPY-DECK v2.2 section 1): the viewer's own videos first,
 * then the other competitor's, then the timekeeper's; input order (the
 * server's `is_primary DESC, created_at, id`) kept within each group.
 */
export function sortMatchVideosForViewer<T extends { uploaded_by: string; recording_type?: string | null }>(
  videos: T[],
  viewerId: string,
): T[] {
  const mine = videos.filter((v) => v.uploaded_by === viewerId);
  const others = videos.filter((v) => v.uploaded_by !== viewerId);
  const competitors = others.filter((v) => v.recording_type !== "timekeeper");
  const timekeeper = others.filter((v) => v.recording_type === "timekeeper");
  return [...mine, ...competitors, ...timekeeper];
}

/**
 * The angle to show first (jits-n2im.15): the server-elected primary when
 * there is one, else the first of the viewer-sorted list (the viewer's own,
 * then the server's order). Null for an empty list.
 */
export function defaultMatchAngle<T extends { is_primary?: boolean | null }>(videos: T[]): T | null {
  return videos.find((v) => v.is_primary === true) ?? videos[0] ?? null;
}

/**
 * Sentence-case angle label (COPY-DECK v2.2 section 1): "Your angle", or
 * "{Initial. Last}'s angle" with the short name the caller supplies. A
 * timekeeper's angle keeps the name label; `angleTag` adds "Timekeeper".
 */
export function angleLabel(isMine: boolean, shortUploaderName: string | null | undefined): string {
  if (isMine) return "Your angle";
  const name = shortUploaderName?.trim();
  return name ? `${name}'s angle` : "Opponent's angle";
}

/** The deck's tag beside a timekeeper's angle, else null. */
export function angleTag(recordingType: string | null | undefined): "Timekeeper" | null {
  return recordingType === "timekeeper" ? "Timekeeper" : null;
}

/**
 * Whole percent of a reserved upload from the heartbeat counters, or null
 * when either is missing or the total is not positive (deck `{pct}`).
 */
export function uploadPercent(
  confirmed: number | null | undefined,
  total: number | null | undefined,
): number | null {
  if (confirmed == null || total == null || !Number.isFinite(confirmed) || !Number.isFinite(total) || total <= 0) {
    return null;
  }
  return Math.round(Math.max(0, Math.min(1, confirmed / total)) * 100);
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

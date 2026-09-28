import type { MatchLibraryItem, MatchLibraryVideo } from "@jits/shared/api/film-room";
import type { MatchUploadEntry } from "@/lib/video/match-upload-store";

/**
 * What a Film Room poster says about its film, in priority order:
 *
 *   uploading  this phone is still sending the clip (real % from the upload
 *              store), or the only recording's row is still `uploading`
 *   failed     every recording failed processing
 *   analyzing  a recording is in the chunked pipeline and none has a
 *              breakdown yet ("ANALYZING 3/7" once the slicer has counted)
 *   new        playable film the athlete has not opened, from the last week
 *   ready      a breakdown exists ("BREAKDOWN READY")
 *   none       nothing to say (no film, or film without analysis, already seen)
 */
export type CardStatus =
  | { kind: "uploading"; progress: number | null }
  | { kind: "failed" }
  | { kind: "analyzing"; done: number | null; total: number | null }
  | { kind: "new" }
  | { kind: "ready" }
  | { kind: "none" };

/** A film stays NEW for a week after the match if it was never opened. */
export const NEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const PIPELINE = new Set(["processing", "slicing", "analyzing", "merging"]);

function inPipeline(v: MatchLibraryVideo): boolean {
  if (v.has_analysis) return false;
  if (PIPELINE.has(v.status)) return true;
  // Sliced but not every chunk analyzed yet.
  return (
    v.status === "ready" &&
    v.chunk_count != null &&
    v.chunk_count > 0 &&
    v.chunks_completed < v.chunk_count
  );
}

export function deriveCardStatus(
  item: MatchLibraryItem,
  upload: MatchUploadEntry | null,
  seen: boolean,
  now: number = Date.now(),
): CardStatus {
  if (upload && (upload.status === "uploading" || upload.status === "pending")) {
    return { kind: "uploading", progress: upload.progress };
  }
  const videos = item.videos;
  if (videos.length === 0) return { kind: "none" };
  if (videos.every((v) => v.status === "uploading")) {
    return { kind: "uploading", progress: null };
  }
  if (videos.every((v) => v.status === "failed")) return { kind: "failed" };

  const anyAnalysis = videos.some((v) => v.has_analysis);
  const running = videos.filter(inPipeline);
  if (!anyAnalysis && running.length > 0) {
    const counted = running.find((v) => v.chunk_count != null && v.chunk_count > 0);
    return counted
      ? { kind: "analyzing", done: counted.chunks_completed, total: counted.chunk_count }
      : { kind: "analyzing", done: null, total: null };
  }

  const completedAt = item.completed_at ? Date.parse(item.completed_at) : NaN;
  const fresh = Number.isFinite(completedAt) && now - completedAt < NEW_WINDOW_MS;
  const playable = videos.some((v) => v.playability !== "processing");
  if (!seen && fresh && playable) return { kind: "new" };
  if (anyAnalysis) return { kind: "ready" };
  return { kind: "none" };
}

/** Badge copy, or null when the card shows no badge (uploading has its own overlay). */
export function statusBadgeLabel(status: CardStatus): string | null {
  switch (status.kind) {
    case "failed":
      return "FAILED";
    case "analyzing":
      return status.total ? `ANALYZING ${status.done ?? 0}/${status.total}` : "ANALYZING";
    case "new":
      return "NEW";
    case "ready":
      return "BREAKDOWN READY";
    default:
      return null;
  }
}

/** "UPLOADING 64%", or "UPLOADING" when the percentage is unknown. */
export function uploadingLabel(progress: number | null): string {
  if (progress == null || !Number.isFinite(progress)) return "UPLOADING";
  return `UPLOADING ${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`;
}

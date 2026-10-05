import type { MatchLibraryItem, MatchLibraryVideo } from "@jits/shared/api/film-room";
import type { MatchUploadEntry } from "@/lib/video/match-upload-store";
import { uploadingLabel } from "@/lib/video/upload-copy";
import { isTerminalUploadClass } from "@/lib/video/upload-errors";
import type { MatchVideoPhase, MatchVideoPhaseReason, MatchVideoReelState } from "@jits/shared/api/match-video-status";
import { CARD_BADGE, PHASE_TAG } from "@/lib/video/video-status-copy";
import { formatCountdown } from "@/lib/video/video-status-copy";

export { uploadingLabel };

/**
 * What a Film Room poster says about its film, in priority order:
 *
 *   uploading  this phone is still sending the clip (real % from the upload
 *              store), or the only recording's row is still `uploading`
 *   paused     this phone's upload is parked and will retry on its own
 *   upload_failed  this phone's upload failed and waits for the athlete
 *              (Retry, or Discard when a retry cannot help)
 *   processing this phone's clip just landed and the library has not
 *              re-read it yet (never "no film" in that window)
 *   failed     every recording failed processing (server side)
 *   analyzing  a recording is in the chunked pipeline and none has a
 *              breakdown yet ("ANALYZING 3/7" once the slicer has counted)
 *   new        playable film the athlete has not opened, from the last week
 *   ready      a breakdown exists ("BREAKDOWN READY")
 *   none       nothing to say (no film, or film without analysis, already seen)
 */
export type CardStatus =
  | { kind: "uploading"; progress: number | null }
  | { kind: "paused"; progress: number | null }
  | { kind: "upload_failed"; terminal: boolean }
  | { kind: "processing" }
  | { kind: "failed" }
  | { kind: "analyzing"; done: number | null; total: number | null }
  | { kind: "new" }
  | { kind: "ready" }
  | { kind: "none" }
  // From the server's Film status phase (jits-n2im.25, deck section 9):
  /** The wait for another angle; `remainingMs` <= 0 once the deadline passed. */
  | { kind: "waiting"; remainingMs: number | null }
  | { kind: "building" }
  /** Film is coming in (phase collecting): "UPLOADING". */
  | { kind: "collecting" }
  | { kind: "no_film" };

/** The server phase a card digests (`useFilmRoomPhases`), when it read one. */
export interface CardPhase {
  phase: MatchVideoPhase;
  reason: MatchVideoPhaseReason | null;
  /** Device ms left on the wait (server clock), while waiting. */
  waitRemainingMs: number | null;
  /** The viewer's own reel state: once final it beats a match-level "building" (review M1). */
  ownReel?: MatchVideoReelState | null;
}

const FINAL_REEL: ReadonlySet<string> = new Set(["ready", "none", "failed", "none_dominant_fallback"]);

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
  phase: CardPhase | null = null,
): CardStatus {
  if (upload && (upload.status === "uploading" || upload.status === "pending")) {
    return { kind: "uploading", progress: upload.progress };
  }
  // This phone still owes the server its clip (jits-n2im.4 item 4). Said
  // even when the other athlete's angle is already up: it is still true,
  // and it is the only place the Film Room can offer the Retry.
  if (upload?.status === "paused") return { kind: "paused", progress: upload.progress };
  if (upload?.status === "error") {
    return { kind: "upload_failed", terminal: isTerminalUploadClass(upload.errorClass) };
  }
  const videos = item.videos;
  // With the server's phase in hand, the deck's priority (section 9):
  // Waiting {mm:ss} > Building > Uploading (collecting) > New > Breakdown
  // ready > No film. "Processing" is only ever an angle row (B1.1).
  if (phase) {
    // The viewer's own highlight is final while the match still builds the
    // other athlete's: the card follows the viewer's outcome, as the plate does.
    const ownFinal = phase.ownReel != null && FINAL_REEL.has(phase.ownReel);
    const effective = ownFinal && (phase.phase === "building" || phase.phase === "waiting_for_angle") ? "ready" : phase.phase;
    switch (effective) {
      case "waiting_for_angle":
        return { kind: "waiting", remainingMs: phase.waitRemainingMs };
      case "building":
        return { kind: "building" };
      case "collecting":
        if (phase.reason === "no_video_yet") return { kind: "none" };
        // v2.4 (review M2): once bytes have landed for an angle, the shipped
        // derivation speaks (PROCESSING FILM, ANALYZING n/m), never UPLOADING.
        if (videos.some((v) => v.status !== "uploading")) break;
        return { kind: "collecting" };
      case "no_film":
        return { kind: "no_film" };
      case "ready": {
        const completedAt = item.completed_at ? Date.parse(item.completed_at) : NaN;
        const fresh = Number.isFinite(completedAt) && now - completedAt < NEW_WINDOW_MS;
        if (!seen && fresh && videos.length > 0) return { kind: "new" };
        return videos.some((v) => v.has_analysis) ? { kind: "ready" } : { kind: "none" };
      }
      default:
        break;
    }
  }
  if (videos.length === 0) {
    // Landed a moment ago; the refetch (useRefetchOnUploadSettled) is on
    // its way. Until then this is film being processed, not no film.
    return upload?.status === "uploaded" ? { kind: "processing" } : { kind: "none" };
  }
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
  // Only an angle that plays makes the card NEW (a failed one may have no file).
  const playable = videos.some((v) => v.playability === "playable");
  if (!seen && fresh && playable) return { kind: "new" };
  if (anyAnalysis) return { kind: "ready" };
  return { kind: "none" };
}

/** Badge copy, or null when the card shows no badge (uploading has its own overlay). */
export function statusBadgeLabel(status: CardStatus): string | null {
  switch (status.kind) {
    case "failed":
      return "FAILED";
    case "paused":
      return "UPLOAD PAUSED";
    case "upload_failed":
      // The deck's one label for my own failed upload (m3).
      return "DIDN'T UPLOAD";
    case "processing":
      // Processing is only ever an angle row, never a card badge (deck B1.1);
      // the card's centre caption says PROCESSING FILM.
      return null;
    case "analyzing":
      return status.total ? `ANALYZING ${status.done ?? 0}/${status.total}` : "ANALYZING";
    case "new":
      return "NEW";
    case "ready":
      return "BREAKDOWN READY";
    case "waiting":
      return status.remainingMs != null && status.remainingMs > 0 ? CARD_BADGE.waiting(formatCountdown(status.remainingMs)) : PHASE_TAG.waiting.toUpperCase();
    case "building":
      return CARD_BADGE.building;
    case "collecting":
      return CARD_BADGE.uploading;
    case "no_film":
      return CARD_BADGE.noFilm;
    default:
      return null;
  }
}

/** The card offers its own Retry for this status. */
export function cardOffersRetry(status: CardStatus): boolean {
  return status.kind === "paused" || (status.kind === "upload_failed" && !status.terminal);
}

import type { MatchUploadEntry } from "./match-upload-store";

/**
 * The copy every film surface uses for this phone's upload, in one place so
 * the verdict, match detail and the Film Room can never disagree about the
 * same upload (jits-n2im.4). Status copy only; failure reasons are in
 * `upload-errors.ts`.
 */

/**
 * The card's tags (deck section 3, upload strip column; rendered in mono
 * caps). "Didn't upload" is the one label for the viewer's own failed
 * upload on every surface (deck m3).
 */
export const UPLOAD_TAG = {
  stopping: "Finishing recording",
  uploading: "Uploading match video",
  paused: "Upload paused",
  failed: "Didn't upload",
} as const;

/** "Keep the app open" while uploading (jits-n2im.1). */
export function keepOpenCopy(backgroundUploadSupported: boolean): string {
  return backgroundUploadSupported
    ? "Your film keeps uploading if you leave the app."
    : "Keep ELO RATED open until your film uploads.";
}

/** "412 MB" / "1.2 GB", or null when the size is unknown. */
export function formatUploadSize(bytes: number | null | undefined): string | null {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return null;
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${Math.max(1, Math.round(mb))} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

function pct(progress: number | null | undefined): string | null {
  if (progress == null || !Number.isFinite(progress)) return null;
  return `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`;
}

/** "UPLOADING 64%", or "UPLOADING" when the percentage is unknown. */
export function uploadingLabel(progress: number | null): string {
  const p = pct(progress);
  return p ? `UPLOADING ${p}` : "UPLOADING";
}

/**
 * The caption where the opening still will be, from this phone's upload
 * entry and what the server already has.
 *
 *   uploading  "UPLOADING 42% · STILL ARRIVES AFTER UPLOAD"
 *   paused     "UPLOAD PAUSED · 42%"
 *   failed     "DIDN'T UPLOAD"
 *   landed, or the server has a video without a still yet: "PROCESSING FILM"
 *              (never "after upload" once the bytes are in)
 *   nothing    the surface's own "no film" caption
 */
export function filmStillCaption(
  local: Pick<MatchUploadEntry, "status" | "progress"> | null,
  hasServerVideo: boolean,
  noFilm: string,
): string {
  switch (local?.status) {
    case "pending":
    case "uploading":
      return `${uploadingLabel(local.progress)} · STILL ARRIVES AFTER UPLOAD`;
    case "paused": {
      const p = pct(local.progress);
      return p ? `UPLOAD PAUSED · ${p}` : "UPLOAD PAUSED";
    }
    case "error":
      return hasServerVideo ? "PROCESSING FILM" : "DIDN'T UPLOAD";
    case "uploaded":
      return "PROCESSING FILM";
    default:
      return hasServerVideo ? "PROCESSING FILM" : noFilm;
  }
}

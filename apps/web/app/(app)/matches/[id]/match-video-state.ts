import type { MatchDetailVideo } from "@jits/shared/api/queries";
import type { DomainErrorCode } from "@jits/shared/api/errors";

/**
 * What one video card shows. Plain module (no "use client") so the server
 * component can pick the primary card with the same rule the card renders by.
 *
 *   idle        poster + Watch
 *   signing     poster + spinner (Watch pressed, URL being re-signed)
 *   playing     <video>
 *   processing  still uploading, no Watch
 *   absent      no row visible (deleted / no access), no Watch
 *   missing     row exists, storage object does not, no Watch
 *   error       playback or signing failed, Try again
 */
export type VideoCardPhase =
  | "idle"
  | "signing"
  | "playing"
  | "processing"
  | "absent"
  | "missing"
  | "error";

export function initialVideoPhase(
  video: Pick<MatchDetailVideo, "playability">,
  initialUrl: string | null,
  initialError: DomainErrorCode | null,
): VideoCardPhase {
  if (video.playability === "processing") return "processing";
  if (initialError === "VIDEO_FILE_MISSING") return "missing";
  // A read that worked and found nothing: removed, or RLS hides it.
  if (!initialUrl && !initialError) return "absent";
  // Any other initial error is retryable: Watch re-signs on the client.
  return "idle";
}

/** True when the card's first paint offers a Watch button. */
export function hasWatchAction(
  video: Pick<MatchDetailVideo, "playability">,
  initialUrl: string | null,
  initialError: DomainErrorCode | null,
): boolean {
  return initialVideoPhase(video, initialUrl, initialError) === "idle";
}

/** "Watch your recording" / "Watch Demo Red's recording". */
export function watchLabel(video: Pick<MatchDetailVideo, "is_mine" | "angle_label">): string {
  if (video.is_mine) return "Watch your recording";
  const label = video.angle_label.startsWith("Opponent's")
    ? video.angle_label.replace(/^Opponent's/, "opponent's")
    : video.angle_label;
  return `Watch ${label}`;
}

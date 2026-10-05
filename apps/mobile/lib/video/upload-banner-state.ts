import type { MatchUploadEntry } from "./match-upload-store";
import type { RecordingState, RecordingTruncation } from "./use-video-recorder";
import { isTerminalUploadClass, type UploadErrorClass } from "./upload-errors";

/**
 * What the persistent status chip should say, given the two things that
 * know anything: the recorder (transient, view-bound) and the match's
 * upload entry (durable, keyed on the match).
 *
 * Pure so the precedence between them is one table rather than a chain of
 * conditions spread through a component. The split matters: `recording`,
 * `stopping` and `error` only mean anything while a recorder instance is
 * alive, whereas the upload outcome has to survive that instance being
 * replaced. So the order is LIVE-recorder signals first (they can only be
 * happening now), then the store (it can be a previous attempt's outcome),
 * and each precedence step below says why it is safe in that position.
 */
export type UploadBannerKind =
  | "hidden"
  | "stopping"
  | "uploading"
  /** Parked; it retries on its own (jits-n2im.3). Retry runs it now. */
  | "paused"
  | "uploaded"
  /** Failed: the recorder, or an upload that waits for the athlete. */
  | "error";

export interface UploadBannerState {
  kind: UploadBannerKind;
  /** Set for "paused" and "error": friendly copy, never raw server text. */
  message: string | null;
  /** Set for "uploaded", "paused" and "error"; the clip is short. */
  truncation: RecordingTruncation | null;
  /**
   * Only meaningful for "uploading": 0..1 of the clip the server has
   * confirmed, or null when the upload has started but no byte offset is
   * known yet. Null renders the old indeterminate spinner, which is now
   * the exception rather than the only thing we can show.
   */
  progress: number | null;
  /**
   * The upload failure's class, for "paused" and "error" from the store;
   * null for a recorder failure (nothing to retry there).
   */
  errorClass?: UploadErrorClass | null;
  /** Clip size in bytes when known (shown on cellular). */
  bytesTotal?: number | null;
}

/** The upload actions a banner state offers (jits-n2im.3 / .5). */
export function uploadBannerActions(state: UploadBannerState): { retry: boolean; discard: boolean } {
  if (state.kind === "paused") return { retry: true, discard: false };
  if (state.kind !== "error" || state.errorClass == null) return { retry: false, discard: false };
  // A terminal failure cannot be fixed by retrying. A missing file has
  // already been dropped, so there is nothing to discard either.
  if (isTerminalUploadClass(state.errorClass)) {
    return { retry: false, discard: state.errorClass !== "file_missing" };
  }
  return { retry: true, discard: false };
}

/**
 * The deck's color class for a failed or paused card (COPY-DECK 0.8):
 * "act" (red) only when the viewer can fix it with Try again, "waiting"
 * (amber) while it retries on its own, "info" (grey) for anything nobody
 * can fix, including a recorder failure.
 */
export function uploadBannerTone(state: UploadBannerState): "act" | "waiting" | "info" | "neutral" {
  if (state.kind === "paused") return "waiting";
  if (state.kind !== "error") return "neutral";
  return uploadBannerActions(state).retry ? "act" : "info";
}

export function deriveUploadBannerState(
  recorderState: RecordingState,
  recorderError: string | null,
  upload: MatchUploadEntry | null,
): UploadBannerState {
  // 1. Transient, and only the live recorder can know it. A remounted
  //    recorder is idle, so a stale "stopping" cannot outlive its owner.
  //
  //    ASSUMPTION, currently true but undefended: putting this first means
  //    a recorder in "stopping" HIDES a store entry, including an error.
  //    That is safe only because the two cannot coexist. `stoppingRef` is
  //    cleared before handleUpload runs, so by the time any upload outcome
  //    exists the recorder has already left "stopping". If a future change
  //    lets an upload start while the recorder is still stopping (a second
  //    clip, say, or a retry issued mid-stop), this ordering would swallow
  //    that upload's failure behind a spinner. Reorder to check
  //    `upload?.status === "error"` first if that ever becomes possible.
  if (recorderState === "stopping") {
    return { kind: "stopping", message: null, truncation: null, progress: null };
  }

  // 2. A LIVE recorder failure outranks the store, for the mirror image of
  //    the reason the store outranks a live recorder below.
  //
  //    Only a recorder that exists can be in "error", and a remounted one
  //    is "idle", so this branch is never a leftover: it is always a
  //    failure happening NOW. A store entry, by design, is not. It can be
  //    an outcome from a PREVIOUS attempt on the same match (re-entering an
  //    `in_progress` match from Arena or a lobby), and a start that fails
  //    before it reaches the camera ("Camera permission required", "Camera
  //    not ready") never gets as far as `beginMatchUploadAttempt`, so that
  //    stale entry is still sitting there. Checking the store first
  //    rendered a green "Match video uploaded" chip over a camera the user
  //    had just denied. Reproduced with
  //    `deriveUploadBannerState("error", "Camera permission required",
  //    { status: "uploaded", videoId: "VID-OLD" })`.
  //
  //    THE ESCAPE HATCH THIS BRANCH DOCUMENTED IS NOW TAKEN. It used to be
  //    safe to put a recorder error ahead of an in-flight upload because
  //    the two could not coexist: `handleUpload` was the only writer of
  //    "uploading" and it owned the recorder state for that whole window.
  //    `video-upload-manager.ts` breaks that (jits-341p): a persisted job
  //    resumes on foreground or reconnect with no recorder involved, so a
  //    user who re-enters the same match and denies the camera would have
  //    seen "Camera permission required" sitting over an upload that was
  //    genuinely running. An upload in flight is therefore checked FIRST
  //    below, exactly as the previous author prescribed.
  if (upload?.status === "uploading") {
    return {
      kind: "uploading",
      message: null,
      truncation: null,
      progress: upload.progress,
      bytesTotal: upload.bytesTotal ?? null,
    };
  }

  if (recorderState === "error") {
    return {
      kind: "error",
      // The recorder's own message when it has one; a store message is
      // still better than the generic fallback.
      message: recorderError ?? upload?.error ?? "Recording unavailable",
      truncation: upload?.truncation ?? null,
      progress: null,
    };
  }

  // 3. The upload's own outcome outranks IDLE recorder state, because it is
  //    the thing that survives. After a remount the recorder reads "idle"
  //    while the upload is genuinely still in flight, or has genuinely
  //    failed; trusting the recorder there is exactly how the failure went
  //    silent.
  // "uploading" is handled above, ahead of the recorder-error branch.
  if (upload) {
    if (upload.status === "uploaded") {
      return { kind: "uploaded", message: null, truncation: upload.truncation, progress: 1 };
    }
    if (upload.status === "paused") {
      return {
        kind: "paused",
        message: upload.error ?? "Upload paused. It will retry automatically.",
        truncation: upload.truncation,
        progress: upload.progress,
        errorClass: upload.errorClass ?? null,
        bytesTotal: upload.bytesTotal ?? null,
      };
    }
    if (upload.status === "error") {
      return {
        kind: "error",
        message: upload.error ?? "Upload failed",
        truncation: upload.truncation,
        progress: null,
        errorClass: upload.errorClass ?? "unknown",
        bytesTotal: upload.bytesTotal ?? null,
      };
    }
    // "pending": something is known about the recording (a truncation, or
    // an attempt that has just begun) but no upload has started and the
    // recorder is neither stopping nor failed. Nothing worth saying yet.
  }

  return { kind: "hidden", message: null, truncation: null, progress: null };
}

import type { MatchUploadEntry } from "./match-upload-store";
import type { RecordingState, RecordingTruncation } from "./use-video-recorder";

/**
 * What the persistent status chip should say, given the two things that
 * know anything: the recorder (transient, view-bound) and the match's
 * upload entry (durable, keyed on the match).
 *
 * Pure so the precedence between them is one table rather than a chain of
 * conditions spread through a component. The split matters: `recording`
 * and `stopping` only mean anything while a recorder instance is alive,
 * whereas the upload outcome has to survive that instance being replaced.
 */
export type UploadBannerKind =
  | "hidden"
  | "stopping"
  | "uploading"
  | "uploaded"
  | "error";

export interface UploadBannerState {
  kind: UploadBannerKind;
  /** Only set for "error". */
  message: string | null;
  /** Only set for "uploaded"; turns a success into a warning. */
  truncation: RecordingTruncation | null;
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
    return { kind: "stopping", message: null, truncation: null };
  }

  // 2. The upload's own outcome outranks recorder state, because it is the
  //    thing that survives. After a remount the recorder reads "idle" while
  //    the upload is genuinely still in flight, or has genuinely failed;
  //    trusting the recorder there is exactly how the failure went silent.
  if (upload) {
    if (upload.status === "uploading") {
      return { kind: "uploading", message: null, truncation: null };
    }
    if (upload.status === "uploaded") {
      return { kind: "uploaded", message: null, truncation: upload.truncation };
    }
    if (upload.status === "error") {
      return {
        kind: "error",
        message: upload.error ?? "Upload failed",
        truncation: upload.truncation,
      };
    }
    // "pending": something is known about the recording but no upload has
    // started. Nothing worth saying yet; fall through to the recorder.
  }

  // 3. Failures that never reached an upload at all: no camera, no
  //    permission, a stop the hardware never honoured.
  if (recorderState === "error") {
    return {
      kind: "error",
      message: recorderError ?? "Recording unavailable",
      truncation: upload?.truncation ?? null,
    };
  }

  return { kind: "hidden", message: null, truncation: null };
}

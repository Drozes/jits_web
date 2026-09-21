"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  buildMatchVideoStoragePath,
  upsertMatchVideo,
} from "@jits/shared/api/mutations";
import { backoffDelayMs, classifyUploadError } from "@jits/shared/utils";
import { extensionFor, pickMimeType } from "@/lib/video/recorder-codec";
import { uploadBlobResumable } from "@/lib/video/resumable-upload";

// BE contract: jr_be/specs/013-chunked-video-pipeline/INTEGRATION.md
// §1.2 path convention + §8.5 size limits.
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024; // 2 GiB client-side cap
// Warn the user once live usage crosses this fraction of the cap so the
// auto-stop at 100% isn't a surprise (parity with mobile's pre-flight check).
const NEARING_LIMIT_BYTES = MAX_UPLOAD_BYTES * 0.9;
const VIDEO_BUCKET = "match-videos";

/** Automatic attempts at the byte upload before the user is asked. */
export const WEB_UPLOAD_MAX_ATTEMPTS = 4;
const UPLOAD_BACKOFF = { baseMs: 2_000, maxMs: 30_000 };
/** Automatic attempts at the `match_videos` row within one run. */
export const WEB_ROW_MAX_ATTEMPTS = 4;
const ROW_BACKOFF = { baseMs: 750, maxMs: 10_000 };

/**
 * How far the upload got. The two halves have completely different costs:
 * re-uploading bytes is minutes and hundreds of megabytes, re-writing the
 * row is one INSERT. A retry must never redo the half that already worked.
 */
type UploadPhase = "bytes" | "row";

interface PendingUpload {
  blob: Blob;
  mimeType: string;
  /** Built ONCE per recording. Every attempt re-PUTs this same key. */
  path: string;
  phase: UploadPhase;
  /** tus upload URL, so a retry resumes instead of restarting. */
  uploadUrl: string | null;
}

interface UseVideoRecorderReturn {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isRecording: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  uploadStatus: "idle" | "uploading" | "done" | "error";
  error: string | null;
  /**
   * Populated after a successful upload+INSERT. Downstream consumers
   * (analysis viewer, progress hook) key on this id.
   */
  videoId: string | null;
  /**
   * Fraction of the recording the server has confirmed, 0..1, or null
   * before the first offset is known. Real byte progress from the tus
   * PATCH responses.
   */
  uploadProgress: number | null;
  /**
   * True once live recorded size crosses 90% of `MAX_UPLOAD_BYTES`.
   * Lets consumers warn before the recorder auto-stops at the 2 GB cap.
   */
  nearingLimit: boolean;
  /**
   * True while a failed upload can still be re-driven, i.e. the recording
   * is still in this page's memory. The wizard uses it to decide whether
   * "Retry upload" is worth offering.
   */
  canRetryUpload: boolean;
  /** Re-drive a failed upload from whichever half still needs doing. */
  retryUpload: () => void;
  /**
   * Give up on this recording deliberately. Compensates an orphaned
   * storage object (bytes up, no row) and clears the pending state, so the
   * wizard can move on without leaving a file nobody can reach.
   */
  discardUpload: () => Promise<void>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Web video recorder. Records via MediaRecorder, preferring MP4/H.264 and
 * falling back to WebM, then uploads the blob to the `match-videos` Storage
 * bucket under the canonical
 * `<match_id>/<uploader_athlete_id>/<unix_ts>.<ext>` path, then INSERTs
 * the parent `match_videos` row at `status='ready'` so the slicer
 * trigger fires.
 *
 * The upload is RESUMABLE (tus) and RETRIED with jittered exponential
 * backoff. It used to be a single `storage.upload()` with no retry at all:
 * one dropped connection at 80% of a 600 MB clip lost the recording, and
 * the wizard advanced past the failure anyway.
 *
 * `uploaderAthleteId` MUST be the caller's `athletes.id` (NOT the
 * Supabase auth user id). The RLS `match_videos_insert_participant`
 * policy requires `uploaded_by = auth_athlete_id()`.
 */
export function useVideoRecorder(
  matchId: string,
  uploaderAthleteId: string | null,
): UseVideoRecorderReturn {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordedBytesRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [nearingLimit, setNearingLimit] = useState(false);
  const [canRetryUpload, setCanRetryUpload] = useState(false);
  const mountedRef = useRef(true);
  /**
   * The recording and how far it got. Held in a ref, not state, because the
   * upload deliberately runs to completion past unmount and a manual retry
   * has to find the same blob and the same object key.
   */
  const pendingRef = useRef<PendingUpload | null>(null);
  /** Guards against two upload runs for the same recording overlapping. */
  const runningRef = useRef(false);

  const supabase = useMemo(() => createClient(), []);

  /**
   * Best-effort removal of an object that has no `match_videos` row. Under
   * storage RLS a denied DELETE resolves 200 with `{ data: [] }` and NO
   * error, so success requires exactly one removed object. Reported, never
   * thrown, so it cannot mask the real failure.
   */
  const removeOrphan = useCallback(
    async (path: string) => {
      try {
        const { data: removed, error: removeError } = await supabase.storage
          .from(VIDEO_BUCKET)
          .remove([path]);
        if (removeError || removed?.length !== 1) {
          console.warn(
            `[video] orphan cleanup failed for ${path}:`,
            removeError?.message ??
              `removed ${removed?.length ?? 0} objects (silent RLS denial?)`,
          );
        }
      } catch (removeErr) {
        console.warn(`[video] orphan cleanup failed for ${path}:`, removeErr);
      }
    },
    [supabase],
  );

  /**
   * Run the pending upload to completion, or leave it retryable.
   *
   * The storage object is NEVER deleted because the DB write failed. The
   * bytes are the expensive, irreplaceable half; the row is one INSERT, so
   * it is retried on its own budget and then handed to the user as a
   * retryable failure. Compensation happens only in `discardUpload`, when
   * the recording is abandoned on purpose.
   */
  const runUpload = useCallback(async () => {
    const pending = pendingRef.current;
    if (!pending || runningRef.current) return;
    if (!uploaderAthleteId) {
      if (mountedRef.current) {
        setUploadStatus("error");
        setError("Cannot upload: current athlete not loaded yet.");
        setCanRetryUpload(true);
      }
      return;
    }
    runningRef.current = true;

    const fail = (msg: string) => {
      if (!mountedRef.current) return;
      setUploadStatus("error");
      setError(msg);
      setCanRetryUpload(true);
    };

    try {
      if (mountedRef.current) {
        setUploadStatus("uploading");
        setError(null);
        setCanRetryUpload(false);
        if (pending.phase === "bytes") setUploadProgress(0);
      }

      if (pending.phase === "bytes") {
        let uploaded = false;
        let lastError = "Upload failed";
        for (let attempt = 1; attempt <= WEB_UPLOAD_MAX_ATTEMPTS; attempt++) {
          try {
            await uploadBlobResumable({
              supabase,
              bucket: VIDEO_BUCKET,
              path: pending.path,
              blob: pending.blob,
              contentType: pending.mimeType,
              uploadUrl: pending.uploadUrl,
              onUploadUrl: (url) => {
                pending.uploadUrl = url;
              },
              onProgress: (sent, total) => {
                if (mountedRef.current && total > 0) {
                  setUploadProgress(Math.max(0, Math.min(1, sent / total)));
                }
              },
            });
            uploaded = true;
            break;
          } catch (err) {
            const klass = classifyUploadError(err);
            lastError = messageOf(err);
            console.warn(
              `[video] upload attempt ${attempt}/${WEB_UPLOAD_MAX_ATTEMPTS} failed` +
                `${klass.status ? ` (HTTP ${klass.status})` : ""}: ${lastError}`,
            );
            // A dropped or conflicting upload URL cannot be resumed; the
            // next attempt creates a new one against the same object key.
            if (klass.resetUploadUrl) pending.uploadUrl = null;
            if (!klass.retryable || attempt >= WEB_UPLOAD_MAX_ATTEMPTS) break;
            await sleep(backoffDelayMs(attempt, UPLOAD_BACKOFF));
          }
        }
        if (!uploaded) {
          fail(`Upload failed: ${lastError}`);
          return;
        }
        // Never re-upload a complete object on a later retry.
        pending.phase = "row";
        if (mountedRef.current) setUploadProgress(1);
      }

      let lastRowError = "Saving the video record failed";
      for (let attempt = 1; attempt <= WEB_ROW_MAX_ATTEMPTS; attempt++) {
        const upserted = await upsertMatchVideo(supabase, {
          matchId,
          uploaderAthleteId,
          storagePath: pending.path,
          fileSizeBytes: pending.blob.size,
          recordingType: "self",
          recordedBy: uploaderAthleteId,
        });
        if (upserted.ok) {
          pendingRef.current = null;
          if (mountedRef.current) {
            setVideoId(upserted.data.id);
            setUploadStatus("done");
            setError(null);
            setCanRetryUpload(false);
          }
          return;
        }
        lastRowError = upserted.error.message;
        console.warn(
          `[video] match_videos write ${attempt}/${WEB_ROW_MAX_ATTEMPTS} failed: ${lastRowError}`,
        );
        if (attempt < WEB_ROW_MAX_ATTEMPTS) {
          await sleep(backoffDelayMs(attempt, ROW_BACKOFF));
        }
      }
      // Bytes are safely in the bucket; only the row is missing, and the
      // object stays there so a retry costs one INSERT rather than a
      // second 600 MB transfer.
      fail(`Upload stored but saving the video record failed: ${lastRowError}`);
    } catch (err) {
      console.error("[video] upload threw:", err);
      fail(`Upload failed: ${messageOf(err)}`);
    } finally {
      runningRef.current = false;
    }
  }, [matchId, supabase, uploaderAthleteId]);

  const beginUpload = useCallback(
    (blob: Blob, mimeType: string) => {
      if (!uploaderAthleteId) {
        setUploadStatus("error");
        setError("Cannot upload: current athlete not loaded yet.");
        return;
      }
      if (blob.size > MAX_UPLOAD_BYTES) {
        setUploadStatus("error");
        setError("Videos must be under 2 GB.");
        return;
      }
      pendingRef.current = {
        blob,
        mimeType,
        // Built ONCE per recording: every retry re-PUTs the same key, which
        // is what lets a resumed upload keep the bytes the server holds and
        // what the storage UPDATE policy is there for.
        path: buildMatchVideoStoragePath(matchId, uploaderAthleteId, extensionFor(mimeType)),
        phase: "bytes",
        uploadUrl: null,
      };
      void runUpload();
    },
    [matchId, runUpload, uploaderAthleteId],
  );

  const retryUpload = useCallback(() => {
    if (!pendingRef.current) return;
    void runUpload();
  }, [runUpload]);

  const discardUpload = useCallback(async () => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (mountedRef.current) {
      setCanRetryUpload(false);
      setUploadStatus("idle");
      setUploadProgress(null);
    }
    // Only a "row"-phase job has bytes in the bucket with no row pointing
    // at them. Abandoning it deliberately is the one moment deleting them
    // is right.
    if (pending?.phase === "row") await removeOrphan(pending.path);
  }, [removeOrphan]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      // `recorder.mimeType` is authoritative: the browser may hand back a
      // different type than the one requested.
      const mimeType = recorder.mimeType || "video/mp4";
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        // Release the camera only AFTER the final dataavailable has flushed.
        // Stopping tracks synchronously alongside recorder.stop() can truncate
        // the last chunk.
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (blob.size > 0) beginUpload(blob, mimeType);
      };
      recorder.stop();
    } else {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
    setIsRecording(false);
  }, [beginUpload]);

  const startRecording = useCallback(async () => {
    // Camera access and codec support are DIFFERENT failures and must not
    // share an error message (jits-rvc: a codec throw used to be reported as
    // "Camera access denied", which sends you chasing permissions forever).
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: 854, height: 480 },
        audio: false,
      });
    } catch {
      setError("Camera access denied. You can still manage the match without video.");
      return;
    }

    try {
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;

      const mimeType = pickMimeType();
      if (!mimeType) {
        // Never hand an unsupported type to the constructor.
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setError("This browser can't record video. The match still works without it.");
        return;
      }
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recordedBytesRef.current = 0;
      setNearingLimit(false);
      recorder.ondataavailable = (e) => {
        if (e.data.size === 0) return;
        chunksRef.current.push(e.data);
        recordedBytesRef.current += e.data.size;
        // Live size guard (parity with mobile's pre-flight check): warn at
        // 90%, then auto-stop at the 2 GB cap so the user isn't surprised
        // by a rejected upload after a long recording. `beginUpload` keeps
        // its own post-record check as a backstop.
        if (recordedBytesRef.current >= NEARING_LIMIT_BYTES) setNearingLimit(true);
        if (recordedBytesRef.current >= MAX_UPLOAD_BYTES) {
          setError("Recording stopped: 2 GB limit reached.");
          stopRecording();
        }
      };
      recorder.start(1000);
      recorderRef.current = recorder;
      setIsRecording(true);
      setError(null);
    } catch (err) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      console.error("[video] recorder start failed:", err);
      setError("Couldn't start the recorder on this browser. The match still works without it.");
    }
  }, [stopRecording]);

  // Unmount: release the camera. Deliberately does NOT cancel an
  // upload; the storage + DB write finishes in the background so the
  // recording is never stranded as an orphan object without a DB row.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return {
    videoRef,
    isRecording,
    startRecording,
    stopRecording,
    uploadStatus,
    error,
    videoId,
    uploadProgress,
    nearingLimit,
    canRetryUpload,
    retryUpload,
    discardUpload,
  };
}

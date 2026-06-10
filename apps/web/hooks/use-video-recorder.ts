"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { StorageApiError } from "@supabase/supabase-js";
import {
  buildMatchVideoStoragePath,
  upsertMatchVideo,
} from "@jits/shared/api/mutations";

// BE contract: jr_be/specs/013-chunked-video-pipeline/INTEGRATION.md
// §1.2 path convention + §8.5 size limits.
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024; // 2 GiB client-side cap
// Warn the user once live usage crosses this fraction of the cap so the
// auto-stop at 100% isn't a surprise (parity with mobile's pre-flight check).
const NEARING_LIMIT_BYTES = MAX_UPLOAD_BYTES * 0.9;

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
   * True once live recorded size crosses 90% of `MAX_UPLOAD_BYTES`.
   * Lets consumers warn before the recorder auto-stops at the 2 GB cap.
   */
  nearingLimit: boolean;
}

/**
 * Web video recorder. Records via MediaRecorder, uploads the WebM blob
 * to the `match-videos` Storage bucket under the canonical
 * `<match_id>/<uploader_athlete_id>/<unix_ts>.webm` path, then INSERTs
 * the parent `match_videos` row at `status='ready'` so the slicer
 * trigger fires.
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
  const [nearingLimit, setNearingLimit] = useState(false);
  const mountedRef = useRef(true);

  const upload = useCallback(async (blob: Blob) => {
    // The storage upload + match_videos write below run to completion even
    // if the step unmounted mid-upload; only React state updates are
    // skipped after unmount.
    const fail = (msg: string) => {
      if (!mountedRef.current) return;
      setUploadStatus("error");
      setError(msg);
    };
    if (!uploaderAthleteId) {
      fail("Cannot upload: current athlete not loaded yet.");
      return;
    }
    if (blob.size > MAX_UPLOAD_BYTES) {
      fail("Videos must be under 2 GB.");
      return;
    }
    if (mountedRef.current) setUploadStatus("uploading");
    try {
      const supabase = createClient();
      const path = buildMatchVideoStoragePath(matchId, uploaderAthleteId, "webm");
      const { error: uploadError } = await supabase.storage
        .from("match-videos")
        .upload(path, blob, { contentType: blob.type || "video/webm" });
      if (uploadError) {
        // Local Supabase caps `match-videos` at 500 MiB and returns 413.
        // Surface the local-dev caveat per BE §8.5. Prefer the SDK's
        // typed `statusCode` (string) when available; fall back to a
        // message regex for non-`StorageApiError` errors.
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
        const isLocal = /127\.0\.0\.1|localhost/.test(supabaseUrl);
        const msg = uploadError.message ?? "";
        const isPayloadTooLarge =
          (uploadError instanceof StorageApiError && uploadError.statusCode === "413") ||
          /payload too large/i.test(msg);
        if (isLocal && isPayloadTooLarge) {
          fail("Local development cap is 500 MiB — production cap is 2 GiB. Use a shorter clip while testing.");
        } else {
          fail(msg || "Upload failed");
        }
        return;
      }
      // Storage upload succeeded; INSERT/UPDATE the parent row.
      const upserted = await upsertMatchVideo(supabase, {
        matchId,
        uploaderAthleteId,
        storagePath: path,
        fileSizeBytes: blob.size,
        recordingType: "self",
        recordedBy: uploaderAthleteId,
      });
      if (!upserted.ok) {
        // Storage object landed but the DB row didn't: remove the object
        // so it is never orphaned in the bucket with no `match_videos`
        // row. Best-effort with observability: under storage RLS a denied
        // DELETE resolves 200 with `{ data: [] }` and NO error, so success
        // requires exactly one removed object. A failed cleanup is logged
        // but never masks the real DB error.
        try {
          const { data: removed, error: removeError } = await supabase.storage
            .from("match-videos")
            .remove([path]);
          if (removeError || removed?.length !== 1) {
            console.warn(
              `[video] orphan cleanup failed for ${path}:`,
              removeError?.message ?? `removed ${removed?.length ?? 0} objects (silent RLS denial?)`,
            );
          }
        } catch (removeErr) {
          console.warn(`[video] orphan cleanup failed for ${path}:`, removeErr);
        }
        fail(`Upload stored but saving the video record failed: ${upserted.error.message}`);
        return;
      }
      if (mountedRef.current) {
        setVideoId(upserted.data.id);
        setUploadStatus("done");
      }
    } catch {
      fail("Upload failed");
    }
  }, [matchId, uploaderAthleteId]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        if (blob.size > 0) upload(blob);
      };
      recorder.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setIsRecording(false);
  }, [upload]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: 854, height: 480 },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;

      const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]
        .find((t) => MediaRecorder.isTypeSupported(t)) ?? "video/webm";
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
        // by a rejected upload after a long recording. `upload()` keeps its
        // own post-record check as a backstop.
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
    } catch {
      setError("Camera access denied. You can still manage the match without video.");
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

  return { videoRef, isRecording, startRecording, stopRecording, uploadStatus, error, videoId, nearingLimit };
}

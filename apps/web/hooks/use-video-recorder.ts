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
  const streamRef = useRef<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);

  const upload = useCallback(async (blob: Blob) => {
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
    setUploadStatus("uploading");
    try {
      const supabase = createClient();
      const path = buildMatchVideoStoragePath(matchId, uploaderAthleteId, "webm");
      const { error: uploadError } = await supabase.storage
        .from("match-videos")
        .upload(path, blob, { contentType: blob.type || "video/webm" });
      if (uploadError) {
        setUploadStatus("error");
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
          setError("Local development cap is 500 MiB — production cap is 2 GiB. Use a shorter clip while testing.");
        } else {
          setError(msg || "Upload failed");
        }
        return;
      }
      // Storage upload succeeded — INSERT the parent row.
      try {
        const { id } = await upsertMatchVideo(supabase, {
          matchId,
          uploaderAthleteId,
          storagePath: path,
          fileSizeBytes: blob.size,
          recordingType: "self",
          recordedBy: uploaderAthleteId,
        });
        setVideoId(id);
        setUploadStatus("done");
      } catch (insertErr: unknown) {
        const m = insertErr instanceof Error ? insertErr.message : String(insertErr);
        setError(`Upload stored but DB INSERT failed: ${m}`);
        setUploadStatus("error");
      }
    } catch {
      setUploadStatus("error");
      setError("Upload failed");
    }
  }, [matchId, uploaderAthleteId]);

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
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.start(1000);
      recorderRef.current = recorder;
      setIsRecording(true);
      setError(null);
    } catch {
      setError("Camera access denied. You can still manage the match without video.");
    }
  }, []);

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

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return { videoRef, isRecording, startRecording, stopRecording, uploadStatus, error, videoId };
}

import * as React from "react";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import { uploadRecording } from "./upload-recording";

/**
 * State machine for the recorder. Mirrors the web hook's `uploadStatus`
 * but adds explicit `recording` / `stopping` states because the native
 * pipeline is multi-step (start -> stop -> read file -> upload).
 *
 *   idle      : not recording, no upload pending
 *   recording : camera is actively writing to the temp file
 *   stopping  : we've called `stopRecording()` and are awaiting the
 *               `recordAsync()` promise to settle with the final URI
 *   uploading : URI in hand, posting to Supabase Storage
 *   uploaded  : success
 *   error     : either camera or upload failed (`error` field set)
 */
export type RecordingState =
  | "idle"
  | "recording"
  | "stopping"
  | "uploading"
  | "uploaded"
  | "error";

export interface UseVideoRecorderReturn {
  cameraRef: React.MutableRefObject<CameraView | null>;
  state: RecordingState;
  uploadProgress: number | null;
  error: string | null;
  permission: { granted: boolean; canAskAgain: boolean } | null;
  requestPermission: () => Promise<void>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  /** Populated after a successful upload + match_videos INSERT. */
  videoId: string | null;
}

/**
 * Native counterpart to web's `useVideoRecorder`. Wraps `expo-camera`'s
 * imperative `recordAsync` / `stopRecording` API and uploads the resulting
 * MP4 to Supabase Storage via `lib/video/upload-recording.ts` (which
 * streams via `FileSystem.uploadAsync` rather than base64-loading).
 *
 * Recording is best-effort: callers are expected to surface permission
 * issues or upload failures through `state` + `error` but should keep
 * the match flow running regardless. A failed upload retries once
 * automatically; the second failure is final.
 */
/**
 * @param matchId            UUID of the parent match.
 * @param uploaderAthleteId  Current athlete's `athletes.id`. MUST be
 *                            present before `start()` is called; pass
 *                            `useAuth().athlete?.id`. Recorder no-ops
 *                            with an error state when null.
 */
export function useVideoRecorder(
  matchId: string,
  uploaderAthleteId: string | null,
): UseVideoRecorderReturn {
  const cameraRef = React.useRef<CameraView | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [state, setState] = React.useState<RecordingState>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [uploadProgress] = React.useState<number | null>(null);
  const [videoId, setVideoId] = React.useState<string | null>(null);
  const stoppingRef = React.useRef(false);
  const recordPromiseRef = React.useRef<Promise<{ uri: string } | undefined> | null>(null);

  const requestPermission = React.useCallback(async () => {
    await requestCameraPermission();
    await requestMicPermission();
  }, [requestCameraPermission, requestMicPermission]);

  const handleUpload = React.useCallback(async (fileUri: string) => {
    if (!uploaderAthleteId) {
      setError("Cannot upload: current athlete not loaded yet.");
      setState("error");
      return;
    }
    setState("uploading");
    setError(null);
    try {
      const r = await uploadRecording({ fileUri, matchId, uploaderAthleteId });
      setVideoId(r.videoId);
      setState("uploaded");
    } catch (firstErr) {
      // Retry once before giving up.
      try {
        const r = await uploadRecording({ fileUri, matchId, uploaderAthleteId });
        setVideoId(r.videoId);
        setState("uploaded");
      } catch (secondErr) {
        const msg = secondErr instanceof Error ? secondErr.message : String(secondErr);
        setError(`Upload failed: ${msg}`);
        setState("error");
        // Re-surface for logging by callers (toast).
        // Web treats this as recoverable; we do too.
        if (firstErr instanceof Error) console.warn("[video] first upload failed:", firstErr.message);
      }
    }
  }, [matchId, uploaderAthleteId]);

  const start = React.useCallback(async () => {
    if (state === "recording" || state === "stopping") return;
    const cam = cameraRef.current;
    if (!cam) {
      setError("Camera not ready");
      setState("error");
      return;
    }
    if (!cameraPermission?.granted) {
      setError("Camera permission required");
      setState("error");
      return;
    }
    setError(null);
    setState("recording");
    try {
      // recordAsync resolves only when stopRecording is called (or maxDuration hits)
      const promise = cam.recordAsync({ maxDuration: 600 });
      recordPromiseRef.current = promise;
      const result = await promise;
      // Once awaited here, the recording has stopped. Hand off to upload.
      if (stoppingRef.current) {
        stoppingRef.current = false;
        if (result?.uri) {
          await handleUpload(result.uri);
        } else {
          setState("idle");
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Recording failed: ${msg}`);
      setState("error");
    } finally {
      recordPromiseRef.current = null;
    }
  }, [state, cameraPermission?.granted, handleUpload]);

  const stop = React.useCallback(async () => {
    if (state !== "recording") return;
    const cam = cameraRef.current;
    if (!cam) return;
    stoppingRef.current = true;
    setState("stopping");
    try {
      cam.stopRecording();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Stop failed: ${msg}`);
      setState("error");
      stoppingRef.current = false;
    }
  }, [state]);

  // Cleanup: if the hook unmounts mid-recording, stop the camera so the
  // OS releases the capture session. We don't await an upload here
  // because the component is going away.
  React.useEffect(() => {
    return () => {
      const cam = cameraRef.current;
      if (cam && stoppingRef.current === false) {
        try { cam.stopRecording(); } catch { /* noop */ }
      }
    };
  }, []);

  return {
    cameraRef,
    state,
    uploadProgress,
    error,
    permission: cameraPermission
      ? { granted: cameraPermission.granted, canAskAgain: cameraPermission.canAskAgain }
      : null,
    requestPermission,
    start,
    stop,
    videoId,
  };
}

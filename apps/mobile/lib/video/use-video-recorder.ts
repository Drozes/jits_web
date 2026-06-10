import * as React from "react";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import {
  MatchVideoDbError,
  buildVideoPath,
  removeUploadedObject,
  uploadRecording,
} from "./upload-recording";

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

// Pending-stop hardening (jits-a8y.13): on real hardware expo-camera can
// silently IGNORE a stopRecording() issued before native capture has
// actually begun (recordAsync returns its promise before the OS capture
// session is live), which would leave recordAsync pending forever and the
// hook stuck in "stopping". So a stop that was requested before recording
// started is deferred briefly and then re-issued on an interval until the
// recordAsync promise settles. The retry window (~2s) covers plausible
// camera spin-up times; maxDuration remains the last-resort backstop.
// CAVEAT: the exact native timing window is verified only against the JS
// contract in unit tests — it still needs verification on physical
// iOS/Android hardware (tracked in jits-a8y.13).
const PENDING_STOP_RETRY_MS = 250;
const PENDING_STOP_MAX_ATTEMPTS = 8;

// Start hardening (observed live on iOS 26 hardware): expo-camera's
// onCameraReady can fire BEFORE the native session can actually record, and
// sometimes never fires at all. So no single readiness signal is trusted:
// a not-ready recordAsync rejection is retried on an interval (~8s budget),
// and a deferred start falls through after a timeout if onCameraReady never
// arrives, letting the retry loop probe the camera directly.
const RECORD_START_RETRY_MS = 500;
const RECORD_START_MAX_ATTEMPTS = 16;
const CAMERA_READY_TIMEOUT_MS = 3000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function issuePendingStop(
  cam: CameraView,
  recordPromise: Promise<unknown>,
): Promise<void> {
  let settled = false;
  const settledPromise = recordPromise.then(
    () => { settled = true; },
    () => { settled = true; },
  );
  for (let attempt = 0; attempt < PENDING_STOP_MAX_ATTEMPTS; attempt++) {
    // Give native capture a beat to actually begin before (re-)stopping.
    // The wait short-circuits (and clears its timer) as soon as recordAsync
    // settles, so no timer outlives the recording.
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, PENDING_STOP_RETRY_MS);
      void settledPromise.then(() => {
        clearTimeout(timer);
        resolve();
      });
    });
    if (settled) return;
    try {
      cam.stopRecording();
    } catch {
      /* recordAsync settles in start() */
    }
  }
}

export interface UseVideoRecorderReturn {
  cameraRef: React.MutableRefObject<CameraView | null>;
  state: RecordingState;
  uploadProgress: number | null;
  error: string | null;
  permission: { granted: boolean; canAskAgain: boolean } | null;
  requestPermission: () => Promise<void>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  /**
   * Wire to CameraView's `onCameraReady`. On real hardware recordAsync
   * before this fires throws "Camera is not ready yet"; start() defers
   * until readiness and this callback resumes it.
   */
  markCameraReady: () => void;
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
  // Stop requested before the recorder reached 'recording' (End fired on a
  // very short match while start() was mid-flight). Honored by start().
  const pendingStopRef = React.useRef(false);
  // Native capture session readiness (CameraView onCameraReady). On real
  // hardware recordAsync before readiness throws "Camera is not ready yet"
  // — the bug that silently dropped every device recording. start() defers
  // until ready; markCameraReady resumes a deferred start.
  const cameraReadyRef = React.useRef(false);
  const startWhenReadyRef = React.useRef(false);
  // Self-reference so the deferred-start timeout can re-enter start()
  // without a circular useCallback dependency.
  const startRef = React.useRef<(() => Promise<void>) | null>(null);
  // The deferred-start backstop timer (CAMERA_READY_TIMEOUT_MS). Held so
  // markCameraReady and unmount can cancel it; an uncancelled timer leaks
  // past the test run (Jest force-exit) and can fire after teardown.
  const cameraReadyTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // Distinguishes devices in the shared Metro log stream.
  const logTag = `[${(uploaderAthleteId ?? "anon").slice(0, 8)}]`;
  // Read-at-call-time state so stop() works from stale closures (broadcast
  // handlers capture the callback once) and stays correct mid-render.
  const stateRef = React.useRef<RecordingState>("idle");
  const mountedRef = React.useRef(true);
  const recordPromiseRef = React.useRef<Promise<{ uri: string } | undefined> | null>(null);

  // The upload + match_videos write must run to completion even if the
  // screen unmounted mid-flight; only the React state updates are skipped.
  const transition = React.useCallback((s: RecordingState, err: string | null = null) => {
    stateRef.current = s;
    // Error transitions are otherwise invisible in logs (state-only); always
    // surface them so device-side recording failures are diagnosable.
    if (err) console.warn(`[video] ${logTag} recorder ${s}: ${err}`);
    if (!mountedRef.current) return;
    setState(s);
    setError(err);
  }, [logTag]);

  const requestPermission = React.useCallback(async () => {
    await requestCameraPermission();
    await requestMicPermission();
  }, [requestCameraPermission, requestMicPermission]);

  const handleUpload = React.useCallback(async (fileUri: string) => {
    if (!uploaderAthleteId) {
      transition("error", "Cannot upload: current athlete not loaded yet.");
      return;
    }
    transition("uploading");
    // Build the storage key ONCE so the retry below reuses the same path.
    // A fresh Date.now() per attempt would strand the first attempt's
    // half-written object at a stale path (double-orphan).
    const storagePath = buildVideoPath(matchId, uploaderAthleteId);
    try {
      // First attempt skips orphan compensation: a transient DB failure
      // must not delete the just-uploaded object only for the retry to
      // re-upload the whole file (up to 2 GB). The retry reuses the same
      // path, so the x-upsert write simply lands on top of it.
      const r = await uploadRecording({
        fileUri,
        matchId,
        uploaderAthleteId,
        storagePath,
        skipCompensation: true,
      });
      if (mountedRef.current) setVideoId(r.videoId);
      transition("uploaded");
    } catch (firstErr) {
      // Retry once before giving up; same storage path, so the upsert
      // header overwrites whatever the first attempt left behind. This
      // is the FINAL attempt, so compensation is back on: a DB failure
      // here removes the object (no orphan after the last attempt).
      try {
        const r = await uploadRecording({ fileUri, matchId, uploaderAthleteId, storagePath });
        if (mountedRef.current) setVideoId(r.videoId);
        transition("uploaded");
      } catch (secondErr) {
        // If attempt 1 left its object in the bucket (DB write failed
        // after a successful storage write, compensation skipped) and
        // attempt 2 failed BEFORE its own compensation could run (a
        // storage-level failure never reaches the DB step), the first
        // attempt's object is still there — clean it up now.
        if (
          firstErr instanceof MatchVideoDbError &&
          firstErr.storageObjectPersisted &&
          !(secondErr instanceof MatchVideoDbError)
        ) {
          await removeUploadedObject(storagePath);
        }
        const msg = secondErr instanceof Error ? secondErr.message : String(secondErr);
        transition("error", `Upload failed: ${msg}`);
        // Re-surface for logging by callers (toast).
        // Web treats this as recoverable; we do too.
        if (firstErr instanceof Error) console.warn("[video] first upload failed:", firstErr.message);
      }
    }
  }, [matchId, uploaderAthleteId, transition]);

  const start = React.useCallback(async () => {
    if (stateRef.current === "recording" || stateRef.current === "stopping") return;
    const cam = cameraRef.current;
    if (!cam) {
      transition("error", "Camera not ready");
      return;
    }
    if (!cameraPermission?.granted) {
      transition("error", "Camera permission required");
      return;
    }
    if (!cameraReadyRef.current) {
      // Native capture session still spinning up; markCameraReady resumes.
      // Backstop: onCameraReady sometimes never fires (observed on iOS 26
      // hardware), so fall through after a timeout and let the retry loop
      // below probe the camera directly.
      console.log(`[video] ${logTag} camera not ready; deferring start until onCameraReady`);
      startWhenReadyRef.current = true;
      if (cameraReadyTimeoutRef.current) clearTimeout(cameraReadyTimeoutRef.current);
      cameraReadyTimeoutRef.current = setTimeout(() => {
        cameraReadyTimeoutRef.current = null;
        if (!mountedRef.current) return;
        if (startWhenReadyRef.current && stateRef.current === "idle") {
          startWhenReadyRef.current = false;
          cameraReadyRef.current = true;
          console.warn(
            `[video] ${logTag} onCameraReady never fired within ${CAMERA_READY_TIMEOUT_MS}ms; attempting start anyway`,
          );
          void startRef.current?.();
        }
      }, CAMERA_READY_TIMEOUT_MS);
      return;
    }
    transition("recording");
    try {
      // recordAsync resolves only when stopRecording is called (or
      // maxDuration hits) and REJECTS quickly when the native session
      // cannot start. "Camera is not ready yet" rejections are retried on
      // an interval: onCameraReady firing is no guarantee the session can
      // record yet (observed live on iOS 26).
      for (let attempt = 1; ; attempt++) {
        console.log(
          `[video] ${logTag} recordAsync attempt ${attempt} (cam perm=${cameraPermission?.granted}, mic perm=${micPermission?.granted})`,
        );
        const promise = cam.recordAsync({ maxDuration: 600 });
        recordPromiseRef.current = promise;
        // A stop requested while start() was still spinning up must not be
        // dropped; honor it as soon as the native recorder is live so very
        // short matches still stop + upload their clip. The stop is issued
        // by issuePendingStop (deferred + re-issued, see comment at top of
        // file) because a stopRecording() fired before native capture
        // begins can be silently ignored on hardware.
        if (pendingStopRef.current) {
          pendingStopRef.current = false;
          stoppingRef.current = true;
          transition("stopping");
          void issuePendingStop(cam, promise);
        }
        try {
          const result = await promise;
          // Once awaited here, the recording has stopped. Hand off to upload.
          if (stoppingRef.current) {
            stoppingRef.current = false;
            if (result?.uri) {
              console.log(`[video] ${logTag} recording stopped, uri ready; uploading`);
              await handleUpload(result.uri);
            } else {
              console.warn(`[video] ${logTag} recordAsync resolved without a URI; clip skipped`);
              transition("idle");
            }
          } else if (result?.uri) {
            // The OS ended the recording without an explicit stop() (time
            // cap, interruption, or a stop whose bookkeeping was lost).
            // The clip is real: save it rather than discard it.
            console.warn(
              `[video] ${logTag} recordAsync settled without an explicit stop; uploading clip anyway`,
            );
            await handleUpload(result.uri);
          } else {
            console.warn(
              `[video] ${logTag} recordAsync settled while not stopping, no URI; nothing to upload`,
            );
          }
          return;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const notReady = /not ready/i.test(msg);
          if (
            notReady &&
            attempt < RECORD_START_MAX_ATTEMPTS &&
            !stoppingRef.current &&
            !pendingStopRef.current
          ) {
            await sleep(RECORD_START_RETRY_MS);
            // A stop (or unmount) that arrived DURING the sleep would
            // otherwise be dropped: stop() attaches its re-issue loop to the
            // already-rejected attempt's promise (settles instantly), so the
            // next attempt would record with no stop ever issued against it
            // and the leaked recording would upload a post-match garbage
            // clip. Re-check before retrying and exit cleanly instead.
            if (stoppingRef.current || pendingStopRef.current || !mountedRef.current) {
              stoppingRef.current = false;
              pendingStopRef.current = false;
              console.warn(
                `[video] ${logTag} stop requested before recording could start; no clip`,
              );
              transition("idle");
              return;
            }
            continue;
          }
          if (stoppingRef.current || pendingStopRef.current) {
            // Stop arrived while the camera never managed to start; there
            // is no clip, exit cleanly rather than surfacing an error.
            stoppingRef.current = false;
            pendingStopRef.current = false;
            console.warn(`[video] ${logTag} stop requested before recording could start; no clip`);
            transition("idle");
            return;
          }
          transition("error", `Recording failed: ${msg}`);
          return;
        }
      }
    } finally {
      recordPromiseRef.current = null;
    }
  }, [cameraPermission?.granted, micPermission?.granted, handleUpload, transition, logTag]);

  startRef.current = start;

  const markCameraReady = React.useCallback(() => {
    if (cameraReadyTimeoutRef.current) {
      clearTimeout(cameraReadyTimeoutRef.current);
      cameraReadyTimeoutRef.current = null;
    }
    cameraReadyRef.current = true;
    if (startWhenReadyRef.current) {
      startWhenReadyRef.current = false;
      void start();
    }
  }, [start]);

  const stop = React.useCallback(async () => {
    if (stateRef.current !== "recording") {
      // Not recording *yet*: if the recorder is still idle (start() queued
      // or mid-flight), register the intent so start() stops + uploads as
      // soon as recording begins. States past 'recording' need no stop.
      if (stateRef.current === "idle") pendingStopRef.current = true;
      return;
    }
    const cam = cameraRef.current;
    if (!cam) return;
    stoppingRef.current = true;
    transition("stopping");
    console.log(`[video] ${logTag} stop requested (state was recording)`);
    try {
      cam.stopRecording();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      transition("error", `Stop failed: ${msg}`);
      stoppingRef.current = false;
      return;
    }
    // Hardware can silently ignore a stopRecording (observed live: the
    // recordAsync promise never settled after a match ended). Re-issue the
    // stop on an interval until the promise settles, same backstop as the
    // pending-stop path.
    if (recordPromiseRef.current) {
      void issuePendingStop(cam, recordPromiseRef.current);
    }
  }, [transition, logTag]);

  // Cleanup: if the hook unmounts mid-recording, stop the camera so the
  // OS releases the capture session. An in-flight upload keeps running
  // (it must finish the storage + DB write); only state setters are
  // skipped after unmount via mountedRef.
  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (cameraReadyTimeoutRef.current) {
        clearTimeout(cameraReadyTimeoutRef.current);
        cameraReadyTimeoutRef.current = null;
      }
      const cam = cameraRef.current;
      if (cam && stoppingRef.current === false) {
        console.warn(`[video] ${logTag} unmount cleanup stopping an active recording`);
        try { cam.stopRecording(); } catch { /* noop */ }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    markCameraReady,
    videoId,
  };
}

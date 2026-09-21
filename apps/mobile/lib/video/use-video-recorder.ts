import * as React from "react";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import { buildVideoPath } from "./upload-recording";
import { startMatchVideoUpload } from "./video-upload-manager";
import {
  CAMERA_READY_TIMEOUT_MS,
  CAP_DETECTION_TOLERANCE_MS,
  PENDING_STOP_MAX_ATTEMPTS,
  PENDING_STOP_RETRY_MS,
  RECORD_START_MAX_ATTEMPTS,
  RECORD_START_RETRY_MS,
  STOP_WATCHDOG_MS,
  computeMaxRecordingSeconds,
} from "./recording-limits";
import {
  beginMatchUploadAttempt,
  setMatchUpload,
  useMatchUpload,
} from "./match-upload-store";

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
//
// Start hardening (observed live on iOS 26 hardware): expo-camera's
// onCameraReady can fire BEFORE the native session can actually record, and
// sometimes never fires at all. So no single readiness signal is trusted:
// a not-ready recordAsync rejection is retried on an interval (~8s budget),
// and a deferred start falls through after a timeout if onCameraReady never
// arrives, letting the retry loop probe the camera directly.
//
// Both retry budgets live in ./recording-limits because the recording cap
// is derived from them: the cap has to outlast the worst-case start and
// stop delays or it races the match clock (jits-2zpe).

/**
 * Why a recording ended before the match did. `null` is the normal case:
 * the clip covers the match. Anything else means the clip is short and the
 * user has to be told rather than shown a plain success.
 *
 *   limit       : the OS `maxDuration` backstop fired
 *   interrupted : recordAsync settled on its own for some other reason
 *                 (a call, backgrounding, a stop whose bookkeeping was lost)
 */
export type RecordingTruncation = "limit" | "interrupted";

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
  /**
   * Wire to the viewfinder's unmount. The recorder outlives the view now,
   * so readiness state and the deferred-start backstop have to be torn
   * down when the camera goes away, or they fire against a null ref.
   */
  releaseCamera: () => void;
  /** Populated after a successful upload + match_videos INSERT. */
  videoId: string | null;
  /**
   * Set when the recording ended before the match did. The clip is still
   * uploaded (a short clip beats no clip), but callers MUST surface this:
   * a truncated recording reported as a plain success is exactly the
   * silent data loss jits-2zpe was filed for.
   */
  truncation: RecordingTruncation | null;
  /** The OS cap actually in force, in seconds. Exposed for diagnostics. */
  maxDurationSeconds: number;
}

/**
 * Native counterpart to web's `useVideoRecorder`. Wraps `expo-camera`'s
 * imperative `recordAsync` / `stopRecording` API and uploads the resulting
 * MP4 to Supabase Storage via `lib/video/upload-recording.ts` (which
 * streams via `FileSystem.uploadAsync` rather than base64-loading).
 *
 * Recording is best-effort: callers are expected to surface permission
 * issues or upload failures through `state` + `error` but should keep
 * the match flow running regardless.
 *
 * The upload itself is NOT owned by this hook. It is handed to
 * `lib/video/video-upload-manager.ts`, which uploads resumably over tus,
 * persists the job to disk, retries with jittered exponential backoff and
 * resumes on foreground or reconnect. This hook only reports the terminal
 * outcome through `state`; everything in between reaches the UI through
 * the match-keyed store, because an upload now routinely outlives not just
 * this hook but the whole process.
 */
/**
 * @param matchId            UUID of the parent match.
 * @param uploaderAthleteId  Current athlete's `athletes.id`. MUST be
 *                            present before `start()` is called; pass
 *                            `useAuth().athlete?.id`. Recorder no-ops
 *                            with an error state when null.
 * @param matchDurationSeconds
 *                           The match's configured `duration_seconds`. The
 *                            OS recording cap is derived from it (see
 *                            ./recording-limits) so it can never sit exactly
 *                            on the match clock again. Omitted or unknown
 *                            falls back to the ceiling: over-recording is
 *                            recoverable, truncation is not.
 */
export function useVideoRecorder(
  matchId: string,
  uploaderAthleteId: string | null,
  matchDurationSeconds?: number | null,
): UseVideoRecorderReturn {
  const cameraRef = React.useRef<CameraView | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [state, setState] = React.useState<RecordingState>("idle");
  const [error, setError] = React.useState<string | null>(null);
  // The upload's OUTCOME is not component state. It is keyed on the match
  // (see ./match-upload-store) so it survives this hook being unmounted and
  // replaced, which the wizard does on every match, and so an upload that
  // finishes after this hook is gone still records its result somewhere the
  // UI can find it. `videoId` and `truncation` below are reads of that
  // store, not a second copy of it.
  const upload = useMatchUpload(matchId);
  const videoId = upload?.videoId ?? null;
  const truncation = upload?.truncation ?? null;
  // Real byte-level progress, written by the upload manager from the tus
  // PATCH responses. It is read from the store rather than held here so it
  // keeps flowing after this hook is replaced (the wizard remounts on every
  // match) and so a resumed upload from a previous app launch reports
  // against whatever surface happens to be mounted.
  const uploadProgress = upload?.progress ?? null;
  const truncationRef = React.useRef<RecordingTruncation | null>(null);
  // Wall-clock at which the live recordAsync attempt was issued. Lets an
  // unexpected settle be classified as "hit the OS cap" vs "interrupted"
  // instead of passing silently as a normal completion.
  const recordStartedAtRef = React.useRef<number | null>(null);
  // The OS cap for THIS match, derived from its configured duration rather
  // than hardcoded, so it cannot drift back into a tie with the match clock.
  const maxDurationSeconds = computeMaxRecordingSeconds(matchDurationSeconds);
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
  // Watchdog out of 'stopping' (see stop()). Held so the recordAsync await
  // and unmount can cancel it.
  const stopWatchdogRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
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
    // The stop watchdog guards ONE state. Leaving 'stopping' retires it
    // here rather than in start()'s finally, because the upload that
    // follows can now run for many minutes across backoff and resume, and
    // a timer that outlives the state it guards is a leak the test runner
    // notices before a user does.
    if (s !== "stopping" && stopWatchdogRef.current) {
      clearTimeout(stopWatchdogRef.current);
      stopWatchdogRef.current = null;
    }
    // Error transitions are otherwise invisible in logs (state-only); always
    // surface them so device-side recording failures are diagnosable.
    if (err) console.warn(`[video] ${logTag} recorder ${s}: ${err}`);
    if (!mountedRef.current) return;
    setState(s);
    setError(err);
  }, [logTag]);

  /**
   * Record that this clip does not cover the whole match. Kept in a ref as
   * well as state so `stop()` can read it from a stale closure and so it
   * survives the screen that started the recording unmounting mid-upload.
   */
  const markTruncated = React.useCallback((reason: RecordingTruncation) => {
    truncationRef.current = reason;
    console.warn(
      `[video] ${logTag} recording ended before the match did (${reason}); clip is short`,
    );
    // Written to the store, not to local state, and deliberately NOT gated
    // on mountedRef: this can land after the screen is gone and it still
    // has to reach whatever surface is showing next.
    setMatchUpload(matchId, { truncation: reason });
  }, [logTag, matchId]);

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
    // Build the storage key ONCE so every retry reuses the same path. A
    // fresh Date.now() per attempt would strand the previous attempt's
    // half-written object at a stale path (double-orphan), and with a
    // RESUMABLE upload it would also throw away every byte already
    // accepted by the server.
    const storagePath = buildVideoPath(matchId, uploaderAthleteId);
    // Every store write from here down is unguarded on purpose. This chain
    // runs to completion past unmount, and its result has to land whether
    // or not anything is still mounted to hear it.
    // videoId explicitly nulled, not merely left alone: an entry that
    // carried a PREVIOUS attempt's id into a failure rendered an error
    // banner and a working "Watch Match Video" button side by side. This
    // attempt has no id until its row lands. `truncation` is NOT cleared
    // here: markTruncated writes it just before this on the
    // settled-without-a-stop path, and it is true of the clip being
    // uploaded right now.
    setMatchUpload(matchId, {
      status: "uploading",
      storagePath,
      error: null,
      videoId: null,
      progress: 0,
    });
    // Retrying, backoff, resuming, persistence and orphan compensation all
    // live in the upload manager, not here. The hook's only remaining job
    // is to mirror the terminal outcome into its own state for the callers
    // that read `recorder.state`; every intermediate signal (progress, a
    // paused-and-will-resume upload, an upload finishing after this hook
    // is gone) reaches the UI through the match-keyed store instead.
    const outcome = await startMatchVideoUpload({
      matchId,
      uploaderAthleteId,
      fileUri,
      storagePath,
      truncation: truncationRef.current,
    });
    if (outcome.ok) transition("uploaded");
    else transition("error", outcome.error);
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
        // The viewfinder can go away while this backstop is pending: the
        // recorder now outlives the step, so a match that ends within the
        // timeout leaves the ref null. Re-entering start() would then hit
        // the "Camera not ready" branch and, because the status chip is
        // persistent, accuse the user of a camera failure for the rest of
        // the wizard over a match that was simply short.
        if (!cameraRef.current) {
          startWhenReadyRef.current = false;
          console.log(
            `[video] ${logTag} camera went away while start was deferred; nothing to record`,
          );
          return;
        }
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
    // A recording that is actually about to happen SUPERSEDES whatever the
    // last one left behind for this match. Nothing else ever clears these,
    // so without this a second recorder on the same matchId (re-entering an
    // `in_progress` match from Arena or a lobby, or a permission flip that
    // re-runs start()) inherited attempt 1's `truncation` and reported a
    // clip covering the whole match as "Recording was interrupted", and
    // inherited its `videoId` so a failed upload still offered playback.
    // See match-upload-store's docblock for which fields are per-attempt.
    //
    // Placed HERE, past every guard, on purpose: a start that never reaches
    // the camera (no ref, no permission, a deferral still pending) records
    // nothing, so the previous outcome is still the truth about this match.
    truncationRef.current = null;
    beginMatchUploadAttempt(matchId);
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
        // maxDuration is a LAST-RESORT backstop against a stopRecording the
        // hardware silently dropped, never the thing that ends a normal
        // match recording. It used to be a hardcoded 600, exactly the
        // backend's default duration_seconds, so it fired before the match
        // ended on every full-length match (jits-2zpe).
        recordStartedAtRef.current = Date.now();
        const promise = cam.recordAsync({ maxDuration: maxDurationSeconds });
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
          } else {
            // The OS ended the recording without an explicit stop() (time
            // cap, interruption, or a stop whose bookkeeping was lost).
            // Either way this is NOT a normal completion: the match is
            // still running, so whatever we have stops short of the end and
            // the user has to be told (jits-2zpe).
            const elapsedMs = recordStartedAtRef.current
              ? Date.now() - recordStartedAtRef.current
              : 0;
            const hitCap = elapsedMs >= maxDurationSeconds * 1000 - CAP_DETECTION_TOLERANCE_MS;
            markTruncated(hitCap ? "limit" : "interrupted");
            if (result?.uri) {
              // The clip is real: save it rather than discard it.
              console.warn(
                `[video] ${logTag} recordAsync settled without an explicit stop after ${Math.round(elapsedMs / 1000)}s (cap ${maxDurationSeconds}s); uploading the short clip anyway`,
              );
              await handleUpload(result.uri);
            } else {
              // No file at all. This branch used to return with no
              // transition(), stranding the machine in 'recording' with
              // nothing on screen: the one path where the cap could fire
              // and the user was told nothing.
              console.warn(
                `[video] ${logTag} recordAsync settled while not stopping after ${Math.round(elapsedMs / 1000)}s with no URI; the recording was lost`,
              );
              transition(
                "error",
                hitCap
                  ? "Recording hit its time limit and no clip was saved."
                  : "Recording stopped early and no clip was saved.",
              );
            }
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
      recordStartedAtRef.current = null;
      // The promise settled, so the stop watchdog has nothing left to guard.
      if (stopWatchdogRef.current) {
        clearTimeout(stopWatchdogRef.current);
        stopWatchdogRef.current = null;
      }
    }
  }, [
    cameraPermission?.granted,
    micPermission?.granted,
    handleUpload,
    transition,
    logTag,
    matchId,
    maxDurationSeconds,
    markTruncated,
  ]);

  // Mutating a ref during render is not safe: React can discard or
  // interrupt a render, which would leave `startRef` pointing at a closure
  // from an abandoned render (stale `cameraPermission`, stale
  // `maxDurationSeconds`). The only reader is the deferred-start backstop
  // timer, which fires long after commit, so a commit-time write is both
  // correct and sufficient.
  React.useEffect(() => {
    startRef.current = start;
  }, [start]);

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

  const releaseCamera = React.useCallback(() => {
    if (cameraReadyTimeoutRef.current) {
      clearTimeout(cameraReadyTimeoutRef.current);
      cameraReadyTimeoutRef.current = null;
    }
    // Readiness belongs to the capture session that just went away. Leaving
    // it true would let a later start() run recordAsync against a null ref.
    cameraReadyRef.current = false;
    startWhenReadyRef.current = false;
  }, []);

  const stop = React.useCallback(async () => {
    if (stateRef.current !== "recording") {
      // Not recording *yet*: if the recorder is still idle (start() queued
      // or mid-flight), register the intent so start() stops + uploads as
      // soon as recording begins.
      if (stateRef.current === "idle") {
        pendingStopRef.current = true;
        return;
      }
      // Past 'recording' there is nothing left to stop, but this must not
      // pass silently when the recording already ended on its own: the
      // match ran on past the end of the clip, which is precisely the
      // truncation the user is being shown (jits-2zpe). `truncation`
      // carries that to the UI; this log carries it to a device console.
      if (truncationRef.current) {
        console.warn(
          `[video] ${logTag} stop requested after the recording had already ended (${truncationRef.current}) in state ${stateRef.current}; the clip does not cover the end of the match`,
        );
      }
      return;
    }
    const cam = cameraRef.current;
    if (!cam) {
      // Symmetric with start()'s own `if (!cam)`, which DOES transition.
      // Returning silently here left the machine in 'recording' with no
      // pending stop and nothing on screen: the recording then ran to the
      // OS cap (up to two hours) behind a hidden banner.
      //
      // stoppingRef stays FALSE on purpose. We did not stop this recording
      // and cannot, so when recordAsync eventually settles it takes the
      // settled-without-a-stop path, is classified as a truncation, and
      // still uploads whatever clip exists.
      transition(
        "error",
        "The camera closed before the recording could be stopped. This clip may be cut short.",
      );
      return;
    }
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
    // ... and if even THAT is ignored, 'stopping' had no exit at all: the
    // re-issue loop gives up after its budget and the state machine sat in
    // 'stopping' forever. That used to be invisible because the live step
    // unmounted and took the camera with it. Now the viewfinder is held
    // open through 'stopping' (so the native session is not torn down
    // mid-finalize), which would mean a full-width live preview, a
    // permanent "Finishing recording..." spinner and a lit mic indicator
    // sitting over the result, confirm and summary steps.
    if (stopWatchdogRef.current) clearTimeout(stopWatchdogRef.current);
    stopWatchdogRef.current = setTimeout(() => {
      stopWatchdogRef.current = null;
      if (!mountedRef.current) return;
      if (stateRef.current !== "stopping") return;
      // stoppingRef stays TRUE on purpose: if the promise settles late the
      // clip still takes the normal stopped path and uploads, rather than
      // being mislabelled as an interruption.
      transition(
        "error",
        "The recording did not finish. The camera stopped responding, so this clip may not have been saved.",
      );
    }, STOP_WATCHDOG_MS);
  }, [transition, logTag]);

  // Cleanup: cancel the two timers this hook owns, and stop writing state.
  // An in-flight upload keeps running (it must finish the storage + DB
  // write); only state setters are skipped after unmount via mountedRef.
  //
  // It does NOT try to stop the camera, and deliberately so. There used to
  // be a `cameraRef.current && !stoppingRef.current` guard here that called
  // `stopRecording()` to "release the capture session". It was dead code
  // and it could not have been anything else:
  //
  //   1. React detaches refs during the MUTATION phase, so by the time a
  //      passive cleanup runs `cameraRef.current` is already null. The
  //      guard never once ran. Every CameraView test stub set the ref on
  //      mount and never nulled it on unmount, which is exactly why no
  //      test noticed; the stubs are honest now.
  //   2. Capturing the handle during render or commit would not help
  //      either. This hook OUTLIVES the viewfinder by design
  //      (`MatchRecorderCamera` mounts the camera only for ready / live /
  //      stopping), so the only way to reach this cleanup mid-recording is
  //      the whole wizard unmounting, which takes `CameraView` down with
  //      it. `stopRecording()` is an imperative handle on a native view
  //      that no longer exists by then.
  //
  // expo-camera's own native teardown ends the capture session when the
  // view is destroyed; that is what actually releases the camera. The
  // hook-side counterpart to the viewfinder going away is `releaseCamera`,
  // which tears down readiness and the deferred-start backstop. A warn that
  // never fires, over a call that cannot land, is worse than nothing: it
  // reads as a safety net and is not one.
  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (stopWatchdogRef.current) {
        clearTimeout(stopWatchdogRef.current);
        stopWatchdogRef.current = null;
      }
      if (cameraReadyTimeoutRef.current) {
        clearTimeout(cameraReadyTimeoutRef.current);
        cameraReadyTimeoutRef.current = null;
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
    markCameraReady,
    releaseCamera,
    videoId,
    truncation,
    maxDurationSeconds,
  };
}

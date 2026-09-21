import { AppState, type AppStateStatus } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { backoffDelayMs, classifyUploadError } from "@jits/shared/utils";
import { captureException } from "@/lib/error-tracking/sentry";
import {
  getRecordingSize,
  removeUploadedObject,
  uploadFileResumable,
  writeMatchVideoRow,
} from "./upload-recording";
import { releaseRecording, retainRecording } from "./recording-file";
import {
  type PendingUploadJob,
  isJobExpired,
  loadUploadJobs,
  patchUploadJob,
  removeUploadJob,
  saveUploadJob,
} from "./upload-persistence";
import { getMatchUpload, setMatchUpload } from "./match-upload-store";
import type { RecordingTruncation } from "./use-video-recorder";

/**
 * The single retry / resume authority for match-video uploads.
 *
 * WHY NOT `lib/network/mutation-queue.ts`. That queue exists for
 * `recordMatchResult` / `confirmMatchResult`: sub-second writes, held in
 * memory, keyed last-write-wins, replayed FIFO on reconnect, and dropped
 * wholesale by `clear()` on sign-out. Every one of those properties is
 * wrong for a video:
 *
 *   - a video upload runs for minutes, not milliseconds, so draining it
 *     FIFO would stall the match-result writes the queue exists for;
 *   - it has PARTIAL progress, which a queue of opaque
 *     `() => Promise<Result>` thunks cannot represent, let alone resume;
 *   - it has to survive process death, and that queue is explicitly
 *     in-memory ("Persistence is intentionally NOT implemented in B1");
 *   - `clear()` resolving entries as "queued" and discarding them would
 *     silently destroy a recording.
 *
 * So this is a parallel, video-specific runner. It does reuse the same
 * RECONNECT SIGNAL (a NetInfo subscription), because that part generalises
 * and two independent notions of "are we online" would be worse than one.
 *
 * WHAT IT GUARANTEES
 *   1. bytes upload resumably (tus, 6 MiB chunks) and are never re-sent
 *      from zero after a drop;
 *   2. every attempt is recorded on disk, so an app kill resumes rather
 *      than restarts;
 *   3. retries are exponential with jitter, never immediate;
 *   4. a successful storage write is NEVER undone by a failed DB write.
 *      The row is retried on its own schedule, and the object is deleted
 *      only when the job is abandoned outright.
 */

/** Attempts at the byte upload before the job is parked for a later resume. */
export const UPLOAD_MAX_ATTEMPTS = 6;
export const UPLOAD_BACKOFF = { baseMs: 2_000, maxMs: 120_000 } as const;
/** Attempts at the `match_videos` row within one run. */
export const ROW_MAX_ATTEMPTS = 5;
export const ROW_BACKOFF = { baseMs: 750, maxMs: 20_000 } as const;
/** Lower bound between persisted progress writes, to spare AsyncStorage. */
export const PROGRESS_PERSIST_INTERVAL_MS = 5_000;
/**
 * How long an attempt may go with NO server-confirmed activity before it is
 * aborted and retried.
 *
 * It exists because nothing else can end a stalled transfer: tus's browser
 * HTTP stack sets no `xhr.timeout`, React Native's `XMLHttpRequest` defaults
 * to 0, and tus's own retry loop is disabled here. So when iOS suspends the
 * app mid-PATCH and the socket goes half-open, `uploadFileResumable` never
 * settles: the runner is not in `backoffSleep` so a wake is a no-op, and
 * `resumeMatchVideoUploads` skips it because a runner is registered. The
 * job would read "uploading" forever and block every future resume for that
 * match until the process died.
 *
 * This is a STALL detector, not a throughput requirement. A false positive
 * costs one resumed attempt and zero bytes, because the server keeps the
 * offset and the next attempt picks up from it.
 */
export const UPLOAD_STALL_TIMEOUT_MS = 120_000;
/** How often the stall detector re-checks. */
export const STALL_CHECK_INTERVAL_MS = 15_000;

export type UploadOutcome =
  | { ok: true; videoId: string }
  | { ok: false; error: string; willRetryLater: boolean };

export interface StartUploadParams {
  matchId: string;
  uploaderAthleteId: string;
  /** Local `file://` URI straight from `recordAsync()`. */
  fileUri: string;
  /** Canonical key, built ONCE per recording by the caller (jits-voh). */
  storagePath: string;
  ext?: string;
  truncation?: RecordingTruncation | null;
}

type JobPatch = Partial<Omit<PendingUploadJob, "matchId">>;

interface RunnerHandle {
  /** Identifies this run; a newer recording on the same match bumps it. */
  generation: number;
  /**
   * The object key this runner owns, once it knows it. Lets a SUPERSEDED
   * runner tell its own orphan from the object the current runner is
   * actively writing, which is the difference between cleaning up and
   * destroying a good recording.
   */
  storagePath: string | null;
  /** Aborts the in-flight tus request, keeping the server-side partial. */
  abort: (() => void) | null;
  /** Resolver for the backoff sleep currently in progress, if any. */
  wakeFn: (() => void) | null;
  /**
   * A wake that arrived while no sleep was in progress. Without this the
   * reconnect that fires microseconds before the loop enters its sleep is
   * simply lost and the upload waits out the full backoff anyway.
   */
  wakeRequested: boolean;
  promise: Promise<UploadOutcome>;
}

const runners = new Map<string, RunnerHandle>();
let generationCounter = 0;
let listenersBound = false;
let unbindListeners: (() => void) | null = null;
let lastKnownConnected = true;

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function ratio(bytes: number, total: number): number {
  // Both guarded: a non-number from a record written by an older build
  // would otherwise reach the banner as `width: "NaN%"`.
  if (!Number.isFinite(total) || total <= 0) return 0;
  if (!Number.isFinite(bytes) || bytes <= 0) return 0;
  return Math.max(0, Math.min(1, bytes / total));
}

function requestWake(handle: RunnerHandle): void {
  handle.wakeRequested = true;
  handle.wakeFn?.();
}

/**
 * Watches for an attempt that has stopped making progress and aborts it.
 * Ticks off wall-clock rather than a single `setTimeout` so a process that
 * was SUSPENDED mid-upload notices the stall on its very first tick after
 * the app comes back, instead of waiting out a timer that never ran.
 */
function startStallWatchdog(onStall: () => void): {
  ping: () => void;
  stop: () => void;
} {
  let lastActivityAt = Date.now();
  const timer = setInterval(() => {
    if (Date.now() - lastActivityAt < UPLOAD_STALL_TIMEOUT_MS) return;
    clearInterval(timer);
    onStall();
  }, STALL_CHECK_INTERVAL_MS);
  return {
    ping: () => {
      lastActivityAt = Date.now();
    },
    stop: () => clearInterval(timer),
  };
}

/**
 * Claim the runner slot for a match SYNCHRONOUSLY, superseding whoever held
 * it.
 *
 * Synchronous is the whole point. Every caller used to check the map, then
 * await something (a file stat, a persisted write), then register, and two
 * callers could both pass the check before either registered. That is not
 * theoretical: `ensureUploadListeners` binds AppState "active" and NetInfo
 * reconnect as independent triggers that fire together on the canonical
 * "walk back into wifi and open the app", with the bootstrap's mount effect
 * as a third caller. Two runners on one job both resume from the same
 * persisted tus URL, the server answers 409, and the loser nulls the URL
 * and starts a SECOND full transfer of the same 600 MB against the same
 * key.
 *
 * The handle is registered before this function returns, so a concurrent
 * caller sees it and stands down.
 */
function claimRunner(matchId: string, storagePath: string | null): RunnerHandle {
  const previous = runners.get(matchId);
  generationCounter += 1;
  const handle: RunnerHandle = {
    generation: generationCounter,
    storagePath,
    abort: null,
    wakeFn: null,
    wakeRequested: false,
    promise: Promise.resolve({ ok: false, error: "not started", willRetryLater: false }),
  };
  runners.set(matchId, handle);
  if (previous) {
    // Only after the replacement is registered, so the loser's own
    // `isCurrent()` reads false the moment it wakes.
    previous.abort?.();
    requestWake(previous);
  }
  return handle;
}

/** Backoff sleep that a foreground or reconnect event can cut short. */
async function backoffSleep(handle: RunnerHandle, ms: number): Promise<void> {
  if (handle.wakeRequested) {
    handle.wakeRequested = false;
    return;
  }
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      handle.wakeFn = null;
      resolve();
    };
    const timer = setTimeout(finish, ms);
    handle.wakeFn = finish;
  });
  handle.wakeRequested = false;
}

// ---------------------------------------------------------------------------
// Byte upload
// ---------------------------------------------------------------------------

type ByteFailure = {
  ok: false;
  error: string;
  retryable: boolean;
  /**
   * The clip is gone from the device. Distinct from every other failure
   * because it is the ONLY one where there is nothing left to keep: the job
   * and the (absent) file can be abandoned. Every other failure parks.
   */
  fileMissing?: boolean;
  /** The run lost its slot to a newer recording. Its writes must not land. */
  superseded?: boolean;
};

/**
 * Drop an object a SUPERSEDED runner uploaded.
 *
 * Only ever deletes a key that the runner now holding the slot is provably
 * not using. When that cannot be established (no current runner, or it has
 * not settled on a key yet) the object is left in place and reported: a
 * leaked 600 MB object is recoverable, deleting the live recording is not.
 */
async function discardSupersededObject(
  matchId: string,
  storagePath: string,
): Promise<void> {
  // The live runner's key when one is still running, else the key the
  // match store believes in, which outlives the runner that set it. Either
  // way this is "the object this match currently owns"; anything else at a
  // different key is ours and is unreachable.
  const ownerPath = runners.get(matchId)?.storagePath ?? getMatchUpload(matchId)?.storagePath;
  if (!ownerPath || ownerPath === storagePath) {
    console.warn(
      `[video] superseded upload left ${storagePath} in the bucket; not deleting (owner path unknown or identical)`,
    );
    captureException(new Error("Superseded match-video object left in the bucket"), {
      matchId,
      storagePath,
    });
    return;
  }
  console.warn(`[video] removing superseded upload ${storagePath} for ${matchId}`);
  await removeUploadedObject(storagePath);
}

async function uploadBytes(
  job: PendingUploadJob,
  handle: RunnerHandle,
  isCurrent: () => boolean,
): Promise<{ ok: true; job: PendingUploadJob } | ByteFailure> {
  let current = job;
  let lastError = "Upload failed";
  let lastRetryable = true;

  const superseded = (): ByteFailure => ({
    ok: false,
    error: "Superseded by a newer recording",
    retryable: false,
    superseded: true,
  });

  for (let attempt = current.attempt + 1; attempt <= UPLOAD_MAX_ATTEMPTS; attempt++) {
    if (!isCurrent()) return superseded();

    // The clip can vanish between attempts (cache purge, user clearing
    // storage). There is nothing to upload and nothing to wait for.
    const size = await getRecordingSize(current.fileUri);
    if (!isCurrent()) return superseded();
    if (size == null || size === 0) {
      return {
        ok: false,
        retryable: false,
        fileMissing: true,
        error: "The recording is no longer on this device, so it can't be uploaded.",
      };
    }
    if (size !== current.fileSizeBytes) {
      // A different file at the same path invalidates any partial upload
      // the server is holding: its Upload-Length no longer matches.
      const patch: JobPatch = { fileSizeBytes: size, uploadUrl: null, bytesUploaded: 0 };
      current = (await patchUploadJob(current.matchId, patch)) ?? { ...current, ...patch };
      if (!isCurrent()) return superseded();
    }

    let lastPersistedAt = 0;
    const stall = startStallWatchdog(() => {
      console.warn(
        `[video] upload for ${current.matchId} made no progress for ${UPLOAD_STALL_TIMEOUT_MS}ms; aborting the attempt`,
      );
      handle.abort?.();
    });
    try {
      await uploadFileResumable({
        fileUri: current.fileUri,
        fileSizeBytes: current.fileSizeBytes,
        storagePath: current.storagePath,
        ext: current.ext,
        uploadUrl: current.uploadUrl,
        onAbortHandle: (abort) => {
          handle.abort = abort;
        },
        onUploadUrl: (url) => {
          stall.ping();
          // GUARDED, like every other write. A superseded runner's creation
          // POST landing late would otherwise stamp its own tus URL onto the
          // NEW clip's job, and the next resume would PATCH the new clip's
          // bytes into the old clip's object: one file corrupted, the other
          // never written.
          if (!isCurrent()) return;
          current = { ...current, uploadUrl: url };
          void patchUploadJob(current.matchId, { uploadUrl: url });
        },
        onProgress: (sent, total) => {
          stall.ping();
          if (!isCurrent()) return;
          setMatchUpload(current.matchId, { progress: ratio(sent, total) });
          const now = Date.now();
          if (now - lastPersistedAt >= PROGRESS_PERSIST_INTERVAL_MS) {
            lastPersistedAt = now;
            void patchUploadJob(current.matchId, { bytesUploaded: sent });
          }
        },
      });

      handle.abort = null;
      // THE SUCCESS PATH NEEDS THE GUARD MOST. It is the only one that
      // mutates the persisted `phase`, and a superseded runner writing
      // `phase: "row"` onto the NEW job makes the next launch skip the
      // upload entirely and write a `match_videos` row at `status='ready'`
      // for an object that was never uploaded. That dispatches the backend
      // slicer at a nonexistent file while the user is told the video
      // uploaded.
      if (!isCurrent()) {
        await discardSupersededObject(current.matchId, current.storagePath);
        return superseded();
      }

      // Bytes are in the bucket. `attempt` resets because the row write has
      // its own budget, and the phase flip is what stops any later resume
      // from re-uploading a complete object.
      const done: JobPatch = {
        phase: "row",
        bytesUploaded: current.fileSizeBytes,
        attempt: 0,
        lastError: null,
      };
      const next = (await patchUploadJob(current.matchId, done)) ?? { ...current, ...done };
      setMatchUpload(current.matchId, { progress: 1 });
      return { ok: true, job: next };
    } catch (err) {
      handle.abort = null;
      if (!isCurrent()) return superseded();

      const klass = classifyUploadError(err);
      lastError = messageOf(err);
      lastRetryable = klass.retryable;
      console.warn(
        `[video] upload attempt ${attempt}/${UPLOAD_MAX_ATTEMPTS} for ${current.matchId} failed` +
          `${klass.status ? ` (HTTP ${klass.status})` : ""}: ${lastError}`,
      );

      const patch: JobPatch = { attempt, lastError };
      if (klass.resetUploadUrl) {
        patch.uploadUrl = null;
        patch.bytesUploaded = 0;
      }
      current = (await patchUploadJob(current.matchId, patch)) ?? { ...current, ...patch };

      if (!klass.retryable || attempt >= UPLOAD_MAX_ATTEMPTS) break;
      await backoffSleep(handle, backoffDelayMs(attempt, UPLOAD_BACKOFF));
    } finally {
      stall.stop();
    }
  }

  return { ok: false, error: lastError, retryable: lastRetryable };
}

// ---------------------------------------------------------------------------
// match_videos row
// ---------------------------------------------------------------------------

async function writeRow(
  job: PendingUploadJob,
  handle: RunnerHandle,
  isCurrent: () => boolean,
): Promise<{ ok: true; videoId: string } | { ok: false; error: string }> {
  let lastError = "Saving the video record failed";

  for (let attempt = 1; attempt <= ROW_MAX_ATTEMPTS; attempt++) {
    if (!isCurrent()) return { ok: false, error: "Superseded by a newer recording" };
    try {
      const videoId = await writeMatchVideoRow({
        matchId: job.matchId,
        uploaderAthleteId: job.uploaderAthleteId,
        storagePath: job.storagePath,
        fileSizeBytes: job.fileSizeBytes,
      });
      return { ok: true, videoId };
    } catch (err) {
      lastError = messageOf(err);
      console.warn(
        `[video] match_videos write ${attempt}/${ROW_MAX_ATTEMPTS} for ${job.matchId} failed: ${lastError}`,
      );
      // `writeMatchVideoRow` awaits, so the slot can change under it. A
      // superseded runner must not stamp its attempt count on the new job.
      if (!isCurrent()) return { ok: false, error: "Superseded by a newer recording" };
      await patchUploadJob(job.matchId, { attempt, lastError });
      if (attempt >= ROW_MAX_ATTEMPTS) break;
      await backoffSleep(handle, backoffDelayMs(attempt, ROW_BACKOFF));
    }
  }

  // NOTE what does NOT happen here: the uploaded object is not deleted.
  // The bytes are the expensive, irreplaceable half. The job stays on disk
  // in phase "row", so the next foreground or reconnect retries JUST the
  // row, and compensation happens only when the job is finally abandoned
  // (see `abandonJob`).
  return { ok: false, error: lastError };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

/**
 * Give up on a job for good. This is the ONLY place a successfully uploaded
 * object is deleted: a job in phase "row" here has real bytes in the bucket
 * with no `match_videos` row, which is exactly the orphan the BE's sweep
 * would otherwise have to clean up.
 */
async function abandonJob(job: PendingUploadJob, reason: string): Promise<void> {
  console.warn(`[video] abandoning upload for ${job.matchId} (${reason})`);
  captureException(new Error(`Match-video upload abandoned: ${reason}`), {
    matchId: job.matchId,
    storagePath: job.storagePath,
    phase: job.phase,
    attempt: String(job.attempt),
  });
  if (job.phase === "row") await removeUploadedObject(job.storagePath);
  await removeUploadJob(job.matchId);
  releaseRecording(job.fileUri);
}

async function runJob(job: PendingUploadJob, handle: RunnerHandle): Promise<UploadOutcome> {
  const isCurrent = () => runners.get(job.matchId)?.generation === handle.generation;
  handle.storagePath = job.storagePath;

  setMatchUpload(job.matchId, {
    status: "uploading",
    storagePath: job.storagePath,
    error: null,
    videoId: null,
    progress: job.phase === "row" ? 1 : ratio(job.bytesUploaded, job.fileSizeBytes),
    // Restored from the JOB, not assumed from the store. On a resume after
    // a process kill the store is empty, and a clip that stops before the
    // end of the match would otherwise land as a clean success: exactly
    // the silent data loss jits-2zpe was filed for.
    truncation: job.truncation,
  });

  let current = job;
  if (current.phase === "bytes") {
    const bytes = await uploadBytes(current, handle, isCurrent);
    if (!bytes.ok) {
      if (bytes.superseded || !isCurrent()) {
        return { ok: false, error: bytes.error, willRetryLater: false };
      }
      if (bytes.fileMissing) {
        // The ONLY terminal case. There is no clip left to keep and no
        // object in the bucket, so there is nothing to park either.
        await abandonJob(current, `the recording file is gone: ${bytes.error}`);
        const message = `Upload failed: ${bytes.error}`;
        setMatchUpload(current.matchId, { status: "error", error: message });
        return { ok: false, error: message, willRetryLater: false };
      }
      // EVERYTHING ELSE PARKS, INCLUDING A NON-RETRYABLE FAILURE. This used
      // to call `abandonJob`, which deletes the local clip, so a single 403
      // destroyed an irreplaceable 600 MB recording with no user choice on
      // the strength of one request. A 403 can be transient (a token edge, a
      // `match_participants` row not yet visible), and the web half already
      // keeps the recording and offers the user a retry. The job stays on
      // disk; the retention window, not one response, decides to give up.
      const message = bytes.retryable
        ? `Upload paused: ${bytes.error}. It will resume automatically.`
        : `Upload failed: ${bytes.error}. The recording is saved on this device and will be retried.`;
      setMatchUpload(current.matchId, { status: "error", error: message });
      return { ok: false, error: message, willRetryLater: true };
    }
    current = bytes.job;
  }

  const row = await writeRow(current, handle, isCurrent);
  // The row write awaits, so the slot can change under it. Settling a
  // superseded run here would delete the NEW job record and the NEW clip.
  if (!isCurrent()) {
    if (row.ok) await discardSupersededObject(current.matchId, current.storagePath);
    return { ok: false, error: "Superseded by a newer recording", willRetryLater: false };
  }
  if (!row.ok) {
    const message = `Video uploaded, but saving the record failed: ${row.error}. It will retry automatically.`;
    setMatchUpload(current.matchId, { status: "error", error: message });
    return { ok: false, error: message, willRetryLater: true };
  }

  await removeUploadJob(current.matchId);
  releaseRecording(current.fileUri);
  setMatchUpload(current.matchId, {
    status: "uploaded",
    videoId: row.videoId,
    error: null,
    progress: 1,
  });
  return { ok: true, videoId: row.videoId };
}

/**
 * Attach a run to a slot that has ALREADY been claimed, and wire its
 * cleanup. `claimRunner` does the registration; this only fills in the
 * promise, so there is never a window where the slot is held by a handle
 * nothing will ever settle.
 */
function attachRun(
  matchId: string,
  handle: RunnerHandle,
  run: () => Promise<UploadOutcome>,
): Promise<UploadOutcome> {
  handle.promise = run()
    .catch((err): UploadOutcome => {
      // Nothing inside runJob is expected to throw, but an unhandled
      // rejection out of a fire-and-forget resume would take the app down
      // in dev and be invisible in production.
      const message = messageOf(err);
      console.warn(`[video] upload runner crashed for ${matchId}: ${message}`);
      captureException(err, { matchId });
      if (runners.get(matchId)?.generation === handle.generation) {
        setMatchUpload(matchId, { status: "error", error: `Upload failed: ${message}` });
      }
      return { ok: false, error: message, willRetryLater: true };
    })
    .finally(() => {
      if (runners.get(matchId)?.generation === handle.generation) runners.delete(matchId);
    });
  return handle.promise;
}

/** Claim the slot and run a persisted job on it. */
function launch(job: PendingUploadJob): Promise<UploadOutcome> {
  const handle = claimRunner(job.matchId, job.storagePath);
  return attachRun(job.matchId, handle, () => runJob(job, handle));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Everything `startMatchVideoUpload` does after it has claimed the slot.
 *
 * It runs INSIDE the runner's promise so the slot is held for the whole
 * sequence. Previously the slot was released at the top and only re-taken
 * after two awaits (a file stat and a persisted write), and an AppState
 * "active" landing in that window started a second, and then a third,
 * transport for the same match.
 */
async function prepareAndRun(
  params: StartUploadParams,
  handle: RunnerHandle,
): Promise<UploadOutcome> {
  const matchId = params.matchId;
  const isCurrent = () => runners.get(matchId)?.generation === handle.generation;
  const ext = params.ext ?? "mp4";

  const fileUri = retainRecording(params.fileUri, matchId, ext);
  const size = await getRecordingSize(fileUri);
  if (!isCurrent()) {
    return { ok: false, error: "Superseded by a newer recording", willRetryLater: false };
  }
  if (size == null || size === 0) {
    const error = "The recording file is empty or missing, so there is nothing to upload.";
    setMatchUpload(matchId, { status: "error", error, storagePath: params.storagePath });
    return { ok: false, error, willRetryLater: false };
  }

  const now = Date.now();
  const job: PendingUploadJob = {
    matchId,
    uploaderAthleteId: params.uploaderAthleteId,
    fileUri,
    storagePath: params.storagePath,
    ext,
    fileSizeBytes: size,
    uploadUrl: null,
    bytesUploaded: 0,
    phase: "bytes",
    attempt: 0,
    truncation: params.truncation ?? null,
    createdAt: now,
    updatedAt: now,
    lastError: null,
  };
  await saveUploadJob(job);
  if (!isCurrent()) {
    return { ok: false, error: "Superseded by a newer recording", willRetryLater: false };
  }
  return runJob(job, handle);
}

/**
 * Start (or restart) the upload for a freshly recorded clip and resolve
 * with its outcome.
 *
 * The clip is moved out of the camera cache and a job record is written
 * BEFORE the first byte is sent, so a kill at any point after this leaves
 * something resumable behind.
 *
 * A second call for the same match supersedes the first: the running loop
 * is aborted (keeping the server-side partial, which costs nothing) and its
 * job record is replaced, because the new clip is a different file with a
 * different length. The slot is claimed synchronously, so nothing can slip
 * in between the supersede and the replacement.
 */
export function startMatchVideoUpload(params: StartUploadParams): Promise<UploadOutcome> {
  const handle = claimRunner(params.matchId, params.storagePath);
  ensureUploadListeners();
  return attachRun(params.matchId, handle, () => prepareAndRun(params, handle));
}

/**
 * Resume every persisted job that is not already running. Safe to call
 * repeatedly, and safe to call CONCURRENTLY: the `runners.has` check and
 * the `launch` that follows it are one synchronous unit, so two sweeps
 * racing on the same foreground cannot both start the same job.
 */
export async function resumeMatchVideoUploads(): Promise<void> {
  ensureUploadListeners();
  const jobs = await loadUploadJobs();
  for (const job of jobs) {
    // The runner check comes FIRST, including before expiry. A job created
    // just under the window can be launched and still be transferring when
    // a sweep crosses it, and `abandonJob` deletes the local clip: expiring
    // it there would pull the file out from under a live upload.
    if (runners.has(job.matchId)) continue;
    if (isJobExpired(job)) {
      await abandonJob(job, "job older than the retention window");
      continue;
    }
    // `attempt` is reset here on purpose: a resume is triggered by a real
    // change in conditions (the app came back, the network came back), so a
    // previous run's exhausted budget should not immediately exhaust this
    // one. The retention window, not the attempt count, is what eventually
    // gives up.
    //
    // Reset IN MEMORY, not through `patchUploadJob`: persisting it first
    // would put an await between the check above and the claim below, which
    // is exactly the window two concurrent sweeps used to both pass. The
    // on-disk value only matters to a future process, and that process
    // resets it the same way.
    void launch({ ...job, attempt: 0 });
  }
}

/** Cut short any pending backoff sleep, e.g. the network just came back. */
export function wakeMatchVideoUploads(): void {
  for (const handle of runners.values()) requestWake(handle);
}

/** True while at least one upload loop is alive. Diagnostics and tests. */
export function hasActiveVideoUploads(): boolean {
  return runners.size > 0;
}

/**
 * Bind the resume triggers. Idempotent, and safe to call from a component
 * effect. Returns an unsubscribe for symmetry, though in practice these
 * listeners live for the process.
 */
export function ensureUploadListeners(): () => void {
  if (listenersBound) return unbindListeners ?? (() => {});
  listenersBound = true;

  const appStateSub = AppState.addEventListener("change", (next: AppStateStatus) => {
    if (next !== "active") return;
    // iOS suspends an upload the moment the app leaves the foreground and
    // kills it if it stays away (the app declares no background transfer
    // mode). Coming back is therefore the single most likely moment for a
    // stalled upload to be able to make progress again.
    wakeMatchVideoUploads();
    void resumeMatchVideoUploads();
  });

  NetInfo.fetch()
    .then((state) => {
      lastKnownConnected = state.isConnected ?? true;
    })
    .catch(() => undefined);

  const netSub = NetInfo.addEventListener((state) => {
    const connected = state.isConnected ?? true;
    const reconnected = !lastKnownConnected && connected;
    lastKnownConnected = connected;
    if (!reconnected) return;
    wakeMatchVideoUploads();
    void resumeMatchVideoUploads();
  });

  unbindListeners = () => {
    // Optional: RN returns a subscription, but the test renderer's AppState
    // returns nothing, and a throw here would leave `listenersBound` true
    // and silently disable every later rebind.
    appStateSub?.remove?.();
    netSub?.();
    listenersBound = false;
    unbindListeners = null;
  };
  return unbindListeners;
}

/** Test-only teardown. Never called from app code. */
export function __resetVideoUploadManager(): void {
  for (const handle of runners.values()) {
    handle.abort?.();
    requestWake(handle);
  }
  runners.clear();
  generationCounter = 0;
  lastKnownConnected = true;
  unbindListeners?.();
  listenersBound = false;
  unbindListeners = null;
}

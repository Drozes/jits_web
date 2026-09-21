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
import { setMatchUpload } from "./match-upload-store";
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
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(1, bytes / total));
}

function requestWake(handle: RunnerHandle): void {
  handle.wakeRequested = true;
  handle.wakeFn?.();
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

async function uploadBytes(
  job: PendingUploadJob,
  handle: RunnerHandle,
  isCurrent: () => boolean,
): Promise<{ ok: true; job: PendingUploadJob } | { ok: false; error: string; retryable: boolean }> {
  let current = job;
  let lastError = "Upload failed";
  let lastRetryable = true;

  for (let attempt = current.attempt + 1; attempt <= UPLOAD_MAX_ATTEMPTS; attempt++) {
    if (!isCurrent()) return { ok: false, error: "Superseded by a newer recording", retryable: false };

    // The clip can vanish between attempts (cache purge, user clearing
    // storage). There is nothing to upload and nothing to wait for, so this
    // is terminal rather than parked.
    const size = await getRecordingSize(current.fileUri);
    if (size == null || size === 0) {
      return {
        ok: false,
        retryable: false,
        error: "The recording is no longer on this device, so it can't be uploaded.",
      };
    }
    if (size !== current.fileSizeBytes) {
      // A different file at the same path invalidates any partial upload
      // the server is holding: its Upload-Length no longer matches.
      const patch: JobPatch = { fileSizeBytes: size, uploadUrl: null, bytesUploaded: 0 };
      current = (await patchUploadJob(current.matchId, patch)) ?? { ...current, ...patch };
    }

    let lastPersistedAt = 0;
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
          current = { ...current, uploadUrl: url };
          void patchUploadJob(current.matchId, { uploadUrl: url });
        },
        onProgress: (sent, total) => {
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
      if (!isCurrent()) return { ok: false, error: "Superseded by a newer recording", retryable: false };

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

  setMatchUpload(job.matchId, {
    status: "uploading",
    storagePath: job.storagePath,
    error: null,
    videoId: null,
    progress: job.phase === "row" ? 1 : ratio(job.bytesUploaded, job.fileSizeBytes),
  });

  let current = job;
  if (current.phase === "bytes") {
    const bytes = await uploadBytes(current, handle, isCurrent);
    if (!bytes.ok) {
      if (!isCurrent()) return { ok: false, error: bytes.error, willRetryLater: false };
      if (!bytes.retryable) {
        await abandonJob(current, `unrecoverable upload failure: ${bytes.error}`);
        const message = `Upload failed: ${bytes.error}`;
        setMatchUpload(current.matchId, { status: "error", error: message });
        return { ok: false, error: message, willRetryLater: false };
      }
      const message = `Upload paused: ${bytes.error}. It will resume automatically.`;
      setMatchUpload(current.matchId, { status: "error", error: message });
      return { ok: false, error: message, willRetryLater: true };
    }
    current = bytes.job;
  }

  const row = await writeRow(current, handle, isCurrent);
  if (!row.ok) {
    if (!isCurrent()) return { ok: false, error: row.error, willRetryLater: false };
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

function launch(job: PendingUploadJob): Promise<UploadOutcome> {
  generationCounter += 1;
  const handle: RunnerHandle = {
    generation: generationCounter,
    abort: null,
    wakeFn: null,
    wakeRequested: false,
    promise: Promise.resolve({ ok: false, error: "not started", willRetryLater: false }),
  };
  // Registered BEFORE the run starts. `runJob` executes synchronously up to
  // its first await, and its very first act is an `isCurrent()` check that
  // reads this map; registering afterwards made every run believe it had
  // already been superseded.
  runners.set(job.matchId, handle);
  handle.promise = runJob(job, handle)
    .catch((err): UploadOutcome => {
      // Nothing inside runJob is expected to throw, but an unhandled
      // rejection out of a fire-and-forget resume would take the app down
      // in dev and be invisible in production.
      const message = messageOf(err);
      console.warn(`[video] upload runner crashed for ${job.matchId}: ${message}`);
      captureException(err, { matchId: job.matchId });
      setMatchUpload(job.matchId, { status: "error", error: `Upload failed: ${message}` });
      return { ok: false, error: message, willRetryLater: true };
    })
    .finally(() => {
      if (runners.get(job.matchId)?.generation === handle.generation) runners.delete(job.matchId);
    });
  return handle.promise;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

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
 * different length.
 */
export async function startMatchVideoUpload(params: StartUploadParams): Promise<UploadOutcome> {
  const ext = params.ext ?? "mp4";
  const previous = runners.get(params.matchId);
  if (previous) {
    runners.delete(params.matchId);
    previous.abort?.();
    requestWake(previous);
  }

  const fileUri = retainRecording(params.fileUri, params.matchId, ext);
  const size = await getRecordingSize(fileUri);
  if (size == null || size === 0) {
    const error = "The recording file is empty or missing, so there is nothing to upload.";
    setMatchUpload(params.matchId, { status: "error", error, storagePath: params.storagePath });
    return { ok: false, error, willRetryLater: false };
  }

  const now = Date.now();
  const job: PendingUploadJob = {
    matchId: params.matchId,
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
  ensureUploadListeners();
  return launch(job);
}

/**
 * Resume every persisted job that is not already running. Safe to call
 * repeatedly: a match with a live runner is skipped rather than duplicated.
 */
export async function resumeMatchVideoUploads(): Promise<void> {
  ensureUploadListeners();
  const jobs = await loadUploadJobs();
  for (const job of jobs) {
    if (isJobExpired(job)) {
      await abandonJob(job, "job older than the retention window");
      continue;
    }
    if (runners.has(job.matchId)) continue;
    // `attempt` is reset here on purpose: a resume is triggered by a real
    // change in conditions (the app came back, the network came back), so a
    // previous run's exhausted budget should not immediately exhaust this
    // one. The retention window, not the attempt count, is what eventually
    // gives up.
    const fresh = (await patchUploadJob(job.matchId, { attempt: 0 })) ?? job;
    void launch(fresh);
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

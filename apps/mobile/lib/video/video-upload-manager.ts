import { markDiscardedHere } from "./discard-markers";
import { AppState, type AppStateStatus } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { backoffDelayMs, classifyUploadError } from "@jits/shared/utils";
import { captureException } from "@/lib/error-tracking/sentry";
import {
  abandonMatchVideoRow,
  buildVideoPath,
  finalizeMatchVideoRow,
  getRecordingSize,
  preflightMatchVideoUpload,
  readMatchVideoKey,
  removeUploadedObject,
  reserveMatchVideoRow,
  touchMatchVideoRow,
  uploadFileResumable,
  writeMatchVideoRow,
  type MatchVideoGate,
} from "./upload-recording";
import { releaseRecording, retainRecording } from "./recording-file";
import {
  type PendingAbandon,
  type PendingUploadJob,
  UPLOAD_JOB_MAX_AGE_MS,
  isJobExpired,
  loadPendingAbandons,
  removePendingAbandon,
  savePendingAbandon,
  loadUploadJob,
  loadUploadJobs,
  patchUploadJob,
  removeUploadJob,
  saveUploadJob,
} from "./upload-persistence";
import {
  clearMatchUpload,
  getMatchUpload,
  resetMatchUploadStore,
  setMatchUpload,
} from "./match-upload-store";
import type { RecordingTruncation } from "./use-video-recorder";
import {
  classifyByteFailure,
  classifyReserveFailure,
  classifyRowFailure,
  preflightClass,
  RETRY_FAILED_AGAIN_COPY,
  describeUploadFailure,
  isTerminalUploadClass,
  type UploadErrorClass,
} from "./upload-errors";
import { registerUploadControl } from "./upload-control";
import {
  trackAttemptFailed,
  trackParked,
  trackRunDropped,
  trackRunStart,
  trackUploaded,
} from "./upload-telemetry";

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
 *
 * RESERVE BEFORE BYTES (jits-n2im.11, protocol 2). A fresh recording now
 * runs: preflight (`can_upload_match_video`, advisory) -> reserve (INSERT the
 * `match_videos` row at 'uploading' with the final key, the size and the
 * record start time) -> bytes over tus, with a heartbeat at most every
 * UPLOAD_HEARTBEAT_INTERVAL_MS and once on pause -> land (PATCH to 'ready';
 * the storage trigger may have flipped it already, which is fine). So the
 * opponent sees the angle arriving, and every server gate refuses the upload
 * before a single byte is spent. The reserved id is persisted the moment the
 * INSERT returns, and a reservation retried after a kill re-uses the row
 * (23505 -> re-path, a same-key echo) rather than creating a second one.
 * A job persisted by the wave 1 build (protocol 1) finishes the old way.
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
/**
 * Foreground retry timer for a PAUSED job (jits-n2im.3). Without it a job
 * that parks while the app sits in the foreground on a steady connection
 * waits for an AppState or NetInfo event that never comes. Doubles per
 * consecutive park, capped, and is cancelled on settle and on background
 * (coming back to the foreground resumes every job anyway).
 */
export const FOREGROUND_RETRY_BASE_MS = 120_000;
export const FOREGROUND_RETRY_MAX_MS = 600_000;
/** At most one `touch_match_video_upload` per reserved row per this window. */
export const UPLOAD_HEARTBEAT_INTERVAL_MS = 30_000;
/**
 * How long an abandon waits on `abandon_match_video_upload` before giving up
 * on the answer. Without the answer a landed object is KEPT, never deleted.
 */
export const ABANDON_RPC_TIMEOUT_MS = 10_000;

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
  /** Wall-clock (epoch ms) the recorder started; sent with the reservation. */
  recordStartedAt?: number | null;
  /** Recorder-measured clip length in ms; sent with the reservation. */
  recordDurationMs?: number | null;
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

/**
 * The athlete whose jobs may run (jits-n2im.6). Set by the bootstrap from
 * the signed-in athlete and cleared on sign-out, so a persisted job never
 * runs under somebody else's session: it would only fail RLS until the
 * 7-day abandon, and on a shared phone it is the previous athlete's film.
 * Null means nobody is signed in and nothing resumes.
 */
let owner: string | null = null;

/** Pending foreground retries for paused jobs, with the current delay. */
const retryTimers = new Map<string, { timer: ReturnType<typeof setTimeout> | null; delayMs: number }>();

/**
 * Jobs an expiry sweep has already claimed, keyed by match and creation
 * time. Claimed SYNCHRONOUSLY before the abandon's first await, so two
 * sweeps that loaded the same expired job cannot both abandon it (the
 * second delete answered "removed 0 objects" and fired a misleading
 * silent-RLS-denial report, jits-jm9r).
 */
const abandonClaims = new Set<string>();

/** Last heartbeat per reserved row id, so resumed attempts share the throttle. */
const lastHeartbeatAt = new Map<string, number>();

/** True for a job on the reserve-before-bytes lifecycle (protocol 2). */
function isReserved(job: PendingUploadJob): boolean {
  return job.protocol === 2;
}

/**
 * Report confirmed bytes for a reserved row: at most once per
 * UPLOAD_HEARTBEAT_INTERVAL_MS while bytes move, or now (`force`) when the
 * upload pauses. Fire and forget; protocol 1 jobs have no row to touch.
 */
function heartbeat(job: PendingUploadJob, bytesConfirmed: number, force: boolean): void {
  const videoId = job.videoId;
  if (!isReserved(job) || !videoId) return;
  const now = Date.now();
  const last = lastHeartbeatAt.get(videoId);
  if (!force && last != null && now - last < UPLOAD_HEARTBEAT_INTERVAL_MS) return;
  lastHeartbeatAt.set(videoId, now);
  void touchMatchVideoRow({ videoId, bytesConfirmed, bytesTotal: job.fileSizeBytes });
}

function hintOf(err: unknown): string | null {
  const hint = (err as { hint?: unknown } | null)?.hint;
  return typeof hint === "string" ? hint : null;
}

/**
 * Give a job a fresh storage key. Only ever before any byte of the NEW key
 * is sent, which is why the tus URL and offset reset with it: a reservation
 * the server refused for its key (42501 `invalid_storage_path`), or a row
 * that was abandoned under the old key (a same-key PATCH cannot revive it).
 */
async function rekeyJob(job: PendingUploadJob, handle: RunnerHandle, isCurrent: () => boolean): Promise<PendingUploadJob> {
  const patch: JobPatch = {
    storagePath: buildVideoPath(job.matchId, job.uploaderAthleteId, job.ext),
    uploadUrl: null,
    bytesUploaded: 0,
  };
  const next = (await patchUploadJob(job.matchId, patch)) ?? { ...job, ...patch };
  if (isCurrent()) {
    handle.storagePath = next.storagePath;
    setMatchUpload(job.matchId, { storagePath: next.storagePath });
  }
  return next;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const activityListeners = new Set<() => void>();

function emitActivity(): void {
  for (const listener of activityListeners) {
    try {
      listener();
    } catch {
      /* a listener must not break the runner bookkeeping */
    }
  }
}

/**
 * Notified whenever the set of live runners changes (one starts, one
 * settles). Drives the upload keep-awake and the backgrounding notice.
 */
export function subscribeUploadActivity(listener: () => void): () => void {
  activityListeners.add(listener);
  return () => {
    activityListeners.delete(listener);
  };
}

/** Scope automatic resumes to this athlete (null: signed out, run nothing). */
export function setUploadOwner(athleteId: string | null): void {
  owner = athleteId;
}

export function getUploadOwner(): string | null {
  return owner;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** The upload gate a `match_videos` write failure carries, if any. */
function gateOf(err: unknown): MatchVideoGate | null {
  const gate = (err as { gate?: unknown } | null)?.gate;
  return typeof gate === "string" ? (gate as MatchVideoGate) : null;
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
  // A run is starting: drop any pending foreground retry, but KEEP its delay
  // so the next park backs off further. Only a settle forgets it.
  cancelPendingRetry(matchId);
  emitActivity();
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
  /** Raw cause. Telemetry and logs only. */
  error: string;
  retryable: boolean;
  /** What the athlete is told, and whether it pauses or fails. */
  klass: UploadErrorClass;
  status: number | null;
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

  let lastClass: UploadErrorClass = "unknown";
  let lastStatus: number | null = null;

  const superseded = (): ByteFailure => ({
    ok: false,
    error: "Superseded by a newer recording",
    retryable: false,
    klass: "unknown",
    status: null,
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
        klass: "file_missing",
        status: null,
        error: "recording file missing or empty",
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
          heartbeat(current, sent, false);
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
        // M1: a reserved job's row may ALREADY be 'ready' on this key (the
        // storage trigger flips it the moment the last byte lands), and the
        // newer recording's reservation may never move it off. So a
        // protocol 2 object is never deleted here; the newer job deletes it
        // once its own reservation has re-pathed the row (see
        // `previousStoragePath`). A protocol 1 object has no row yet.
        if (!isReserved(current)) await discardSupersededObject(current.matchId, current.storagePath);
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
      lastStatus = klass.status;
      lastClass = classifyByteFailure(err);
      console.warn(
        `[video] upload attempt ${attempt}/${UPLOAD_MAX_ATTEMPTS} for ${current.matchId} failed` +
          `${klass.status ? ` (HTTP ${klass.status})` : ""}: ${lastError}`,
      );
      trackAttemptFailed({
        matchId: current.matchId,
        phase: "bytes",
        attempt,
        offset: current.bytesUploaded,
        status: klass.status,
        klass: lastClass,
        raw: lastError,
      });

      const patch: JobPatch = { attempt, lastError, errorClass: lastClass };
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

  return { ok: false, error: lastError, retryable: lastRetryable, klass: lastClass, status: lastStatus };
}

// ---------------------------------------------------------------------------
// match_videos row
// ---------------------------------------------------------------------------

async function writeRow(
  job: PendingUploadJob,
  handle: RunnerHandle,
  isCurrent: () => boolean,
): Promise<
  | { ok: true; videoId: string }
  | { ok: false; error: string; klass: UploadErrorClass; gated?: boolean }
> {
  let lastError = "Saving the video record failed";
  let lastClass: UploadErrorClass = "save_failed";
  const superseded = { ok: false as const, error: "Superseded by a newer recording", klass: "unknown" as const };

  for (let attempt = 1; attempt <= ROW_MAX_ATTEMPTS; attempt++) {
    if (!isCurrent()) return superseded;
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
      lastClass = classifyRowFailure(err);
      console.warn(
        `[video] match_videos write ${attempt}/${ROW_MAX_ATTEMPTS} for ${job.matchId} failed: ${lastError}`,
      );
      // `writeMatchVideoRow` awaits, so the slot can change under it. A
      // superseded runner must not stamp its attempt count on the new job.
      if (!isCurrent()) return superseded;
      trackAttemptFailed({
        matchId: job.matchId,
        phase: "row",
        attempt,
        offset: job.fileSizeBytes,
        status: null,
        klass: lastClass,
        raw: lastError,
      });
      await patchUploadJob(job.matchId, { attempt, lastError, errorClass: lastClass });
      // A server-side upload gate (daily cap, uploads off, not in the beta
      // cohort) does not lift within a backoff window, so the remaining
      // attempts would only hit it again. Park now; the next foreground or
      // reconnect resumes the job. Duck-typed rather than `instanceof` so
      // the check survives the module being doubled in tests.
      if (gateOf(err)) return { ok: false, error: lastError, klass: lastClass, gated: true };
      if (attempt >= ROW_MAX_ATTEMPTS) break;
      await backoffSleep(handle, backoffDelayMs(attempt, ROW_BACKOFF));
    }
  }

  // NOTE what does NOT happen here: the uploaded object is not deleted.
  // The bytes are the expensive, irreplaceable half. The job stays on disk
  // in phase "row", so the next foreground or reconnect retries JUST the
  // row, and compensation happens only when the job is finally abandoned
  // (see `abandonJob`).
  return { ok: false, error: lastError, klass: lastClass };
}

// ---------------------------------------------------------------------------
// Reservation (protocol 2, jits-n2im.11) and the land PATCH
// ---------------------------------------------------------------------------

type ReserveResult =
  | { ok: true; job: PendingUploadJob; landed: boolean }
  | { ok: false; error: string; klass: UploadErrorClass; superseded?: boolean; dropped?: boolean };

/**
 * B1: the athlete already has a row WITH BYTES for this match (a re-record).
 * Re-pathing it now would fire the server's re-upload reset (chunks,
 * analysis, AI tags, poster, highlights) before a single new byte exists,
 * and a re-record that never lands (offline, Discard, the 7-day expiry)
 * would take the earlier, good video with it. So this job runs in the
 * wave 1 order instead: bytes first, then the INSERT at 'ready' whose 23505
 * fallback replaces the row only once the new bytes are in.
 */
async function deferToLegacyOrder(job: PendingUploadJob, existingStatus: string | null): Promise<PendingUploadJob> {
  console.warn(
    `[video] ${job.matchId} already has a video (${existingStatus ?? "unknown"}); uploading first, replacing it only after the bytes land`,
  );
  const patch: JobPatch = { protocol: 1, videoId: null, attempt: 0, lastError: null, errorClass: null };
  return (await patchUploadJob(job.matchId, patch)) ?? { ...job, ...patch };
}

/**
 * Preflight, then reserve the `match_videos` row at 'uploading', BEFORE any
 * byte. Every server gate (uploads off, cohort, daily cap, the re-slice
 * ceiling on a re-path) refuses here, so a refused upload costs no data.
 *
 * The reserved id is persisted the moment the write returns. A kill before
 * that leaves the job in phase "bytes" with no id, and the next run's
 * reservation answers 23505 and takes the same row over with a same-key
 * echo: one row, never two. When that echo finds the row already past
 * 'uploading' under our key, the bytes landed before the kill (the storage
 * trigger flipped it) and the job skips straight to done (`landed`).
 */
async function reserveRow(
  job: PendingUploadJob,
  handle: RunnerHandle,
  isCurrent: () => boolean,
): Promise<ReserveResult> {
  const superseded: ReserveResult = {
    ok: false,
    error: "Superseded by a newer recording",
    klass: "unknown",
    superseded: true,
  };
  let current = job;
  let lastError = "Reserving the video record failed";
  let lastClass: UploadErrorClass = "server";
  let rekeyed = false;

  // Advisory: null (offline, older backend) falls through to the
  // reservation, whose triggers enforce the same predicates.
  const preflight = await preflightMatchVideoUpload(current.matchId, current.fileSizeBytes);
  if (!isCurrent()) return superseded;
  const refused = preflight && !preflight.allowed ? preflightClass(preflight.reason) : null;
  if (preflight && preflight.reason === "duplicate" && preflight.existingStatus !== "uploading") {
    // Abandoned rows read "failed" here too; the legacy order is safe for
    // them as well (the 23505 fallback re-paths them after the bytes).
    return { ok: true, job: await deferToLegacyOrder(current, preflight.existingStatus), landed: false };
  }
  if (refused) {
    lastError = `preflight refused: ${preflight?.reason}`;
    trackAttemptFailed({
      matchId: current.matchId,
      phase: "reserve",
      attempt: 1,
      offset: 0,
      status: null,
      klass: refused,
      raw: lastError,
    });
    await patchUploadJob(current.matchId, { lastError, errorClass: refused });
    return { ok: false, error: lastError, klass: refused };
  }

  for (let attempt = 1; attempt <= ROW_MAX_ATTEMPTS; attempt++) {
    if (!isCurrent()) return superseded;
    try {
      const row = await reserveMatchVideoRow({
        matchId: current.matchId,
        uploaderAthleteId: current.uploaderAthleteId,
        storagePath: current.storagePath,
        fileSizeBytes: current.fileSizeBytes,
        recordStartedAt: current.recordStartedAt ?? null,
        recordDurationMs: current.recordDurationMs ?? null,
      });
      if (!isCurrent()) return superseded;
      if (row.outcome === "deferred") {
        // The server-side check of the same rule (covers a null preflight).
        return { ok: true, job: await deferToLegacyOrder(current, row.status), landed: false };
      }
      const sameKey = row.storagePath === current.storagePath;
      if (sameKey && row.status === "deleted") {
        // The athlete deleted this video while it was still arriving. Never
        // revive it (minor 6): drop the job.
        return { ok: false, error: "the reserved video was deleted", klass: "unknown", dropped: true };
      }
      if (sameKey && row.status === "failed" && !rekeyed) {
        // Our own row, abandoned under this key: a same-key PATCH cannot
        // change its status. A new key can, for free.
        rekeyed = true;
        current = await rekeyJob(current, handle, isCurrent);
        continue;
      }
      if (row.previousStoragePath && row.previousStoragePath !== current.storagePath) {
        // The row moved off an older recording's key (one that never landed,
        // or a superseded runner left it): nothing references that object
        // any more, so this job cleans it up (M1).
        void removeUploadedObject(row.previousStoragePath);
      }
      const landed = sameKey && !["uploading", "failed", "deleted"].includes(row.status);
      const patch: JobPatch = { videoId: row.id, attempt: 0, lastError: null, errorClass: null };
      if (landed) {
        patch.phase = "row";
        patch.bytesUploaded = current.fileSizeBytes;
      }
      current = (await patchUploadJob(current.matchId, patch)) ?? { ...current, ...patch };
      return { ok: true, job: current, landed };
    } catch (err) {
      lastError = messageOf(err);
      if (!isCurrent()) return superseded;
      if (hintOf(err) === "invalid_storage_path" && !rekeyed) {
        // The server refused the KEY (42501): mint a canonical one and try
        // once more. Never loops: a second refusal is classified below.
        console.warn(`[video] reservation for ${current.matchId} refused its storage key; re-keying once`);
        captureException(new Error("Match-video reservation refused its storage path"), {
          matchId: current.matchId,
          storagePath: current.storagePath,
        });
        rekeyed = true;
        current = await rekeyJob(current, handle, isCurrent);
        continue;
      }
      lastClass = classifyReserveFailure(err);
      console.warn(
        `[video] match_videos reservation ${attempt}/${ROW_MAX_ATTEMPTS} for ${current.matchId} failed: ${lastError}`,
      );
      trackAttemptFailed({
        matchId: current.matchId,
        phase: "reserve",
        attempt,
        offset: 0,
        status: null,
        klass: lastClass,
        raw: lastError,
      });
      await patchUploadJob(current.matchId, { attempt, lastError, errorClass: lastClass });
      // A gate or an RLS refusal does not lift within a backoff window.
      if (gateOf(err) || lastClass === "not_allowed") break;
      if (attempt >= ROW_MAX_ATTEMPTS) break;
      await backoffSleep(handle, backoffDelayMs(attempt, ROW_BACKOFF));
    }
  }
  return { ok: false, error: lastError, klass: lastClass };
}

type FinalizeResult =
  | { ok: true; videoId: string }
  | {
      ok: false;
      error: string;
      klass: UploadErrorClass;
      superseded?: boolean;
      moved?: boolean;
      abandoned?: boolean;
      dropped?: boolean;
    };

/**
 * Land a reserved row: PATCH 'uploading' -> 'ready' (filtered on our key, so
 * it can never flip a newer recording's reservation). The storage trigger
 * may have flipped it first; the PATCH is then a no-op that still reads
 * "landed", and exactly one slice runs. A row that vanished falls back to the
 * wave 1 INSERT at 'ready' (the bytes are in, they just need a row).
 */
async function finalizeRow(
  job: PendingUploadJob,
  handle: RunnerHandle,
  isCurrent: () => boolean,
): Promise<FinalizeResult> {
  const videoId = job.videoId as string;
  let lastError = "Saving the video record failed";
  let lastClass: UploadErrorClass = "save_failed";
  const superseded: FinalizeResult = {
    ok: false,
    error: "Superseded by a newer recording",
    klass: "unknown",
    superseded: true,
  };

  for (let attempt = 1; attempt <= ROW_MAX_ATTEMPTS; attempt++) {
    if (!isCurrent()) return superseded;
    try {
      const out = await finalizeMatchVideoRow({ videoId, storagePath: job.storagePath });
      if (out.outcome === "landed") return { ok: true, videoId };
      if (out.outcome === "deleted") {
        return { ok: false, error: "the reserved video was deleted", klass: "unknown", dropped: true };
      }
      if (out.outcome === "moved") {
        return { ok: false, error: "The match video row now points at another recording", klass: "unknown", moved: true };
      }
      if (out.outcome === "abandoned") {
        return { ok: false, error: `reserved row failed (${out.failureCode ?? "no failure_code"})`, klass: "server", abandoned: true };
      }
      // missing: the row was deleted under us. Bytes are in; write one.
      const id = await writeMatchVideoRow({
        matchId: job.matchId,
        uploaderAthleteId: job.uploaderAthleteId,
        storagePath: job.storagePath,
        fileSizeBytes: job.fileSizeBytes,
      });
      return { ok: true, videoId: id };
    } catch (err) {
      lastError = messageOf(err);
      lastClass = classifyRowFailure(err);
      console.warn(`[video] land ${attempt}/${ROW_MAX_ATTEMPTS} for ${job.matchId} failed: ${lastError}`);
      if (!isCurrent()) return superseded;
      trackAttemptFailed({
        matchId: job.matchId,
        phase: "row",
        attempt,
        offset: job.fileSizeBytes,
        status: null,
        klass: lastClass,
        raw: lastError,
      });
      await patchUploadJob(job.matchId, { attempt, lastError, errorClass: lastClass });
      if (gateOf(err)) return { ok: false, error: lastError, klass: lastClass };
      if (attempt >= ROW_MAX_ATTEMPTS) break;
      await backoffSleep(handle, backoffDelayMs(attempt, ROW_BACKOFF));
    }
  }
  return { ok: false, error: lastError, klass: lastClass };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

type RunTrigger = "start" | "resume" | "retry";

/**
 * Give up on a job for good. This is the ONLY place a successfully uploaded
 * object is deleted: a job in phase "row" here has real bytes in the bucket
 * with no `match_videos` row, which is exactly the orphan the BE's sweep
 * would otherwise have to clean up.
 */
async function abandonJob(job: PendingUploadJob, reason: string): Promise<void> {
  console.warn(`[video] abandoning upload for ${job.matchId} (${reason})`);
  trackRunDropped(job.matchId, "abandoned");
  captureException(new Error(`Match-video upload abandoned: ${reason}`), {
    matchId: job.matchId,
    storagePath: job.storagePath,
    phase: job.phase,
    attempt: String(job.attempt),
    errorClass: job.errorClass,
    ageMs: Date.now() - job.createdAt,
  });
  if (isReserved(job) && job.videoId) {
    // Tell the server first (jits-n2im.11): the reserved row goes
    // 'uploading' -> 'failed' (upload_abandoned) instead of sitting there
    // for the 7-day reaper. In phase "row" the object is deleted ONLY when
    // the row really gave up on it: a row the storage trigger already
    // flipped to 'ready' is live and uses those bytes, and an unanswered
    // call (offline, timeout) keeps them. A leaked object is recoverable; a
    // deleted live recording is not.
    //
    // The call is recorded BEFORE it is made and forgotten only once the
    // server answers (minor 5): an unanswered one is retried on the next
    // resume sweep, so a Discard made offline still fails the row. A row the
    // storage trigger already flipped live stays live (abandon answers
    // `abandoned: false`); that is the server's truth, not a lost clip.
    const rec: PendingAbandon = {
      videoId: job.videoId,
      uploaderAthleteId: job.uploaderAthleteId,
      matchId: job.matchId,
      storagePath: job.storagePath,
      phase: job.phase,
      createdAt: Date.now(),
    };
    await savePendingAbandon(rec);
    // The resolution keeps running past the timeout and cleans up after
    // itself if the answer arrives late.
    await withTimeout(resolvePendingAbandon(rec), ABANDON_RPC_TIMEOUT_MS);
    lastHeartbeatAt.delete(job.videoId);
  } else if (job.phase === "row") {
    await removeUploadedObject(job.storagePath);
  }
  await removeUploadJob(job.matchId);
  releaseRecording(job.fileUri);
}

/** Abandons being sent right now, so a sweep never doubles one. */
const abandonsInFlight = new Set<string>();

/**
 * Send one pending abandon. Removes the record once the server answered;
 * keeps it (for the next sweep) when it did not. In phase "row" the object
 * goes only when the row really gave up on it.
 */
async function resolvePendingAbandon(rec: PendingAbandon): Promise<void> {
  if (abandonsInFlight.has(rec.videoId)) return;
  abandonsInFlight.add(rec.videoId);
  try {
    const res = await abandonMatchVideoRow(rec.videoId);
    if (!res) return;
    if (rec.phase === "row" && res.abandoned) await removeUploadedObject(rec.storagePath);
    await removePendingAbandon(rec.videoId);
  } finally {
    abandonsInFlight.delete(rec.videoId);
  }
}

/**
 * A RETRIED abandon first checks the row still points at the saved key
 * (review R2-m1): a newer recording on the same match may have re-pathed
 * that row to its own reservation since, and abandoning by id would fail
 * the NEW upload. A moved or vanished row drops the record; an unreadable
 * one keeps it for the next sweep.
 */
async function retryPendingAbandon(rec: PendingAbandon): Promise<void> {
  if (abandonsInFlight.has(rec.videoId)) return;
  const key = await readMatchVideoKey(rec.videoId);
  if (key === undefined) return;
  if (key === null || key !== rec.storagePath) {
    console.warn(`[video] pending abandon of ${rec.videoId} skipped: the row ${key === null ? "is gone" : "moved to another recording"}`);
    await removePendingAbandon(rec.videoId);
    return;
  }
  await resolvePendingAbandon(rec);
}

/** Retry this athlete's unanswered abandons (fire and forget, from the resume sweep). */
async function retryPendingAbandons(): Promise<void> {
  const mine = owner;
  if (!mine) return;
  for (const rec of await loadPendingAbandons()) {
    if (rec.uploaderAthleteId !== mine) continue;
    if (Date.now() - rec.createdAt > UPLOAD_JOB_MAX_AGE_MS) {
      // The server's reaper has failed the row by now.
      await removePendingAbandon(rec.videoId);
      continue;
    }
    void retryPendingAbandon(rec);
  }
}

function cancelPendingRetry(matchId: string): void {
  const entry = retryTimers.get(matchId);
  if (entry?.timer) clearTimeout(entry.timer);
  if (entry) entry.timer = null;
}

function clearRetryTimer(matchId: string): void {
  const entry = retryTimers.get(matchId);
  if (entry?.timer) clearTimeout(entry.timer);
  retryTimers.delete(matchId);
}

function clearAllRetryTimers(): void {
  for (const matchId of [...retryTimers.keys()]) clearRetryTimer(matchId);
}

/**
 * Re-run a PAUSED job later while the app stays in the foreground. Each
 * consecutive park doubles the wait up to FOREGROUND_RETRY_MAX_MS; a run
 * that lands, fails for good, is discarded or is superseded clears it.
 * Never armed in the background: iOS would not run it, and the foreground
 * transition resumes every job on its own.
 */
function scheduleForegroundRetry(matchId: string): void {
  if (AppState.currentState !== "active") return;
  const prev = retryTimers.get(matchId);
  if (prev?.timer) clearTimeout(prev.timer);
  const delayMs = prev ? Math.min(prev.delayMs * 2, FOREGROUND_RETRY_MAX_MS) : FOREGROUND_RETRY_BASE_MS;
  const timer = setTimeout(() => {
    const entry = retryTimers.get(matchId);
    // Keep the delay (the next park doubles it) but drop the fired handle.
    if (entry) entry.timer = null;
    void resumeOne(matchId);
  }, delayMs);
  retryTimers.set(matchId, { timer, delayMs });
}

/**
 * Stop a run without landing it: persist the failure, tell the store, and
 * either arm the foreground retry (paused) or wait for the athlete (failed).
 */
/** Causes where "Still can't upload. Check your connection." is the truth (R2-1). */
const RETRY_FAILED_AGAIN_CLASSES: ReadonlySet<UploadErrorClass> = new Set<UploadErrorClass>([
  "offline",
  "server",
  "unknown",
  "not_allowed",
]);

async function park(
  job: PendingUploadJob,
  failure: { klass: UploadErrorClass; status: number | null; raw: string | null },
  isCurrent: () => boolean,
  trigger: RunTrigger,
  phase: "reserve" | "bytes" | "row" = job.phase,
): Promise<UploadOutcome> {
  const { klass, status, raw } = failure;
  const copy = describeUploadFailure(klass);
  const failed = copy.disposition === "failed";
  // The run can lose its slot (sign-out, a newer recording) before or
  // during the persisted write. The job on disk is still this athlete's and
  // takes the patch; the store and the retry timer belong to whoever holds
  // the slot now (sign-out wiped the store for the next account), so a
  // stale run must not write them.
  const stale = (): UploadOutcome => {
    trackRunDropped(job.matchId, "lost its slot while parking");
    return { ok: false, error: copy.message, willRetryLater: false };
  };
  if (!isCurrent()) return stale();
  const saved = await patchUploadJob(job.matchId, { errorClass: klass, needsUser: failed });
  if (!isCurrent()) return stale();
  // Once on pause (jits-n2im.11): the server's in-flight window restarts from
  // the bytes it really has, so the opponent sees "paused", not a stale %.
  if (phase === "bytes") heartbeat(saved ?? job, (saved ?? job).bytesUploaded, true);
  // The athlete tapped Try again and it failed again in this same run: the
  // deck's "Still can't upload. Check your connection." (section 8), but
  // only for the causes that sentence is true of. Every other class (auth,
  // daily limit, uploads off, not in cohort, save failed, terminal ones)
  // keeps its own message, which says what is actually wrong.
  const message = trigger === "retry" && RETRY_FAILED_AGAIN_CLASSES.has(klass) ? RETRY_FAILED_AGAIN_COPY : copy.message;
  setMatchUpload(job.matchId, {
    status: failed ? "error" : "paused",
    error: message,
    errorClass: klass,
  });
  trackParked({ matchId: job.matchId, disposition: copy.disposition, klass, status, phase, raw });
  if (failed) clearRetryTimer(job.matchId);
  // A daily-limit gate does not lift in minutes: hitting it every two would
  // be noise. Foreground and reconnect still try it.
  else if (klass !== "limit") scheduleForegroundRetry(job.matchId);
  return { ok: false, error: message, willRetryLater: !failed };
}

/**
 * The athlete deleted the reserved video (minor 6): the row is never revived,
 * the clip is released, and nothing reaches the server.
 */
async function dropDeletedJob(job: PendingUploadJob): Promise<UploadOutcome> {
  console.warn(`[video] ${job.matchId}: the reserved video was deleted; dropping the upload`);
  captureException(new Error("Match-video upload dropped: its row was deleted"), { matchId: job.matchId });
  trackRunDropped(job.matchId, "row deleted");
  await removeUploadJob(job.matchId);
  releaseRecording(job.fileUri);
  clearRetryTimer(job.matchId);
  clearMatchUpload(job.matchId);
  return { ok: false, error: "The video was deleted.", willRetryLater: false };
}

async function runJob(
  job: PendingUploadJob,
  handle: RunnerHandle,
  trigger: RunTrigger,
): Promise<UploadOutcome> {
  const isCurrent = () => runners.get(job.matchId)?.generation === handle.generation;
  handle.storagePath = job.storagePath;

  trackRunStart({
    matchId: job.matchId,
    phase: job.phase,
    bytesUploaded: job.bytesUploaded,
    fileSizeBytes: job.fileSizeBytes,
    resumed: trigger !== "start",
    trigger,
  });
  setMatchUpload(job.matchId, {
    status: "uploading",
    storagePath: job.storagePath,
    error: null,
    errorClass: null,
    videoId: null,
    bytesTotal: job.fileSizeBytes,
    progress: job.phase === "row" ? 1 : ratio(job.bytesUploaded, job.fileSizeBytes),
    // Restored from the JOB, not assumed from the store. On a resume after
    // a process kill the store is empty, and a clip that stops before the
    // end of the match would otherwise land as a clean success: exactly
    // the silent data loss jits-2zpe was filed for.
    truncation: job.truncation,
  });

  let current = job;
  let videoId = "";
  // At most one restart: a reserved row found abandoned at land time is
  // re-keyed and re-uploaded once, never in a loop.
  for (let pass = 0; ; pass++) {
    if (isReserved(current) && current.phase === "bytes" && !current.videoId) {
      const reserved = await reserveRow(current, handle, isCurrent);
      if (!reserved.ok) {
        if (reserved.superseded || !isCurrent()) {
          trackRunDropped(current.matchId, "superseded");
          return { ok: false, error: reserved.error, willRetryLater: false };
        }
        if (reserved.dropped) return dropDeletedJob(current);
        // Nothing was sent: no object, no row. The job parks like any other
        // failure (a gate, the network) and the clip stays on the phone.
        const latest = (await loadUploadJob(current.matchId)) ?? current;
        return park(latest, { klass: reserved.klass, status: null, raw: reserved.error }, isCurrent, trigger, "reserve");
      }
      current = reserved.job;
      if (isCurrent()) {
        setMatchUpload(current.matchId, {
          storagePath: current.storagePath,
          progress: reserved.landed ? 1 : ratio(current.bytesUploaded, current.fileSizeBytes),
        });
      }
    }

    if (current.phase === "bytes") {
      const bytes = await uploadBytes(current, handle, isCurrent);
      if (!bytes.ok) {
        if (bytes.superseded || !isCurrent()) {
          trackRunDropped(current.matchId, "superseded");
          return { ok: false, error: bytes.error, willRetryLater: false };
        }
        if (bytes.fileMissing) {
          // The ONLY terminal case that also drops the job. There is no clip
          // left to keep and no object in the bucket, so nothing to park.
          await abandonJob(current, `the recording file is gone: ${bytes.error}`);
          const copy = describeUploadFailure("file_missing");
          // Same guard as `park`: a run that lost its slot during the abandon
          // must not write the store the new owner (or nobody) now holds.
          if (isCurrent()) {
            setMatchUpload(current.matchId, { status: "error", error: copy.message, errorClass: "file_missing" });
          }
          return { ok: false, error: copy.message, willRetryLater: false };
        }
        // NOTHING ELSE ABANDONS, INCLUDING A NON-RETRYABLE FAILURE. This used
        // to call `abandonJob`, which deletes the local clip, so a single 403
        // destroyed an irreplaceable 600 MB recording with no user choice on
        // the strength of one request. A 403 can be transient (a token edge, a
        // `match_participants` row not yet visible). Such a failure is now
        // FAILED (jits-n2im.3/.5): kept on disk, no automatic retries, and
        // the athlete gets Retry. The retention window, not one response,
        // decides to give up.
        return park(current, { klass: bytes.klass, status: bytes.status, raw: bytes.error }, isCurrent, trigger);
      }
      current = bytes.job;
    }


    if (isReserved(current) && current.videoId) {
      const landed = await finalizeRow(current, handle, isCurrent);
      if (!isCurrent()) {
        // M1: never delete here. The row is (or may be) live on this key
        // until the newer recording's reservation re-paths it, which then
        // deletes this key itself (`previousStoragePath`).
        trackRunDropped(current.matchId, "superseded");
        return { ok: false, error: "Superseded by a newer recording", willRetryLater: false };
      }
      if (!landed.ok && landed.dropped) return dropDeletedJob(current);
      if (landed.ok) {
        videoId = landed.videoId;
        break;
      }
      if (landed.moved) {
        // Another recording of this athlete (another device) now owns the
        // row. This clip can no longer attach to the match: drop the job,
        // and its object, which nothing references any more.
        captureException(new Error("Match-video row was re-pathed by another recording"), {
          matchId: current.matchId,
          storagePath: current.storagePath,
        });
        trackRunDropped(current.matchId, "row moved to another recording");
        await removeUploadedObject(current.storagePath);
        await removeUploadJob(current.matchId);
        releaseRecording(current.fileUri);
        clearRetryTimer(current.matchId);
        clearMatchUpload(current.matchId);
        return { ok: false, error: landed.error, willRetryLater: false };
      }
      if (landed.abandoned && pass === 0) {
        // The row gave up on these bytes (abandoned, e.g. by the reaper):
        // a status PATCH cannot revive it, a new key can. The old object is
        // now unreferenced.
        console.warn(`[video] reserved row for ${current.matchId} was abandoned; re-uploading under a new key`);
        const orphan = current.storagePath;
        const reset: JobPatch = { phase: "bytes", videoId: null, attempt: 0 };
        current = (await patchUploadJob(current.matchId, reset)) ?? { ...current, ...reset };
        current = await rekeyJob(current, handle, isCurrent);
        void removeUploadedObject(orphan);
        continue;
      }
      return park(current, { klass: landed.klass, status: null, raw: landed.error }, isCurrent, trigger);
    }

    const row = await writeRow(current, handle, isCurrent);
    // The row write awaits, so the slot can change under it. Settling a
    // superseded run here would delete the NEW job record and the NEW clip.
    if (!isCurrent()) {
      // M1: the row now references this key, and the newer recording's
      // write may never move it off (offline, the re-slice ceiling, a
      // Discard). Deleting would leave a live row on a missing object; a
      // leaked object is the recoverable failure. Only a write that did NOT
      // land leaves an object nothing references.
      if (!row.ok) await discardSupersededObject(current.matchId, current.storagePath);
      trackRunDropped(current.matchId, "superseded");
      return { ok: false, error: "Superseded by a newer recording", willRetryLater: false };
    }
    if (!row.ok) return park(current, { klass: row.klass, status: null, raw: row.error }, isCurrent, trigger);
    videoId = row.videoId;
    break;
  }

  await removeUploadJob(current.matchId);
  releaseRecording(current.fileUri);
  clearRetryTimer(current.matchId);
  if (current.videoId) lastHeartbeatAt.delete(current.videoId);
  setMatchUpload(current.matchId, {
    status: "uploaded",
    videoId,
    error: null,
    errorClass: null,
    progress: 1,
  });
  void trackUploaded({
    matchId: current.matchId,
    fileSizeBytes: current.fileSizeBytes,
    createdAt: current.createdAt,
  });
  return { ok: true, videoId };
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
      // in dev and be invisible in production. The job is still on disk,
      // so it reads as paused and the next trigger picks it up.
      const message = messageOf(err);
      console.warn(`[video] upload runner crashed for ${matchId}: ${message}`);
      captureException(err, { matchId });
      trackRunDropped(matchId, "crashed");
      const copy = describeUploadFailure("unknown");
      if (runners.get(matchId)?.generation === handle.generation) {
        setMatchUpload(matchId, { status: "paused", error: copy.message, errorClass: "unknown" });
      }
      return { ok: false, error: copy.message, willRetryLater: true };
    })
    .finally(() => {
      if (runners.get(matchId)?.generation === handle.generation) {
        runners.delete(matchId);
        emitActivity();
      }
    });
  return handle.promise;
}

/** Claim the slot and run a persisted job on it. */
function launch(job: PendingUploadJob, trigger: RunTrigger): Promise<UploadOutcome> {
  const handle = claimRunner(job.matchId, job.storagePath);
  return attachRun(job.matchId, handle, () => runJob(job, handle, trigger));
}

/**
 * Show a FAILED job that is not running (after a relaunch the store is
 * empty), so every surface still says it needs the athlete.
 */
function surfaceFailedJob(job: PendingUploadJob): void {
  const existing = getMatchUpload(job.matchId);
  if (existing?.status === "error") return;
  const klass = job.errorClass ?? "unknown";
  setMatchUpload(job.matchId, {
    status: "error",
    error: describeUploadFailure(klass).message,
    errorClass: klass,
    storagePath: job.storagePath,
    truncation: job.truncation,
    bytesTotal: job.fileSizeBytes,
    progress: job.phase === "row" ? 1 : ratio(job.bytesUploaded, job.fileSizeBytes),
    videoId: null,
  });
}

/**
 * Expire a job past the retention window. Claimed synchronously (see
 * `abandonClaims`). Another athlete's job is only cleaned up LOCALLY: its
 * bucket object can only be deleted by its owner's session, and trying
 * under this one is a guaranteed silent RLS denial.
 */
async function expireJob(job: PendingUploadJob, ownJob: boolean): Promise<void> {
  const claim = `${job.matchId}:${job.createdAt}`;
  if (abandonClaims.has(claim)) return;
  abandonClaims.add(claim);
  if (ownJob) {
    await abandonJob(job, "job older than the retention window");
    return;
  }
  console.warn(`[video] dropping another athlete's expired upload for ${job.matchId}`);
  await removeUploadJob(job.matchId);
  releaseRecording(job.fileUri);
}

/**
 * What a sweep does with one persisted job. Synchronous up to the launch,
 * so the `runners.has` check and the claim are one unit.
 */
function sweepJob(job: PendingUploadJob): Promise<void> | null {
  // The runner check comes FIRST, including before expiry. A job created
  // just under the window can be launched and still be transferring when
  // a sweep crosses it, and `abandonJob` deletes the local clip: expiring
  // it there would pull the file out from under a live upload.
  if (runners.has(job.matchId)) return null;
  const mine = owner != null && job.uploaderAthleteId === owner;
  if (isJobExpired(job)) return expireJob(job, mine);
  // Another athlete's job never runs under this session (jits-n2im.6). It
  // stays on disk and resumes when that athlete signs back in.
  if (!mine) return null;
  if (job.needsUser) {
    surfaceFailedJob(job);
    return null;
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
  void launch({ ...job, attempt: 0 }, "resume");
  return null;
}

/** Resume one persisted job if it is still owed and runnable. */
async function resumeOne(matchId: string): Promise<void> {
  if (!owner || runners.has(matchId)) return;
  const job = await loadUploadJob(matchId);
  if (!job) {
    clearRetryTimer(matchId);
    return;
  }
  await sweepJob(job);
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
    const copy = describeUploadFailure("file_missing");
    setMatchUpload(matchId, {
      status: "error",
      error: copy.message,
      errorClass: "file_missing",
      storagePath: params.storagePath,
    });
    return { ok: false, error: copy.message, willRetryLater: false };
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
    errorClass: null,
    needsUser: false,
    // Reserve before bytes (jits-n2im.11). Saved BEFORE the reservation, so
    // a kill at any point after this finds the clip and resumes it.
    protocol: 2,
    videoId: null,
    recordStartedAt:
      params.recordStartedAt != null && Number.isFinite(params.recordStartedAt)
        ? new Date(params.recordStartedAt).toISOString()
        : null,
    recordDurationMs:
      params.recordDurationMs != null && Number.isFinite(params.recordDurationMs) && params.recordDurationMs > 0
        ? Math.round(params.recordDurationMs)
        : null,
  };
  await saveUploadJob(job);
  if (!isCurrent()) {
    return { ok: false, error: "Superseded by a newer recording", willRetryLater: false };
  }
  return runJob(job, handle, "start");
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
 * Resume every persisted job of the signed-in athlete that is not already
 * running and is not waiting on the athlete. Safe to call repeatedly, and
 * safe to call CONCURRENTLY: the `runners.has` check and the `launch` that
 * follows it are one synchronous unit (`sweepJob`), so two sweeps racing
 * on the same foreground cannot both start the same job, and an expired
 * job is claimed before its abandon awaits anything.
 *
 * Does nothing while nobody is signed in (`setUploadOwner(null)`).
 */
export async function resumeMatchVideoUploads(): Promise<void> {
  ensureUploadListeners();
  if (!owner) return;
  void retryPendingAbandons();
  const jobs = await loadUploadJobs();
  for (const job of jobs) {
    const pending = sweepJob(job);
    if (pending) await pending;
  }
}

/** Why a Try again did or did not start a run (each gets its own message, m8). */
export type RetryResult = "started" | "running" | "no_job" | "signed_out" | "other_athlete";

/**
 * The athlete's Try again (jits-n2im.3): run a parked or failed job NOW,
 * with a fresh attempt budget, whatever it is waiting for. Clears the
 * "needs the athlete" mark so later automatic triggers pick it up again if
 * it parks. A job already uploading is left alone ("running"): a no-op,
 * not a restart.
 */
export async function retryMatchVideoUpload(matchId: string): Promise<RetryResult> {
  if (runners.has(matchId)) return "running";
  if (!owner) return "signed_out";
  const job = await loadUploadJob(matchId);
  if (!job) return "no_job";
  if (job.uploaderAthleteId !== owner) return "other_athlete";
  // Re-checked after the await: a resume can have claimed it meanwhile.
  if (runners.has(matchId)) return "running";
  const fresh: PendingUploadJob = { ...job, attempt: 0, needsUser: false };
  // `launch` claims synchronously; the persisted reset queues behind no
  // runner write because the runner's first write comes after an await.
  void patchUploadJob(matchId, { attempt: 0, needsUser: false });
  void launch(fresh, "retry");
  return "started";
}

/**
 * The athlete's Discard, for a failure a retry cannot fix (jits-n2im.5):
 * stop any runner, delete the job, the local clip and (row phase) the
 * uploaded object, and forget the match's upload entry. Resolves false
 * when there was no job to discard.
 */
export async function discardMatchVideoUpload(matchId: string): Promise<boolean> {
  // Refused while a run is live (m2). Discard is only offered on a settled
  // terminal failure, so a live run means the athlete also tapped Try again;
  // stopping it mid row write could leave a `ready` row pointing at the
  // object this deletes. Let the run settle first.
  if (runners.has(matchId)) return false;
  clearRetryTimer(matchId);
  const job = await loadUploadJob(matchId);
  clearMatchUpload(matchId);
  if (!job) return false;
  // This phone recorded and dropped the clip: remembered across restarts so
  // the Film status keeps this phone's own copy (jits-n2im.25).
  void markDiscardedHere(job.uploaderAthleteId, matchId);
  await abandonJob(job, "discarded by the athlete");
  return true;
}

/**
 * Sign-out (jits-n2im.6): stop every runner without touching its job (the
 * server keeps each tus offset, so the same athlete resumes where it left
 * off), cancel the foreground retries, scope resumes to nobody, and wipe
 * the upload store, whose entries describe the athlete who is leaving.
 */
export function stopMatchVideoUploadsForSignOut(): void {
  owner = null;
  for (const [matchId, handle] of runners) {
    handle.abort?.();
    requestWake(handle);
    trackRunDropped(matchId, "signed out");
  }
  const hadRunners = runners.size > 0;
  // Clearing the map makes every loop's `isCurrent()` false, so each one
  // stops at its next check without writing the job, the store or the row.
  runners.clear();
  if (hadRunners) emitActivity();
  clearAllRetryTimers();
  resetMatchUploadStore();
}

/** Cut short any pending backoff sleep, e.g. the network just came back. */
export function wakeMatchVideoUploads(): void {
  for (const handle of runners.values()) requestWake(handle);
}

/** True while at least one upload loop is alive. */
export function hasActiveVideoUploads(): boolean {
  return runners.size > 0;
}

/**
 * True when the signed-in athlete still owes the server a video: a live
 * runner, or any persisted job of theirs (paused or failed). The sign-out
 * guard asks this.
 */
export async function hasPendingVideoUploads(): Promise<boolean> {
  if (runners.size > 0) return true;
  // Nobody scoped yet: nothing of the signed-in athlete is known to be owed.
  if (owner == null) return false;
  const jobs = await loadUploadJobs();
  // Only this athlete's jobs that can still finish (m7): a terminal failure
  // will not "finish the next time you sign in", so it does not count.
  return jobs.some(
    (job) => job.uploaderAthleteId === owner && !(job.needsUser && isTerminalUploadClass(job.errorClass)),
  );
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
    if (next === "background") {
      // iOS would not fire them, and the return to the foreground resumes
      // every job anyway (below).
      clearAllRetryTimers();
      return;
    }
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
  owner = null;
  clearAllRetryTimers();
  abandonClaims.clear();
  lastHeartbeatAt.clear();
  abandonsInFlight.clear();
  activityListeners.clear();
  unbindListeners?.();
  listenersBound = false;
  unbindListeners = null;
}

// Registered at load so UI and auth code can reach these through the light
// `upload-control.ts` without importing this module's graph.
registerUploadControl({
  retry: retryMatchVideoUpload,
  discard: discardMatchVideoUpload,
  hasPending: hasPendingVideoUploads,
  stopForSignOut: stopMatchVideoUploadsForSignOut,
});

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { RecordingTruncation } from "./use-video-recorder";

/**
 * Disk-backed record of a match-video upload that has not finished yet
 * (jits-341p).
 *
 * WHY THIS EXISTS AT ALL. Everything about the upload used to live in the JS
 * context: the file URI in a local variable inside `useVideoRecorder`, the
 * outcome in an in-memory Map. Backgrounding the app suspends the upload and
 * iOS eventually kills the process; the next launch had no way to find the
 * clip on disk, so a 10-minute match recording was simply gone. At the sizes
 * this product is moving to (up to 10 minutes, 300-600 MB) a single subway
 * ride is enough to lose a match permanently.
 *
 * ONE RECORD PER MATCH. `match_videos` has a `uq_match_video_uploader`
 * unique constraint, so one athlete has at most one video per match; keying
 * on `matchId` therefore cannot collide, and a second recording attempt on
 * the same match legitimately REPLACES the first (see
 * `beginMatchUploadAttempt` in ./match-upload-store).
 *
 * ONE KEY PER RECORD, not one JSON blob for all of them: progress writes and
 * the resume sweep can interleave, and a read-modify-write over a shared blob
 * would let one of them clobber the other's job.
 */

/** AsyncStorage key namespace. Exported for the tests and the sweep. */
export const UPLOAD_JOB_PREFIX = "elo-video-upload::";

/**
 * How far the job has got. The split matters because the two halves have
 * completely different costs: re-uploading bytes is minutes and hundreds of
 * megabytes, re-writing the row is one INSERT.
 *
 *   bytes : the storage object is not fully written yet.
 *   row   : every byte is in the bucket; only the `match_videos` write is
 *           left. A job in this phase must NEVER re-upload.
 */
export type UploadJobPhase = "bytes" | "row";

export interface PendingUploadJob {
  matchId: string;
  uploaderAthleteId: string;
  /** Local `file://` URI of the clip. See `retainRecording` for its lifetime. */
  fileUri: string;
  /** Canonical storage key. Stable across attempts by contract (jits-voh). */
  storagePath: string;
  /** Extension driving the content type (`mp4` on native). */
  ext: string;
  /** Byte size at enqueue time. tus needs an exact `uploadSize`. */
  fileSizeBytes: number;
  /** tus upload URL once the creation POST has returned one. */
  uploadUrl: string | null;
  /** Server-confirmed offset, for reporting progress before the first PATCH. */
  bytesUploaded: number;
  phase: UploadJobPhase;
  /** Failed attempts so far. Drives the backoff exponent across restarts. */
  attempt: number;
  /** Carried so a resumed upload can still warn about a short clip. */
  truncation: RecordingTruncation | null;
  createdAt: number;
  updatedAt: number;
  lastError: string | null;
}

/**
 * Jobs older than this are abandoned by the sweep. A week is far longer than
 * any plausible "I was on a plane" gap, and the recording file would have to
 * survive that long too.
 */
export const UPLOAD_JOB_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Per-match write serialisation.
 *
 * Several writers touch one job concurrently: the progress callback (fire
 * and forget, every few seconds), the upload-URL callback (fire and forget,
 * once), and the attempt/phase writes in the retry loop. `patchUploadJob`
 * is a read-modify-write, so two of them interleaving means the later read
 * sees the earlier writer's PRE-state and its write silently reverts it.
 *
 * That is not theoretical: it dropped the tus upload URL. The URL callback
 * and the failure handler fired in the same tick, the failure handler read
 * first, and the retry resumed with `uploadUrl: null`, re-uploading the
 * whole clip from zero. Chaining every write for a match behind the
 * previous one makes each read-modify-write atomic with respect to the
 * others.
 */
const writeChains = new Map<string, Promise<unknown>>();

function serialize<T>(matchId: string, fn: () => Promise<T>): Promise<T> {
  const previous = writeChains.get(matchId) ?? Promise.resolve();
  const next = previous.then(fn, fn);
  // The stored link must never reject, or every later write on this match
  // would inherit the rejection.
  writeChains.set(
    matchId,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
}

function keyFor(matchId: string): string {
  return `${UPLOAD_JOB_PREFIX}${matchId}`;
}

/**
 * Structural validation on read. A record written by an older build (or a
 * half-written one) must be discarded rather than fed to the upload loop,
 * where a missing `storagePath` would mint a fresh key and strand the bytes
 * already in the bucket.
 */
function isValidJob(value: unknown): value is PendingUploadJob {
  if (typeof value !== "object" || value === null) return false;
  const j = value as Record<string, unknown>;
  return (
    typeof j.matchId === "string" &&
    typeof j.uploaderAthleteId === "string" &&
    typeof j.fileUri === "string" &&
    typeof j.storagePath === "string" &&
    typeof j.ext === "string" &&
    typeof j.fileSizeBytes === "number" &&
    j.fileSizeBytes > 0 &&
    (j.phase === "bytes" || j.phase === "row") &&
    typeof j.attempt === "number" &&
    typeof j.createdAt === "number"
  );
}

/** Read a record with no serialisation. Callers hold the chain already. */
async function readRaw(matchId: string): Promise<PendingUploadJob | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(matchId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (isValidJob(parsed)) return parsed;
    await AsyncStorage.removeItem(keyFor(matchId));
    return null;
  } catch {
    // Unparseable: drop it rather than re-scanning it on every resume for
    // the rest of the retention window.
    try {
      await AsyncStorage.removeItem(keyFor(matchId));
    } catch {
      /* nothing else to try */
    }
    return null;
  }
}

/** Write a record with no serialisation. Callers hold the chain already. */
async function writeRaw(job: PendingUploadJob): Promise<void> {
  try {
    await AsyncStorage.setItem(
      keyFor(job.matchId),
      JSON.stringify({ ...job, updatedAt: Date.now() }),
    );
  } catch (err) {
    // Persistence is a resilience feature, not a precondition: an upload
    // that cannot be recorded still runs, it just cannot survive a kill.
    console.warn(`[video] could not persist upload job for ${job.matchId}:`, err);
  }
}

export async function saveUploadJob(job: PendingUploadJob): Promise<void> {
  await serialize(job.matchId, () => writeRaw(job));
}

export async function loadUploadJob(matchId: string): Promise<PendingUploadJob | null> {
  return serialize(matchId, () => readRaw(matchId));
}

/** Every persisted job, oldest first, with malformed records dropped. */
export async function loadUploadJobs(): Promise<PendingUploadJob[]> {
  let keys: readonly string[];
  try {
    keys = await AsyncStorage.getAllKeys();
  } catch {
    return [];
  }
  const matchIds = keys
    .filter((k) => k.startsWith(UPLOAD_JOB_PREFIX))
    .map((k) => k.slice(UPLOAD_JOB_PREFIX.length));
  const jobs: PendingUploadJob[] = [];
  for (const matchId of matchIds) {
    const job = await loadUploadJob(matchId);
    if (job) jobs.push(job);
  }
  return jobs.sort((a, b) => a.createdAt - b.createdAt);
}

export async function removeUploadJob(matchId: string): Promise<void> {
  await serialize(matchId, async () => {
    try {
      await AsyncStorage.removeItem(keyFor(matchId));
    } catch {
      // A stale record is swept by age; failing to remove one is not worth
      // surfacing over the upload's own outcome.
    }
  });
}

/**
 * Merge `patch` into the stored job, as one atomic read-modify-write.
 *
 * Reads the CURRENT record rather than patching the caller's copy, so a
 * progress write issued from a long-running attempt cannot resurrect fields
 * (a stale `uploadUrl`, a lower `attempt`) that a later writer has changed.
 * The read AND the write are inside the serialisation chain, so two patches
 * landing in the same tick apply in order instead of one reverting the
 * other; see `serialize` for the bug that caused.
 */
export async function patchUploadJob(
  matchId: string,
  patch: Partial<Omit<PendingUploadJob, "matchId">>,
): Promise<PendingUploadJob | null> {
  return serialize(matchId, async () => {
    const current = await readRaw(matchId);
    if (!current) return null;
    const next: PendingUploadJob = { ...current, ...patch, matchId, updatedAt: Date.now() };
    await writeRaw(next);
    return next;
  });
}

/** True when the job is old enough that nothing is going to rescue it. */
export function isJobExpired(job: PendingUploadJob, now = Date.now()): boolean {
  return now - job.createdAt > UPLOAD_JOB_MAX_AGE_MS;
}

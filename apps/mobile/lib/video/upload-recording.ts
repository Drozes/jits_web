import * as FileSystem from "expo-file-system/legacy";
import { Upload } from "tus-js-client/lib.es5/browser/index.js";
import { supabase } from "@/lib/supabase/client";
import { env } from "@/lib/env";
import { captureException } from "@/lib/error-tracking/sentry";
import {
  buildMatchVideoStoragePath,
  upsertMatchVideo,
} from "@jits/shared/api/mutations";
import {
  AsyncStorageUrlStorage,
  ExpoFileReader,
  type TusFileInput,
} from "./tus-rn-shims";

/**
 * Bucket + path convention per BE contract
 * (jr_be `specs/013-chunked-video-pipeline/INTEGRATION.md` §1.2):
 *
 *   bucket: "match-videos"
 *   path:   `<match_id>/<uploader_athlete_id>/<unix_ts>.<ext>`
 *
 * Web records WebM via `MediaRecorder`; native expo-camera produces MP4
 * (H.264/AAC) on both iOS and Android, so the extension differs.
 */
export const VIDEO_BUCKET = "match-videos";

/**
 * Supabase Storage's resumable (tus) endpoint requires EXACTLY 6 MiB chunks
 * for every PATCH but the last. This is not a tuning knob: a different size
 * is rejected by the server. See Supabase Storage docs, "Resumable Upload".
 */
export const SUPABASE_TUS_CHUNK_SIZE = 6 * 1024 * 1024;

/** 2 GiB client-side cap per BE contract §8.5. */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;

/**
 * Build the canonical storage key inside the `match-videos` bucket.
 * Thin wrapper around the shared helper that defaults to `mp4` for the
 * mobile expo-camera recording.
 */
export function buildVideoPath(
  matchId: string,
  uploaderAthleteId: string,
  ext = "mp4",
): string {
  return buildMatchVideoStoragePath(matchId, uploaderAthleteId, ext);
}

export function contentTypeFor(ext: string): string {
  return ext === "mp4" ? "video/mp4" : "application/octet-stream";
}

/**
 * The storage write succeeded but the `match_videos` DB write failed.
 * `storageObjectPersisted` tells the caller whether the uploaded object
 * is still in the bucket and therefore needs cleanup if the row can never
 * be written.
 */
export class MatchVideoDbError extends Error {
  /** Object key inside `match-videos` that was written before the DB failure. */
  readonly path: string;
  /** True when the object is still in the bucket. */
  readonly storageObjectPersisted: boolean;

  constructor(message: string, path: string, storageObjectPersisted: boolean) {
    super(message);
    this.name = "MatchVideoDbError";
    this.path = path;
    this.storageObjectPersisted = storageObjectPersisted;
  }
}

/**
 * Best-effort removal of an uploaded object that has no `match_videos`
 * row (orphan compensation). The response is inspected because under
 * storage RLS a denied DELETE resolves 200 with `{ data: [] }` and NO
 * error, so success requires exactly one removed object. A failed cleanup
 * is reported (Sentry + console.warn, matching the codebase's best-effort
 * logging pattern) but never thrown, so it can never mask the original
 * upload/DB error.
 *
 * DELIBERATELY RARE NOW. This used to run on the first transient DB
 * failure, which deleted a 600 MB object that had just uploaded
 * successfully and forced the retry to send it all again. The bytes are
 * the expensive, irreplaceable half of this operation; the row is one
 * INSERT. Compensation is now only reached when a job is ABANDONED
 * (`video-upload-manager.ts`), never between retries.
 */
export async function removeUploadedObject(path: string): Promise<void> {
  try {
    const { data, error } = await supabase.storage.from(VIDEO_BUCKET).remove([path]);
    if (error || data?.length !== 1) {
      const detail = error?.message ?? `removed ${data?.length ?? 0} objects (silent RLS denial?)`;
      console.warn(`[video] orphan cleanup failed for ${path}: ${detail}`);
      captureException(new Error(`Match-video orphan cleanup failed: ${detail}`), { path });
    }
  } catch (err) {
    console.warn(`[video] orphan cleanup failed for ${path}:`, err);
    captureException(err, { path });
  }
}

/** Byte size of a local recording, or null when it cannot be read. */
export async function getRecordingSize(fileUri: string): Promise<number | null> {
  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    if (info.exists && typeof info.size === "number") return info.size;
  } catch {
    // Treated as "unknown", not as "missing": the caller decides.
  }
  return null;
}

// ---------------------------------------------------------------------------
// Resumable (tus) storage upload
// ---------------------------------------------------------------------------

// Retry classification is shared with apps/web (both upload over tus and
// must treat the same status the same way). Re-exported here because this
// module is the mobile upload path's public face.
export {
  classifyUploadError,
  statusOfUploadError,
  type UploadFailureClass,
} from "@jits/shared/utils";

export interface ResumableUploadOptions {
  /** Local `file://` URI of the clip. */
  fileUri: string;
  /** Exact byte size. tus needs it up front for `Upload-Length`. */
  fileSizeBytes: number;
  /** Canonical object key inside `match-videos`. Stable across attempts. */
  storagePath: string;
  /** Extension, driving the stored content type. */
  ext: string;
  /** A tus upload URL from an earlier attempt, to resume rather than restart. */
  uploadUrl?: string | null;
  /** Server-confirmed bytes. Called on creation and after every PATCH. */
  onProgress?: (bytesUploaded: number, bytesTotal: number) => void;
  /** Called once the creation POST yields a URL, so it can be persisted. */
  onUploadUrl?: (uploadUrl: string) => void;
  /**
   * Receives an abort function for the in-flight upload, so a superseding
   * recording on the same match can cut this one short.
   */
  onAbortHandle?: (abort: () => void) => void;
}

/**
 * Upload a local recording to Supabase Storage over tus, resuming from
 * `uploadUrl` when one is supplied.
 *
 * Replaces a single `FileSystem.uploadAsync(BINARY_CONTENT)` POST of the
 * whole file, which was non-resumable (a drop at 99% discarded every byte)
 * and emitted no progress events at all.
 *
 * tus's OWN retry machinery is disabled (`retryDelays: null`). There is
 * exactly one retry authority, `video-upload-manager.ts`, because only it
 * can persist the attempt across a process kill and apply jittered backoff;
 * two independent retry loops would multiply their attempt counts together
 * and make the observed behaviour impossible to reason about.
 *
 * The access token is resolved per call, not per recording: a clip resumed
 * hours later must not present the JWT that was current when it was shot.
 */
export async function uploadFileResumable({
  fileUri,
  fileSizeBytes,
  storagePath,
  ext,
  uploadUrl,
  onProgress,
  onUploadUrl,
  onAbortHandle,
}: ResumableUploadOptions): Promise<void> {
  if (fileSizeBytes > MAX_UPLOAD_BYTES) throw new Error("Videos must be under 2 GB.");

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("Not signed in");

  const endpoint = `${env.supabaseUrl}/storage/v1/upload/resumable`;
  const file: TusFileInput = { uri: fileUri, size: fileSizeBytes };

  // tus closes the file source only on its SUCCESS paths, and `abort()`
  // deliberately does not, so a failed or aborted attempt would leak the
  // native handle. We hold a reference and close it ourselves below.
  // A holder rather than a bare `let`: the only writer is a callback, and
  // TypeScript's control-flow analysis narrows an unassigned `let` to
  // `never` at the `finally`.
  const opened: { source: { close: () => void } | null } = { source: null };
  try {
    await runTusUpload();
  } finally {
    opened.source?.close();
  }

  function runTusUpload(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const upload = new Upload(file as unknown as File, {
        endpoint,
        uploadUrl: uploadUrl ?? undefined,
        // Supabase mandates 6 MiB. See SUPABASE_TUS_CHUNK_SIZE.
        chunkSize: SUPABASE_TUS_CHUNK_SIZE,
        uploadSize: fileSizeBytes,
        retryDelays: null,
        onShouldRetry: () => false,
        headers: {
          authorization: `Bearer ${accessToken}`,
          apikey: env.supabaseAnonKey,
          // Preserved from the old single-shot path: a retry re-PUTs the same
          // key, and the backend keeps a storage UPDATE policy specifically
          // for that.
          "x-upsert": "true",
        },
        metadata: {
          bucketName: VIDEO_BUCKET,
          objectName: storagePath,
          contentType: contentTypeFor(ext),
          cacheControl: "3600",
        },
        // The creation POST carries no bytes, so the upload URL is known (and
        // can be persisted) before the first 6 MiB leaves the device.
        uploadDataDuringCreation: false,
        storeFingerprintForResuming: true,
        removeFingerprintOnSuccess: true,
        // Deterministic and derived from the object key, so the same clip
        // fingerprints identically across process restarts. tus's default
        // fingerprint reads `File` fields our input does not have.
        fingerprint: async () => `elo-match-video::${storagePath}`,
        urlStorage: new AsyncStorageUrlStorage(),
        fileReader: new ExpoFileReader((source) => {
          opened.source = source;
        }),
        onUploadUrlAvailable: () => {
          if (upload.url) onUploadUrl?.(upload.url);
        },
        onProgress: (sent, total) => onProgress?.(sent, total),
        onSuccess: () => resolve(),
        onError: (err) => reject(err),
      });

      onAbortHandle?.(() => {
        // `false` keeps the partial upload on the server so a later attempt
        // can still resume it; terminating would throw away real bytes.
        void upload.abort(false).catch(() => undefined);
        // `abort()` leaves the promise pending forever, so the caller would
        // wait on a transfer nobody is driving. Settle it as a retryable
        // failure: the server keeps the offset, so the next attempt resumes.
        reject(new Error("Upload aborted"));
      });

      upload.start();
    });
  }
}

// ---------------------------------------------------------------------------
// match_videos row
// ---------------------------------------------------------------------------

export interface MatchVideoRowParams {
  matchId: string;
  uploaderAthleteId: string;
  storagePath: string;
  fileSizeBytes?: number;
}

/**
 * INSERT/UPSERT the parent `match_videos` row at `status='ready'` so the
 * slicer trigger fires. Returns the row id.
 *
 * Throws `MatchVideoDbError` with `storageObjectPersisted: true` on failure:
 * the caller decides whether to retry (it should) or compensate (only when
 * abandoning the job outright).
 */
export async function writeMatchVideoRow({
  matchId,
  uploaderAthleteId,
  storagePath,
  fileSizeBytes,
}: MatchVideoRowParams): Promise<string> {
  const upserted = await upsertMatchVideo(supabase, {
    matchId,
    uploaderAthleteId,
    storagePath,
    fileSizeBytes,
    recordingType: "self",
    recordedBy: uploaderAthleteId,
  });
  if (!upserted.ok) {
    throw new MatchVideoDbError(
      `Video uploaded but saving the record failed: ${upserted.error.message}`,
      storagePath,
      true,
    );
  }
  return upserted.data.id;
}

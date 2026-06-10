import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "@/lib/supabase/client";
import { env } from "@/lib/env";
import { captureException } from "@/lib/error-tracking/sentry";
import {
  buildMatchVideoStoragePath,
  upsertMatchVideo,
} from "@jits/shared/api/mutations";

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

export interface UploadOptions {
  /** Local file:// URI returned by `cameraRef.current.recordAsync()`. */
  fileUri: string;
  /** Match ID -- used in the storage path. */
  matchId: string;
  /**
   * Uploading athlete's `athletes.id` (NOT auth_user_id). Required by
   * RLS `match_videos_insert_participant` policy.
   */
  uploaderAthleteId: string;
  /**
   * Pre-built storage key inside the bucket. Pass the SAME path on a
   * retry so the retry overwrites the half-written object from the
   * failed attempt instead of orphaning it at a stale path. Defaults to
   * a fresh `buildVideoPath()` key when omitted.
   */
  storagePath?: string;
  /**
   * Skip the orphan-compensation delete when the `match_videos` write
   * fails after a successful storage write. Set this on every attempt
   * EXCEPT the last one of a retry loop: deleting the object on a
   * transient DB failure would force the retry to re-upload the whole
   * file (up to 2 GB). The caller then owns final cleanup (see
   * `MatchVideoDbError.storageObjectPersisted` + `removeUploadedObject`).
   */
  skipCompensation?: boolean;
  /** Storage path file extension (default `mp4`). */
  ext?: string;
}

export interface UploadResult {
  /** Final storage path within the bucket. */
  path: string;
  /** HTTP status returned by Supabase Storage's REST endpoint. */
  status: number;
  /** `match_videos.id` from the INSERT/UPSERT that follows the storage PUT. */
  videoId: string;
}

/** 2 GiB client-side cap per BE contract §8.5. */
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;

/**
 * The storage write succeeded but the `match_videos` DB write failed.
 * `storageObjectPersisted` tells the caller whether the uploaded object
 * is still in the bucket (compensation was skipped via
 * `skipCompensation`) and therefore needs cleanup after the caller's
 * final retry attempt.
 */
export class MatchVideoDbError extends Error {
  /** Object key inside `match-videos` that was written before the DB failure. */
  readonly path: string;
  /** True when compensation was skipped and the object is still in the bucket. */
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
 * error — success therefore requires exactly one removed object. A
 * failed cleanup is reported (Sentry + console.warn, matching the
 * codebase's best-effort logging pattern) but never thrown, so it can
 * never mask the original upload/DB error.
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

/**
 * Streams the recording at `fileUri` straight to Supabase Storage's REST
 * endpoint via `FileSystem.uploadAsync`. Then INSERTs the parent
 * `match_videos` row at `status='ready'` so the slicer trigger fires.
 *
 * We stream rather than base64-load because match recordings can be
 * 50+ MB; reading the whole file into memory as a base64 string would
 * push past JS heap limits on lower-end Android devices.
 *
 * Streaming caveat: `FileSystem.uploadAsync` does not expose a
 * progress callback for `BINARY_CONTENT` uploads. Callers should treat
 * the returned promise as a single "uploading -> done" transition and
 * surface only start/end states to the user.
 */
export async function uploadRecording({ fileUri, matchId, uploaderAthleteId, storagePath, skipCompensation = false, ext = "mp4" }: UploadOptions): Promise<UploadResult> {
  const path = storagePath ?? buildVideoPath(matchId, uploaderAthleteId, ext);

  // Resolve the current access token so RLS policies on the bucket apply
  // to the authenticated athlete (mirrors the JS SDK's
  // `supabase.storage.from(...).upload(...)` flow but without buffering).
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("Not signed in");

  // Pre-flight size check. expo-file-system exposes file metadata; we
  // skip the request if the cap would obviously be exceeded.
  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    if (info.exists && typeof info.size === "number" && info.size > MAX_UPLOAD_BYTES) {
      throw new Error("Videos must be under 2 GB.");
    }
  } catch (err) {
    // Re-throw the size error; ignore any benign info-fetch failure.
    if (err instanceof Error && /under 2 GB/.test(err.message)) throw err;
  }

  const url = `${env.supabaseUrl}/storage/v1/object/${VIDEO_BUCKET}/${path}`;

  const result = await FileSystem.uploadAsync(url, fileUri, {
    httpMethod: "POST",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": ext === "mp4" ? "video/mp4" : "application/octet-stream",
      // Storage REST requires the apikey header even with a JWT.
      apikey: env.supabaseAnonKey,
      // Upsert so a retry against the SAME path overwrites the
      // half-written object from a failed earlier attempt instead of
      // failing 400 "resource already exists". (POST + x-upsert: true is
      // what the JS SDK's `.upload(path, body, { upsert: true })` sends.)
      "x-upsert": "true",
    },
  });

  if (result.status < 200 || result.status >= 300) {
    // Local Supabase caps `match-videos` at 500 MiB and returns 413.
    // Surface the local-dev caveat per BE §8.5.
    const isLocal = /127\.0\.0\.1|localhost/.test(env.supabaseUrl);
    if (isLocal && result.status === 413) {
      throw new Error("Local development cap is 500 MiB — production cap is 2 GiB. Use a shorter clip while testing.");
    }
    throw new Error(`Upload failed (${result.status}): ${result.body}`);
  }

  // Storage PUT succeeded — INSERT the parent row. Use upsert so retries
  // from a previous failure on the same match are race-safe.
  let fileSize: number | undefined;
  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    if (info.exists && typeof info.size === "number") fileSize = info.size;
  } catch { /* swallow */ }

  const upserted = await upsertMatchVideo(supabase, {
    matchId,
    uploaderAthleteId,
    storagePath: path,
    fileSizeBytes: fileSize,
    recordingType: "self",
    recordedBy: uploaderAthleteId,
  });

  if (!upserted.ok) {
    // Storage object landed but the DB row didn't: unless the caller is
    // managing compensation across retries (`skipCompensation`), remove
    // the object so it is never orphaned in the bucket with no
    // `match_videos` row. Best-effort with observability: a failed
    // cleanup is reported but never masks the real DB error.
    if (!skipCompensation) await removeUploadedObject(path);
    throw new MatchVideoDbError(
      `Video uploaded but saving the record failed: ${upserted.error.message}`,
      path,
      skipCompensation,
    );
  }

  return { path, status: result.status, videoId: upserted.data.id };
}

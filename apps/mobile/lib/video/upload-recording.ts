import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "@/lib/supabase/client";
import { env } from "@/lib/env";
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
export async function uploadRecording({ fileUri, matchId, uploaderAthleteId, ext = "mp4" }: UploadOptions): Promise<UploadResult> {
  const path = buildVideoPath(matchId, uploaderAthleteId, ext);

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
      // `x-upsert: false` is the default; spelled out for clarity.
      "x-upsert": "false",
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

  const { id } = await upsertMatchVideo(supabase, {
    matchId,
    uploaderAthleteId,
    storagePath: path,
    fileSizeBytes: fileSize,
    recordingType: "self",
    recordedBy: uploaderAthleteId,
  });

  return { path, status: result.status, videoId: id };
}

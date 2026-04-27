import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "@/lib/supabase/client";
import { env } from "@/lib/env";

/**
 * Bucket + path convention mirrors the web client (see
 * `apps/web/hooks/use-video-recorder.ts`):
 *
 *   bucket: "match-videos"
 *   path:   `matches/{matchId}/{timestamp}.{ext}`
 *
 * Web records WebM via `MediaRecorder`; native expo-camera produces MP4
 * (H.264/AAC) on both iOS and Android, so the extension differs.
 */
export const VIDEO_BUCKET = "match-videos";

export function buildVideoPath(matchId: string, ext = "mp4"): string {
  return `matches/${matchId}/${Date.now()}.${ext}`;
}

export interface UploadOptions {
  /** Local file:// URI returned by `cameraRef.current.recordAsync()`. */
  fileUri: string;
  /** Match ID -- used in the storage path. */
  matchId: string;
  /** Storage path file extension (default `mp4`). */
  ext?: string;
}

export interface UploadResult {
  /** Final storage path within the bucket. */
  path: string;
  /** HTTP status returned by Supabase Storage's REST endpoint. */
  status: number;
}

/**
 * Streams the recording at `fileUri` straight to Supabase Storage's REST
 * endpoint via `FileSystem.uploadAsync`. We chose this over base64-loading
 * because match recordings can be 50+ MB; reading the whole file into
 * memory as a base64 string would push past JS heap limits on lower-end
 * Android devices.
 *
 * Streaming caveat: `FileSystem.uploadAsync` does not expose a
 * progress callback for `BINARY_CONTENT` uploads. Callers should treat
 * the returned promise as a single "uploading -> done" transition and
 * surface only start/end states to the user.
 */
export async function uploadRecording({ fileUri, matchId, ext = "mp4" }: UploadOptions): Promise<UploadResult> {
  const path = buildVideoPath(matchId, ext);

  // Resolve the current access token so RLS policies on the bucket apply
  // to the authenticated athlete (mirrors the JS SDK's
  // `supabase.storage.from(...).upload(...)` flow but without buffering).
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("Not signed in");

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
    throw new Error(`Upload failed (${result.status}): ${result.body}`);
  }

  return { path, status: result.status };
}

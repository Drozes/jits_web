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
  abandonMatchVideoUpload,
  canUploadMatchVideo,
  finalizeMatchVideoUpload,
  reserveMatchVideoUpload,
  touchMatchVideoUpload,
  type AbandonMatchVideoResult,
  type FinalizeMatchVideoOutcome,
  type MatchVideoPreflight,
  type ReservedMatchVideo,
} from "@jits/shared/api/match-video-upload";
import type { DomainError } from "@jits/shared/api/errors";
import { describeUploadFailure, type UploadErrorClass } from "./upload-errors";
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
 * Web records WebM via `MediaRecorder`; native expo-camera produces an MP4
 * container, so the extension differs. The CODEC inside differs by platform:
 * iOS records HEVC (H.265) at 720p, about 4.7 Mbps in prod (the camera has
 * `videoQuality="720p"` and no codec or bitrate set, and AVFoundation's
 * default on HEVC-capable iPhones is HEVC), so every iOS upload goes through
 * the slicer's normalize transcode to H.264/AAC before broad playback;
 * Android records H.264/AAC. Keeping HEVC 720p is deliberate for now (about
 * half the upload bytes of H.264); see jits-n2im.10 for the decision.
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
 * A server-side gate on a `match_videos` write (jr_be triggers, raised as
 * P0001 with these HINTs). None of them is fixed by retrying seconds later,
 * so the upload manager stops on the first one instead of burning its row
 * budget:
 *
 *   rate_limited   : HINT upload_rate_limited (rolling 24h per-athlete cap).
 *                    PAUSED: it lifts as the window rolls, so foreground and
 *                    reconnect keep trying.
 *   disabled       : HINT video_upload_disabled (feature flag off). FAILED,
 *                    Retry offered.
 *   not_in_cohort  : HINT upload_not_in_cohort (uploader not allowlisted).
 *                    FAILED, Retry offered.
 *   reslice_limit  : HINT video_reslice_limit (re-upload ceiling on UPDATE
 *                    of storage_path, jr_be 20260918020000). TERMINAL: it
 *                    can never succeed, so it is not parked for 7 days
 *                    (jits-gxok); the athlete is offered Discard.
 *
 * The copy for each lives in `upload-errors.ts`, with every other failure
 * class, so there is one place that says what the athlete reads.
 */
export type MatchVideoGate = "rate_limited" | "disabled" | "not_in_cohort" | "reslice_limit";

const GATE_BY_HINT: Record<string, { gate: MatchVideoGate; klass: UploadErrorClass }> = {
  upload_rate_limited: { gate: "rate_limited", klass: "limit" },
  video_upload_disabled: { gate: "disabled", klass: "disabled" },
  upload_not_in_cohort: { gate: "not_in_cohort", klass: "not_in_cohort" },
  video_reslice_limit: { gate: "reslice_limit", klass: "reslice_limit" },
};

/** The gate behind a `match_videos` write failure, if it was one. */
export function matchVideoGateFor(
  hint: string | null | undefined,
): { gate: MatchVideoGate; message: string } | null {
  const hit = hint ? GATE_BY_HINT[hint] : undefined;
  return hit ? { gate: hit.gate, message: describeUploadFailure(hit.klass).message } : null;
}

/**
 * The storage write succeeded but the `match_videos` DB write failed.
 * `storageObjectPersisted` tells the caller whether the uploaded object
 * is still in the bucket and therefore needs cleanup if the row can never
 * be written.
 *
 * `gate` is set when a server-side upload gate rejected the row; its
 * `message` is then final user-facing copy and must not be wrapped again.
 * Otherwise `message` is the raw cause, and the caller supplies the
 * "Video uploaded, but saving the record failed" framing exactly once.
 */
export class MatchVideoDbError extends Error {
  /** Object key inside `match-videos` that was written before the DB failure. */
  readonly path: string;
  /** True when the object is still in the bucket. */
  readonly storageObjectPersisted: boolean;
  /** The server-side gate that rejected the row, or null for any other failure. */
  readonly gate: MatchVideoGate | null;
  /** Postgres / PostgREST error code (`42501`, `23505`, `P0001`), when there was one. */
  readonly code: string | null;
  /** The RAISE ... HINT (`invalid_storage_path`, a gate HINT), when there was one. */
  readonly hint: string | null;

  constructor(
    message: string,
    path: string,
    storageObjectPersisted: boolean,
    gate: MatchVideoGate | null = null,
    detail: { code?: string | null; hint?: string | null } = {},
  ) {
    super(message);
    this.name = "MatchVideoDbError";
    this.path = path;
    this.storageObjectPersisted = storageObjectPersisted;
    this.gate = gate;
    this.code = detail.code || null;
    this.hint = detail.hint || null;
  }
}

/** A `Result` failure as a `MatchVideoDbError`, keeping code, HINT and gate. */
function dbErrorOf(error: DomainError, path: string, storageObjectPersisted: boolean): MatchVideoDbError {
  const hint = error.raw?.hint ?? null;
  const gated = matchVideoGateFor(hint);
  return new MatchVideoDbError(
    gated ? gated.message : error.message,
    path,
    storageObjectPersisted,
    gated?.gate ?? null,
    { code: error.raw?.code ?? null, hint },
  );
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
 * the caller decides whether to retry (it should, unless `gate` is set) or
 * compensate (only when abandoning the job outright).
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
    // The raw cause only (or the gate's final copy): the upload manager adds
    // the "Video uploaded, but saving the record failed" framing, and adding
    // it here too doubled it.
    throw dbErrorOf(upserted.error, storagePath, true);
  }
  return upserted.data.id;
}

// ---------------------------------------------------------------------------
// Reserve-before-bytes lifecycle (jits-n2im.11, jr_be INTEGRATION.md section 10)
// ---------------------------------------------------------------------------

/**
 * `can_upload_match_video` for this athlete (jits-n2im.5). ADVISORY: null on
 * any failure (offline, an older backend without the RPC), and the caller
 * then goes straight to the reservation, whose triggers enforce the same
 * predicates anyway.
 */
export async function preflightMatchVideoUpload(
  matchId: string,
  fileSizeBytes: number,
): Promise<MatchVideoPreflight | null> {
  const res = await canUploadMatchVideo(supabase, matchId, fileSizeBytes);
  if (res.ok) return res.data;
  console.warn(`[video] upload preflight for ${matchId} unavailable: ${res.error.message}`);
  return null;
}

export interface ReserveRowParams {
  matchId: string;
  uploaderAthleteId: string;
  storagePath: string;
  fileSizeBytes: number;
  recordStartedAt: string | null;
  recordDurationMs: number | null;
}

/**
 * INSERT the row at 'uploading' (or take the athlete's existing row over on
 * 23505). Throws `MatchVideoDbError` carrying `code` / `hint` / `gate`; no
 * bytes have been sent, so `storageObjectPersisted` is false.
 */
export async function reserveMatchVideoRow(params: ReserveRowParams): Promise<ReservedMatchVideo> {
  const res = await reserveMatchVideoUpload(supabase, { ...params, transport: "tus" });
  if (!res.ok) throw dbErrorOf(res.error, params.storagePath, false);
  return res.data;
}

/**
 * Heartbeat. Fire and forget: a failed touch only shortens the server's
 * in-flight window, it never fails the upload.
 */
export async function touchMatchVideoRow(params: {
  videoId: string;
  bytesConfirmed: number;
  bytesTotal: number;
}): Promise<void> {
  try {
    const res = await touchMatchVideoUpload(supabase, { ...params, transport: "tus" });
    if (!res.ok) console.warn(`[video] upload heartbeat for ${params.videoId} failed: ${res.error.message}`);
  } catch (err) {
    console.warn(`[video] upload heartbeat for ${params.videoId} failed:`, err);
  }
}

/** PATCH 'uploading' -> 'ready'. Throws `MatchVideoDbError` on a failed write. */
export async function finalizeMatchVideoRow(params: {
  videoId: string;
  storagePath: string;
}): Promise<FinalizeMatchVideoOutcome> {
  const res = await finalizeMatchVideoUpload(supabase, params);
  if (!res.ok) throw dbErrorOf(res.error, params.storagePath, true);
  return res.data;
}

/** `abandon_match_video_upload`, best effort: null when the call failed. */
export async function abandonMatchVideoRow(videoId: string): Promise<AbandonMatchVideoResult | null> {
  try {
    const res = await abandonMatchVideoUpload(supabase, videoId);
    if (res.ok) return res.data;
    console.warn(`[video] abandon of ${videoId} failed: ${res.error.message}`);
    captureException(new Error(`Match-video abandon failed: ${res.error.message}`), { videoId });
  } catch (err) {
    console.warn(`[video] abandon of ${videoId} failed:`, err);
    captureException(err, { videoId });
  }
  return null;
}

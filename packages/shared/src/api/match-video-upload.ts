import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import { mapPostgrestError, type DomainError, type Result } from "./errors";

type Client = SupabaseClient<Database>;

/**
 * The reserve-before-bytes upload lifecycle for `match_videos`
 * (jr_be-1qz.1 / .2 / .4, contract: jr_be
 * `specs/013-chunked-video-pipeline/INTEGRATION.md` section 10).
 *
 *   1. preflight   `canUploadMatchVideo`        (optional, before recording/bytes)
 *   2. reserve     `reserveMatchVideoUpload`    INSERT at 'uploading' (all gates fire here)
 *   3. progress    `touchMatchVideoUpload`      heartbeat, <= 1 / 30 s while bytes move
 *   4. land        `finalizeMatchVideoUpload`   PATCH 'uploading' -> 'ready' (the storage
 *                                               trigger may flip it first; both are fine)
 *   5. give up     `abandonMatchVideoUpload`    'uploading' -> 'failed' (upload_abandoned)
 *
 * Every function returns a `Result` and never throws. The raw PostgrestError
 * rides on `error.raw` so a caller can branch on `code` / `hint`
 * (`42501 invalid_storage_path`, the P0001 gate HINTs) without parsing text.
 */

export type MatchVideoUploadTransport = "tus" | "background";

/** The columns every lifecycle step reads back. */
const ROW_SELECT = "id, status, storage_path, failure_code";

interface LifecycleRow {
  id: string;
  status: string;
  storage_path: string | null;
  failure_code: string | null;
}

export interface ReservedMatchVideo {
  id: string;
  /** Status after the write. Not 'uploading' means the row already moved on. */
  status: string;
  /** The row's storage_path after the write. */
  storagePath: string | null;
  /** Machine failure reason (`upload_abandoned`), never parse `error_message`. */
  failureCode: string | null;
  /** True when an existing (match, uploader) row was taken over (23505 path). */
  resumed: boolean;
}

export interface ReserveMatchVideoParams {
  matchId: string;
  uploaderAthleteId: string;
  /** Final key, `<match_id>/<uploader>/<file>` (see `buildMatchVideoStoragePath`). */
  storagePath: string;
  /** Exact byte size; also declared as `upload_bytes_total`. */
  fileSizeBytes: number;
  /** Wall-clock the recorder started (ISO). INSERT-only; the server sanity-checks it. */
  recordStartedAt?: string | null;
  /** Recorder-reported duration. INSERT-only. */
  recordDurationMs?: number | null;
  transport?: MatchVideoUploadTransport;
  requestedTier?: "standard" | "premium";
}

function toReserved(row: LifecycleRow, resumed: boolean): ReservedMatchVideo {
  return {
    id: row.id,
    status: row.status,
    storagePath: row.storage_path,
    failureCode: row.failure_code ?? null,
    resumed,
  };
}

function unexpected(err: unknown): DomainError {
  return { code: "UNKNOWN", message: err instanceof Error ? err.message : String(err) };
}

/**
 * Reserve the `match_videos` row at `status='uploading'` BEFORE any byte is
 * sent. Every INSERT gate (uploads off, cohort, daily cap) fires here, so a
 * refused upload costs no bytes.
 *
 * On 23505 (the athlete already has a row for this match) the existing row
 * is taken over with a re-path PATCH to `'uploading'`, which also declares the
 * new size and transport. That is the same path a crash between the INSERT
 * and the caller persisting the id takes on the next launch: with the same
 * `storage_path` the PATCH is a no-op echo that simply returns the row, so a
 * retried reservation never creates a second row. A re-path from an
 * `'uploading'` or abandoned row is free; from a dispatched row it counts
 * against the re-slice ceiling (HINT `video_reslice_limit`).
 */
export async function reserveMatchVideoUpload(
  supabase: Client,
  params: ReserveMatchVideoParams,
): Promise<Result<ReservedMatchVideo>> {
  const transport = params.transport ?? "tus";
  try {
    const insert: Database["public"]["Tables"]["match_videos"]["Insert"] = {
      match_id: params.matchId,
      uploaded_by: params.uploaderAthleteId,
      storage_path: params.storagePath,
      status: "uploading",
      requested_tier: params.requestedTier ?? "standard",
      file_size_bytes: params.fileSizeBytes,
      upload_bytes_total: params.fileSizeBytes,
      upload_transport: transport,
    };
    if (params.recordStartedAt) insert.record_started_at = params.recordStartedAt;
    if (params.recordDurationMs != null && params.recordDurationMs > 0) {
      insert.record_duration_ms = Math.round(params.recordDurationMs);
    }

    const created = await supabase.from("match_videos").insert(insert).select(ROW_SELECT).single();
    if (!created.error && created.data) return { ok: true, data: toReserved(created.data as LifecycleRow, false) };
    if (created.error?.code !== "23505") {
      return { ok: false, error: mapPostgrestError(created.error!, "match_video_create") };
    }

    const update: Database["public"]["Tables"]["match_videos"]["Update"] = {
      storage_path: params.storagePath,
      status: "uploading",
      file_size_bytes: params.fileSizeBytes,
      upload_bytes_total: params.fileSizeBytes,
      upload_transport: transport,
    };
    const taken = await supabase
      .from("match_videos")
      .update(update)
      .eq("match_id", params.matchId)
      .eq("uploaded_by", params.uploaderAthleteId)
      .select(ROW_SELECT)
      .single();
    if (taken.error) return { ok: false, error: mapPostgrestError(taken.error, "match_video_create") };
    return { ok: true, data: toReserved(taken.data as LifecycleRow, true) };
  } catch (err) {
    return { ok: false, error: unexpected(err) };
  }
}

export interface TouchMatchVideoParams {
  videoId: string;
  bytesConfirmed: number;
  bytesTotal?: number | null;
  transport?: MatchVideoUploadTransport | null;
}

export interface TouchMatchVideoResult {
  status: string;
  /** False once the row left 'uploading' (landed, abandoned). */
  updated: boolean;
}

/** Heartbeat for a reserved upload. Uploader only (42501 `not_uploader`). */
export async function touchMatchVideoUpload(
  supabase: Client,
  params: TouchMatchVideoParams,
): Promise<Result<TouchMatchVideoResult>> {
  try {
    const args: Database["public"]["Functions"]["touch_match_video_upload"]["Args"] = {
      p_video_id: params.videoId,
      p_bytes_confirmed: Math.max(0, Math.floor(params.bytesConfirmed)),
    };
    if (params.bytesTotal != null && params.bytesTotal > 0) args.p_bytes_total = Math.floor(params.bytesTotal);
    if (params.transport) args.p_transport = params.transport;
    const { data, error } = await supabase.rpc("touch_match_video_upload", args);
    if (error) return { ok: false, error: mapPostgrestError(error, "match_video_touch") };
    const payload = (data ?? {}) as { status?: unknown; updated?: unknown };
    return {
      ok: true,
      data: { status: typeof payload.status === "string" ? payload.status : "unknown", updated: payload.updated === true },
    };
  } catch (err) {
    return { ok: false, error: unexpected(err) };
  }
}

/**
 * What the land PATCH found.
 *
 *   landed     the row is past 'uploading' (this PATCH, or the storage
 *              trigger / cron got there first). Success either way.
 *   abandoned  the row is 'failed' (`failureCode` says why, e.g.
 *              `upload_abandoned`): the status PATCH cannot revive it; the
 *              bytes have to go up again under a new storage_path.
 *   moved      the row now points at a different storage_path (a newer
 *              recording re-pathed it). This upload is superseded.
 *   missing    the row is gone (deleted). The bytes are in the bucket with no
 *              row: fall back to the legacy INSERT at 'ready'.
 */
export type FinalizeMatchVideoOutcome =
  | { outcome: "landed"; status: string }
  | { outcome: "abandoned"; failureCode: string | null }
  | { outcome: "moved" }
  | { outcome: "missing" };

/**
 * PATCH the reserved row `'uploading' -> 'ready'` once every byte is in.
 *
 * Filtered on `storage_path` as well as `id`, so a superseded runner whose
 * row was re-pathed by a newer recording can never flip that NEW reservation
 * to 'ready' before its bytes exist (which would dispatch the slicer at a
 * missing object). The status guard (jr_be-jv7) makes a PATCH on a row the
 * storage trigger already flipped a silent no-op, so the client/trigger race
 * resolves to exactly one slice.
 */
export async function finalizeMatchVideoUpload(
  supabase: Client,
  params: { videoId: string; storagePath: string },
): Promise<Result<FinalizeMatchVideoOutcome>> {
  try {
    const patched = await supabase
      .from("match_videos")
      .update({ status: "ready" })
      .eq("id", params.videoId)
      .eq("storage_path", params.storagePath)
      .select(ROW_SELECT)
      .maybeSingle();
    if (patched.error) return { ok: false, error: mapPostgrestError(patched.error, "match_video_finalize") };
    const row = patched.data as LifecycleRow | null;
    if (row) {
      if (row.status === "failed") return { ok: true, data: { outcome: "abandoned", failureCode: row.failure_code ?? null } };
      return { ok: true, data: { outcome: "landed", status: row.status } };
    }

    // Nothing matched both filters: tell "re-pathed" from "gone".
    const read = await supabase.from("match_videos").select(ROW_SELECT).eq("id", params.videoId).maybeSingle();
    if (read.error) return { ok: false, error: mapPostgrestError(read.error, "match_video_finalize") };
    const current = read.data as LifecycleRow | null;
    if (!current || current.status === "deleted") return { ok: true, data: { outcome: "missing" } };
    if (current.storage_path !== params.storagePath) return { ok: true, data: { outcome: "moved" } };
    if (current.status === "failed") {
      return { ok: true, data: { outcome: "abandoned", failureCode: current.failure_code ?? null } };
    }
    return { ok: true, data: { outcome: "landed", status: current.status } };
  } catch (err) {
    return { ok: false, error: unexpected(err) };
  }
}

export interface AbandonMatchVideoResult {
  status: string;
  /** True when the row is now (or already was) failed with `upload_abandoned`. */
  abandoned: boolean;
}

/**
 * Give up on a reserved upload: `'uploading' -> 'failed'`
 * (`failure_code = 'upload_abandoned'`). Idempotent; a row that already left
 * 'uploading' (it landed) is left alone and answers `abandoned: false`.
 */
export async function abandonMatchVideoUpload(
  supabase: Client,
  videoId: string,
): Promise<Result<AbandonMatchVideoResult>> {
  try {
    const { data, error } = await supabase.rpc("abandon_match_video_upload", { p_video_id: videoId });
    if (error) return { ok: false, error: mapPostgrestError(error, "match_video_abandon") };
    const payload = (data ?? {}) as { status?: unknown; abandoned?: unknown };
    return {
      ok: true,
      data: { status: typeof payload.status === "string" ? payload.status : "unknown", abandoned: payload.abandoned === true },
    };
  } catch (err) {
    return { ok: false, error: unexpected(err) };
  }
}

/** `can_upload_match_video` reasons, in the server's evaluation order. */
export type MatchVideoPreflightReason =
  | "match_not_found"
  | "not_participant"
  | "reslice_limit"
  | "duplicate"
  | "disabled"
  | "not_in_cohort"
  | "rate_limited"
  | "file_too_large";

export interface MatchVideoPreflight {
  allowed: boolean;
  /** Null when allowed. An unrecognised (future) reason is passed through as a string. */
  reason: MatchVideoPreflightReason | (string & {}) | null;
  remainingToday: number | null;
  dailyCap: number | null;
  /** When the oldest counted upload leaves the 24 h window (ISO), or null. */
  resetsAt: string | null;
  maxBytes: number | null;
  /** Set with reason `duplicate` / `reslice_limit`: the row to resume. */
  existingVideoId: string | null;
  existingStatus: string | null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * Preflight for the CALLER (jr_be-1qz.2): may they upload a video for this
 * match right now, and if not, why. Shares its predicates with the INSERT /
 * UPDATE triggers, so an `allowed` answer means the reservation's gates pass
 * (barring a race with another upload).
 */
export async function canUploadMatchVideo(
  supabase: Client,
  matchId: string,
  fileSizeBytes?: number | null,
): Promise<Result<MatchVideoPreflight>> {
  try {
    const args: Database["public"]["Functions"]["can_upload_match_video"]["Args"] = { p_match_id: matchId };
    if (fileSizeBytes != null && fileSizeBytes > 0) args.p_file_size_bytes = Math.floor(fileSizeBytes);
    const { data, error } = await supabase.rpc("can_upload_match_video", args);
    if (error) return { ok: false, error: mapPostgrestError(error, "match_video_preflight") };
    const p = (data ?? {}) as Record<string, unknown>;
    return {
      ok: true,
      data: {
        allowed: p.allowed === true,
        reason: str(p.reason),
        remainingToday: num(p.remaining_today),
        dailyCap: num(p.daily_cap),
        resetsAt: str(p.resets_at),
        maxBytes: num(p.max_bytes),
        existingVideoId: str(p.existing_video_id),
        existingStatus: str(p.existing_status),
      },
    };
  } catch (err) {
    return { ok: false, error: unexpected(err) };
  }
}

/**
 * Declare whether the caller will record this match (jr_be-1qz.4). Last write
 * wins while the match is pending / in progress; afterwards P0001
 * `intent_frozen`.
 */
export async function setMatchRecordingIntent(
  supabase: Client,
  matchId: string,
  intends: boolean,
): Promise<Result<void>> {
  try {
    const { error } = await supabase.rpc("set_match_recording_intent", {
      p_match_id: matchId,
      p_intends: intends,
    });
    if (error) return { ok: false, error: mapPostgrestError(error, "match_recording_intent") };
    return { ok: true, data: undefined };
  } catch (err) {
    return { ok: false, error: unexpected(err) };
  }
}

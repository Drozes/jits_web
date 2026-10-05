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
  /**
   * "reserved": the row is ours at our key (inserted, re-pathed, or the
   * same-key echo of a reservation a killed process made).
   * "deferred": the athlete already has a row WITH BYTES (ready, analyzed,
   * pipeline-failed, deleted, or one this client cannot read) at another
   * key. It was NOT touched: re-pathing it before the new bytes exist would
   * fire the server's re-upload reset (chunks, analysis, AI tags, poster,
   * highlights) and lose a good video if the new upload never lands. The
   * caller uploads the bytes first and replaces the row only then (the
   * wave 1 order). `id` / `status` / `storagePath` describe that row.
   */
  outcome: "reserved" | "deferred";
  /**
   * The key the row pointed at before this reservation re-pathed it, when it
   * did (an 'uploading' or abandoned row at another key). Nothing references
   * that object any more, so the caller may delete it. Null otherwise.
   */
  previousStoragePath: string | null;
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

function toReserved(
  row: LifecycleRow,
  resumed: boolean,
  outcome: ReservedMatchVideo["outcome"] = "reserved",
  previousStoragePath: string | null = null,
): ReservedMatchVideo {
  return {
    id: row.id,
    status: row.status,
    storagePath: row.storage_path,
    failureCode: row.failure_code ?? null,
    resumed,
    outcome,
    previousStoragePath,
  };
}

/** A row whose key may be replaced before the new bytes exist: no slice ever ran on it. */
export function isRepathFree(status: string, failureCode: string | null | undefined): boolean {
  return status === "uploading" || (status === "failed" && failureCode === "upload_abandoned");
}

function unexpected(err: unknown): DomainError {
  return { code: "UNKNOWN", message: err instanceof Error ? err.message : String(err) };
}

/**
 * Reserve the `match_videos` row at `status='uploading'` BEFORE any byte is
 * sent. Every INSERT gate (uploads off, cohort, daily cap) fires here, so a
 * refused upload costs no bytes.
 *
 * On 23505 (the athlete already has a row for this match) the row is READ
 * first, and then:
 *   - at our own key: returned as is (a crash between the INSERT and the
 *     caller persisting the id; one row, never two);
 *   - 'uploading' or abandoned at another key: taken over with a re-path
 *     PATCH to 'uploading' (free: no slice ever ran on it), guarded on the
 *     key just read so a concurrent change is not overwritten;
 *   - anything else (it has bytes): left alone, `outcome: "deferred"`.
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

    const read = await supabase
      .from("match_videos")
      .select(ROW_SELECT)
      .eq("match_id", params.matchId)
      .eq("uploaded_by", params.uploaderAthleteId)
      .maybeSingle();
    if (read.error) return { ok: false, error: mapPostgrestError(read.error, "match_video_create") };
    const existing = read.data as LifecycleRow | null;
    if (!existing) {
      // The row exists (23505) but this client cannot read it: never touch
      // what it cannot see.
      return {
        ok: true,
        data: { id: "", status: "unknown", storagePath: null, failureCode: null, resumed: true, outcome: "deferred", previousStoragePath: null },
      };
    }
    if (existing.storage_path === params.storagePath) return { ok: true, data: toReserved(existing, true) };
    if (!isRepathFree(existing.status, existing.failure_code)) {
      return { ok: true, data: toReserved(existing, true, "deferred") };
    }

    const update: Database["public"]["Tables"]["match_videos"]["Update"] = {
      storage_path: params.storagePath,
      status: "uploading",
      file_size_bytes: params.fileSizeBytes,
      upload_bytes_total: params.fileSizeBytes,
      upload_transport: transport,
    };
    let takeover = supabase.from("match_videos").update(update).eq("id", existing.id);
    takeover = existing.storage_path == null ? takeover.is("storage_path", null) : takeover.eq("storage_path", existing.storage_path);
    // R2-M1: guard on the STATUS read too. The landing trigger flips
    // 'uploading' -> 'ready' without changing the key, so a key-only guard
    // would still re-path a row whose bytes landed between the read and this
    // PATCH. With the status (and the abandon code) in the WHERE, which
    // Postgres re-checks under the row lock, such a row matches nothing and
    // the retry below re-reads it and defers.
    takeover = takeover.eq("status", existing.status);
    if (existing.status === "failed") takeover = takeover.eq("failure_code", "upload_abandoned");
    const taken = await takeover.select(ROW_SELECT).maybeSingle();
    if (taken.error) return { ok: false, error: mapPostgrestError(taken.error, "match_video_create") };
    if (!taken.data) {
      // The row changed between the read and the PATCH: report a transient
      // failure so the caller's backoff re-reads it.
      return { ok: false, error: { code: "UNKNOWN", message: "match video row changed during the reservation" } };
    }
    return { ok: true, data: toReserved(taken.data as LifecycleRow, true, "reserved", existing.storage_path) };
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
 *   deleted    the athlete deleted the video (status 'deleted'): never
 *              revived; the caller drops the job.
 *   missing    the row is gone (hard-deleted). The bytes are in the bucket
 *              with no row: fall back to the legacy INSERT at 'ready'.
 */
export type FinalizeMatchVideoOutcome =
  | { outcome: "landed"; status: string }
  | { outcome: "deleted" }
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
      if (row.status === "deleted") return { ok: true, data: { outcome: "deleted" } };
      if (row.status === "failed") return { ok: true, data: { outcome: "abandoned", failureCode: row.failure_code ?? null } };
      return { ok: true, data: { outcome: "landed", status: row.status } };
    }

    // Nothing matched both filters: tell "re-pathed" from "gone".
    const read = await supabase.from("match_videos").select(ROW_SELECT).eq("id", params.videoId).maybeSingle();
    if (read.error) return { ok: false, error: mapPostgrestError(read.error, "match_video_finalize") };
    const current = read.data as LifecycleRow | null;
    if (!current) return { ok: true, data: { outcome: "missing" } };
    if (current.status === "deleted") return { ok: true, data: { outcome: "deleted" } };
    if (current.storage_path !== params.storagePath) return { ok: true, data: { outcome: "moved" } };
    if (current.status === "failed") {
      return { ok: true, data: { outcome: "abandoned", failureCode: current.failure_code ?? null } };
    }
    return { ok: true, data: { outcome: "landed", status: current.status } };
  } catch (err) {
    return { ok: false, error: unexpected(err) };
  }
}

/**
 * Read one row's lifecycle columns (the uploader's own row). `null` when the
 * row is gone or not readable.
 */
export async function getMatchVideoLifecycle(
  supabase: Client,
  videoId: string,
): Promise<Result<{ status: string; storagePath: string | null; failureCode: string | null } | null>> {
  try {
    const { data, error } = await supabase.from("match_videos").select(ROW_SELECT).eq("id", videoId).maybeSingle();
    if (error) return { ok: false, error: mapPostgrestError(error, "match_video_read") };
    const row = data as LifecycleRow | null;
    return { ok: true, data: row ? { status: row.status, storagePath: row.storage_path, failureCode: row.failure_code ?? null } : null };
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

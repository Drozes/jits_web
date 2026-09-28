import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import {
  HIGHLIGHT_DOWNLOAD_URL_TTL_S,
  type HighlightShareEventDetail,
  type HighlightShareSourceTag,
  type HighlightShareStep,
} from "../constants/highlights";
import { mapPostgrestError, type DomainError, type Result } from "./errors";
import { isStorageObjectMissing, MATCH_VIDEO_BUCKET } from "./queries";

/**
 * Highlight reels phase 2: discovery and the share funnel (jr_be spec 014
 * sections 16.3 and 16.5). Own reels only, every wrapper returns a
 * `Result<T>` and never throws. The kill switch for every outbound action is
 * `prepare_highlight_share`, which refuses with HIGHLIGHT_SHARE_DISABLED
 * while `highlight_share_enabled` is off; the app calls it before every
 * download. Kept apart from `highlights.ts`, whose "nothing here shares or
 * exports footage" promise still holds.
 */

type Client = SupabaseClient<Database>;

/*
 * JSONB narrowing shapes. The RPCs are in the generated `database.ts`
 * (their Returns is `Json`); these describe what that Json holds.
 */

/** `get_highlight_flags()` */
export interface RawHighlightFlags {
  clips_enabled: boolean;
  share_enabled: boolean;
}

/** One item of `get_my_highlights(...)`.items (spec 16.3.3). */
export interface RawMyHighlightItem {
  highlight_id: string;
  match_id: string;
  match_video_id: string;
  version: number;
  duration_s: number | string;
  poster_path: string | null;
  ready_at: string;
  opponent_name: string | null;
  match_type: string;
  outcome: string | null;
  played_at: string;
  notified_at: string | null;
  unseen: boolean;
  /** Additive: origin of the ledger row for the live version (`auto` | `regen` | `retry`), else null. */
  origin?: string | null;
}

/** `get_my_highlights(p_limit, p_before, p_unseen_only)` */
export interface RawMyHighlights {
  clips_enabled: boolean;
  share_enabled: boolean;
  items: RawMyHighlightItem[];
}

/** `get_highlight_detail(p_highlight_id)` */
export interface RawHighlightDetail {
  highlight_id: string;
  match_video_id: string;
  match_id: string;
  version: number | null;
  clips_enabled: boolean;
  share_enabled: boolean;
  caption: {
    athlete_name: string;
    opponent_name: string | null;
    match_type: string;
    outcome: string | null;
    elo_after: number | null;
    elo_delta: number | null;
    technique: string | null;
    played_at: string;
  };
}

/** `prepare_highlight_share(p_highlight_id)` */
export interface RawHighlightShareSource {
  highlight_id: string;
  version: number;
  storage_path: string;
  duration_s: number | string;
  file_name: string;
}

export type { HighlightShareStep, HighlightShareSourceTag } from "../constants/highlights";

export interface HighlightFlags {
  clipsEnabled: boolean;
  shareEnabled: boolean;
}

export type HighlightMatchType = "ranked" | "casual";
export type HighlightOutcome = "win" | "loss" | "draw";

/** Origin of a ready notification (`video_highlight_ready_notifications.origin`). */
export type HighlightReadyOrigin = "auto" | "regen" | "retry";

const READY_ORIGINS: ReadonlySet<string> = new Set<HighlightReadyOrigin>(["auto", "regen", "retry"]);

/** Unknown / missing -> null (the key is additive; older backends omit it). */
export function readyOriginOf(raw: unknown): HighlightReadyOrigin | null {
  return typeof raw === "string" && READY_ORIGINS.has(raw) ? (raw as HighlightReadyOrigin) : null;
}

export interface MyHighlightItem {
  highlightId: string;
  matchId: string;
  matchVideoId: string;
  version: number;
  durationS: number;
  posterPath: string | null;
  readyAt: string;
  opponentName: string | null;
  matchType: HighlightMatchType;
  outcome: HighlightOutcome | null;
  playedAt: string;
  notifiedAt: string | null;
  unseen: boolean;
  /** Why the live version exists (ledger row): `regen` is a regeneration; null when unknown. */
  origin: HighlightReadyOrigin | null;
}

export interface MyHighlights {
  clipsEnabled: boolean;
  shareEnabled: boolean;
  items: MyHighlightItem[];
}

export interface HighlightCaptionContext {
  athleteName: string;
  opponentName: string | null;
  matchType: HighlightMatchType;
  outcome: HighlightOutcome | null;
  eloAfter: number | null;
  eloDelta: number | null;
  technique: string | null;
  playedAt: string;
}

export interface HighlightDetail {
  highlightId: string;
  matchVideoId: string;
  matchId: string;
  version: number | null;
  clipsEnabled: boolean;
  shareEnabled: boolean;
  caption: HighlightCaptionContext;
}

export interface HighlightShareSource {
  highlightId: string;
  version: number;
  storagePath: string;
  durationS: number;
  fileName: string;
}

export interface GetMyHighlightsOptions {
  limit?: number;
  before?: string;
  unseenOnly?: boolean;
}

function unexpected(context: string, err: unknown): DomainError {
  console.error(`${context}:`, err);
  return {
    code: "UNKNOWN",
    message: err instanceof Error ? err.message : "Something went wrong.",
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function num(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function strOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Anything but "ranked" is casual: the lower-stakes reading of an unknown value. */
function matchTypeOf(value: unknown): HighlightMatchType {
  return value === "ranked" ? "ranked" : "casual";
}

function outcomeOf(value: unknown): HighlightOutcome | null {
  return value === "win" || value === "loss" || value === "draw" ? value : null;
}

const MALFORMED: DomainError = { code: "UNKNOWN", message: "Unexpected response from the server." };

export function toMyHighlightItem(raw: RawMyHighlightItem): MyHighlightItem {
  return {
    highlightId: raw.highlight_id,
    matchId: raw.match_id,
    matchVideoId: raw.match_video_id,
    version: num(raw.version),
    durationS: num(raw.duration_s),
    posterPath: strOrNull(raw.poster_path),
    readyAt: raw.ready_at,
    opponentName: strOrNull(raw.opponent_name),
    matchType: matchTypeOf(raw.match_type),
    outcome: outcomeOf(raw.outcome),
    playedAt: raw.played_at,
    notifiedAt: strOrNull(raw.notified_at),
    unseen: raw.unseen === true,
    origin: readyOriginOf(raw.origin),
  };
}

export function toHighlightDetail(raw: RawHighlightDetail): HighlightDetail {
  const c: Partial<RawHighlightDetail["caption"]> = isObject(raw.caption) ? raw.caption : {};
  return {
    highlightId: raw.highlight_id,
    matchVideoId: raw.match_video_id,
    matchId: raw.match_id,
    version: numOrNull(raw.version),
    clipsEnabled: raw.clips_enabled === true,
    shareEnabled: raw.share_enabled === true,
    caption: {
      athleteName: typeof c.athlete_name === "string" ? c.athlete_name : "",
      opponentName: strOrNull(c.opponent_name),
      matchType: matchTypeOf(c.match_type),
      outcome: outcomeOf(c.outcome),
      eloAfter: numOrNull(c.elo_after),
      eloDelta: numOrNull(c.elo_delta),
      technique: strOrNull(c.technique),
      playedAt: typeof c.played_at === "string" ? c.played_at : "",
    },
  };
}

/**
 * Both highlight flags (`get_highlight_flags`). On ANY failure the result is
 * `{ ok: false }` and callers treat both flags as false (fail-closed).
 */
export async function getHighlightFlags(supabase: Client): Promise<Result<HighlightFlags>> {
  try {
    const { data, error } = await supabase.rpc("get_highlight_flags");
    if (error) return { ok: false, error: mapPostgrestError(error, "highlight_flags") };
    if (!isObject(data)) return { ok: false, error: MALFORMED };
    const raw = data as Partial<RawHighlightFlags>;
    return {
      ok: true,
      data: { clipsEnabled: raw.clips_enabled === true, shareEnabled: raw.share_enabled === true },
    };
  } catch (err) {
    return { ok: false, error: unexpected("getHighlightFlags", err) };
  }
}

/**
 * The caller's own ready reels, newest first (`get_my_highlights`). Omitted
 * options fall back to the SQL defaults (20, no cursor, all items).
 */
export async function getMyHighlights(
  supabase: Client,
  opts: GetMyHighlightsOptions = {},
): Promise<Result<MyHighlights>> {
  try {
    const { data, error } = await supabase.rpc("get_my_highlights", {
      ...(opts.limit !== undefined ? { p_limit: opts.limit } : {}),
      ...(opts.before !== undefined ? { p_before: opts.before } : {}),
      ...(opts.unseenOnly !== undefined ? { p_unseen_only: opts.unseenOnly } : {}),
    });
    if (error) return { ok: false, error: mapPostgrestError(error, "highlight_my_highlights") };
    if (!isObject(data)) return { ok: false, error: MALFORMED };
    const raw = data as Partial<RawMyHighlights>;
    const items = Array.isArray(raw.items)
      ? raw.items
          .filter((item): item is RawMyHighlightItem => isObject(item) && typeof item.highlight_id === "string")
          .map(toMyHighlightItem)
      : [];
    return {
      ok: true,
      data: {
        clipsEnabled: raw.clips_enabled === true,
        shareEnabled: raw.share_enabled === true,
        items,
      },
    };
  } catch (err) {
    return { ok: false, error: unexpected("getMyHighlights", err) };
  }
}

/** The viewer's context for one own reel (`get_highlight_detail`). */
export async function getHighlightDetail(
  supabase: Client,
  highlightId: string,
): Promise<Result<HighlightDetail>> {
  try {
    const { data, error } = await supabase.rpc("get_highlight_detail", {
      p_highlight_id: highlightId,
    });
    if (error) return { ok: false, error: mapPostgrestError(error, "highlight_detail") };
    if (!isObject(data) || typeof data.highlight_id !== "string") {
      return { ok: false, error: MALFORMED };
    }
    return { ok: true, data: toHighlightDetail(data as unknown as RawHighlightDetail) };
  } catch (err) {
    return { ok: false, error: unexpected("getHighlightDetail", err) };
  }
}

/** Mark every ready notification up to `version` seen (`mark_highlight_seen`). Idempotent. */
export async function markHighlightSeen(
  supabase: Client,
  highlightId: string,
  version: number,
): Promise<Result<null>> {
  try {
    const { error } = await supabase.rpc("mark_highlight_seen", {
      p_highlight_id: highlightId,
      p_version: version,
    });
    if (error) return { ok: false, error: mapPostgrestError(error, "highlight_seen") };
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: unexpected("markHighlightSeen", err) };
  }
}

/**
 * The server-side kill-switch check and the download source
 * (`prepare_highlight_share`): the LIVE render's key and a file name.
 * HIGHLIGHT_SHARE_DISABLED while the share flag is off.
 */
export async function prepareHighlightShare(
  supabase: Client,
  highlightId: string,
): Promise<Result<HighlightShareSource>> {
  try {
    const { data, error } = await supabase.rpc("prepare_highlight_share", {
      p_highlight_id: highlightId,
    });
    if (error) return { ok: false, error: mapPostgrestError(error, "highlight_prepare_share") };
    if (!isObject(data)) return { ok: false, error: MALFORMED };
    const raw = data as Partial<RawHighlightShareSource>;
    if (typeof raw.storage_path !== "string" || !raw.storage_path || typeof raw.file_name !== "string" || !raw.file_name) {
      return { ok: false, error: MALFORMED };
    }
    return {
      ok: true,
      data: {
        highlightId: typeof raw.highlight_id === "string" ? raw.highlight_id : highlightId,
        version: num(raw.version),
        storagePath: raw.storage_path,
        durationS: num(raw.duration_s),
        fileName: raw.file_name,
      },
    };
  } catch (err) {
    return { ok: false, error: unexpected("prepareHighlightShare", err) };
  }
}

/**
 * Short-lived signed URL for downloading the reel (private `match-videos`
 * bucket, participant storage RLS; no public URL). A missing object maps to
 * VIDEO_FILE_MISSING like `signHighlightPlayback`.
 */
export async function signHighlightDownload(
  supabase: Client,
  storagePath: string,
  expiresInSeconds: number = HIGHLIGHT_DOWNLOAD_URL_TTL_S,
): Promise<Result<{ url: string }>> {
  try {
    const { data, error } = await supabase.storage
      .from(MATCH_VIDEO_BUCKET)
      .createSignedUrl(storagePath, expiresInSeconds);
    if (error) {
      if (isStorageObjectMissing(error)) {
        return {
          ok: false,
          error: { code: "VIDEO_FILE_MISSING", message: "The highlight file was not found." },
        };
      }
      return { ok: false, error: { code: "UNKNOWN", message: error.message } };
    }
    if (!data?.signedUrl) {
      return { ok: false, error: { code: "UNKNOWN", message: "Storage returned no signed URL." } };
    }
    return { ok: true, data: { url: data.signedUrl } };
  } catch (err) {
    return { ok: false, error: unexpected("signHighlightDownload", err) };
  }
}

/**
 * Fire-and-forget share-funnel event (`log_highlight_share_event`). Resolves
 * in every case, including an RPC error or a throw: telemetry must never
 * break or delay the flow it measures.
 */
export async function logHighlightShareEvent(
  supabase: Client,
  highlightId: string,
  step: HighlightShareStep,
  detail?: HighlightShareEventDetail,
): Promise<void> {
  try {
    await supabase.rpc("log_highlight_share_event", {
      p_highlight_id: highlightId,
      p_step: step,
      p_detail: detail ?? {},
    });
  } catch {
    // Swallowed on purpose (see above).
  }
}

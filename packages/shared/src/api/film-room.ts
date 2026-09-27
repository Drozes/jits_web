/**
 * Film Room data layer (match flow redesign, slice F2): the paged match
 * library behind the Film Room grid and the merged video analysis behind the
 * match page and the player. Result-shaped, never throws.
 */
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import { mapPostgrestError, type DomainError, type Result } from "./errors";
import type { MatchHistoryRow } from "../types/composites";
import { signPosterKeys } from "./poster-signing";
import {
  sortMatchVideosForViewer,
  videoPlayability,
  type VideoPlayability,
} from "../utils/match-video";
import type {
  AnalysisPosition,
  AnalysisScoringMoment,
} from "../utils/key-moments";
import { isUuid } from "../utils/shared";

type Client = SupabaseClient<Database>;

export type LibraryOutcome = "win" | "loss" | "draw" | null;

/** One recording in a library item (`get_my_match_library().items[].videos[]`). */
export interface MatchLibraryVideo {
  video_id: string;
  uploaded_by: string;
  /** Raw match_videos.status. */
  status: string;
  playability: VideoPlayability;
  /** Poster storage key (match_videos.thumbnail_url), unsigned. */
  thumbnail_key: string | null;
  thumbnail_width: number | null;
  thumbnail_height: number | null;
  duration_seconds: number | null;
  has_analysis: boolean;
  analysis_tier: string | null;
  chunk_count: number | null;
  chunks_completed: number;
  /** Signed poster URL (batch-signed per page), or null. */
  poster_url: string | null;
}

export interface MatchLibraryOpponent {
  id: string;
  display_name: string;
  profile_photo_url: string | null;
}

/** One completed or disputed match the caller took part in. */
export interface MatchLibraryItem {
  match_id: string;
  completed_at: string | null;
  /** "ranked" | "casual" */
  match_type: string | null;
  /** "completed" | "disputed" */
  status: string;
  outcome: LibraryOutcome;
  submission_name: string | null;
  finish_time_seconds: number | null;
  /** Configured match clock in seconds. */
  duration_seconds: number | null;
  elo_before: number | null;
  elo_after: number | null;
  elo_delta: number | null;
  opponent: MatchLibraryOpponent | null;
  /** Viewer's own recording first. */
  videos: MatchLibraryVideo[];
  highlight_count: number;
}

export interface MatchLibraryPage {
  items: MatchLibraryItem[];
  /** Pass as `before` for the next page; null when this is the last page. */
  next_before: string | null;
  /**
   * "rpc" is `get_my_match_library`. "fallback" means the backend predates
   * it and the page was composed from `get_match_history` plus the
   * RLS-scoped `match_videos` read (completed matches only, no disputed ones,
   * no opponent photos, no highlight counts).
   */
  source: "rpc" | "fallback";
}

export interface MatchLibraryOptions {
  /** Page size, clamped 1..50 (the RPC clamps too). Default 20. */
  limit?: number;
  /** `next_before` of the previous page. */
  before?: string | null;
  /** Poster URL lifetime. Default 3600. */
  expiresInSeconds?: number;
}

/** The RPC is not deployed (older backend): PostgREST 404 or undefined function. */
export function isMissingRpcError(error: Pick<PostgrestError, "code"> | null | undefined): boolean {
  return error?.code === "PGRST202" || error?.code === "42883";
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asOutcome(value: unknown): LibraryOutcome {
  return value === "win" || value === "loss" || value === "draw" ? value : null;
}

function clampLimit(limit: number | undefined): number {
  const n = Math.floor(limit ?? 20);
  if (!Number.isFinite(n)) return 20;
  return Math.min(50, Math.max(1, n));
}

type RawRecord = Record<string, unknown>;

function toVideo(raw: RawRecord): Omit<MatchLibraryVideo, "poster_url"> | null {
  const video_id = str(raw.video_id);
  const uploaded_by = str(raw.uploaded_by);
  if (!video_id || !uploaded_by) return null;
  const status = str(raw.status) ?? "unknown";
  return {
    video_id,
    uploaded_by,
    status,
    playability: videoPlayability(status),
    thumbnail_key: str(raw.thumbnail_key),
    thumbnail_width: num(raw.thumbnail_width),
    thumbnail_height: num(raw.thumbnail_height),
    duration_seconds: num(raw.duration_seconds),
    has_analysis: raw.has_analysis === true,
    analysis_tier: str(raw.analysis_tier),
    chunk_count: num(raw.chunk_count),
    chunks_completed: num(raw.chunks_completed) ?? 0,
  };
}

function toItem(
  raw: RawRecord,
  viewerId: string,
): Omit<MatchLibraryItem, "videos"> & { videos: Omit<MatchLibraryVideo, "poster_url">[] } | null {
  const match_id = str(raw.match_id);
  if (!match_id) return null;
  const opp = raw.opponent as RawRecord | null | undefined;
  const oppId = opp ? str(opp.id) : null;
  const videos = (Array.isArray(raw.videos) ? raw.videos : [])
    .map((v) => (v && typeof v === "object" ? toVideo(v as RawRecord) : null))
    .filter((v): v is Omit<MatchLibraryVideo, "poster_url"> => v !== null);
  return {
    match_id,
    completed_at: str(raw.completed_at),
    match_type: str(raw.match_type),
    status: str(raw.status) ?? "completed",
    outcome: asOutcome(raw.outcome),
    submission_name: str(raw.submission_name),
    finish_time_seconds: num(raw.finish_time_seconds),
    duration_seconds: num(raw.duration_seconds),
    elo_before: num(raw.elo_before),
    elo_after: num(raw.elo_after),
    elo_delta: num(raw.elo_delta),
    opponent:
      opp && oppId
        ? {
            id: oppId,
            display_name: str(opp.display_name) ?? "Opponent",
            profile_photo_url: str(opp.profile_photo_url),
          }
        : null,
    videos: sortMatchVideosForViewer(videos, viewerId),
    highlight_count: num(raw.highlight_count) ?? 0,
  };
}

/** Sign every poster on the page in one storage call and attach it. */
async function withPosters(
  supabase: Client,
  items: ReturnType<typeof toItem>[],
  expiresInSeconds: number,
): Promise<MatchLibraryItem[]> {
  const present = items.filter((i): i is NonNullable<typeof i> => i !== null);
  const keys = present.flatMap((i) => i.videos.map((v) => v.thumbnail_key));
  const signed = await signPosterKeys(supabase, keys, expiresInSeconds);
  let cursor = 0;
  return present.map((item) => ({
    ...item,
    videos: item.videos.map((v) => ({ ...v, poster_url: signed[cursor++] ?? null })),
  }));
}

/**
 * Fallback for a backend without `get_my_match_library`: completed matches
 * from `get_match_history`, recordings from the RLS-scoped `match_videos`
 * read, paged client-side on `completed_at` so the caller's pagination works
 * the same way.
 */
async function composeFallbackPage(
  supabase: Client,
  viewerId: string,
  limit: number,
  before: string | null,
): Promise<Result<{ rows: RawRecord[]; next_before: string | null }>> {
  // Read directly rather than through getMatchHistory, which turns a failed
  // read into an empty list: here that would render as "no matches yet".
  const { data: historyData, error: historyError } = await supabase.rpc(
    "get_match_history",
    { p_athlete_id: viewerId },
  );
  if (historyError) {
    console.error("getMyMatchLibrary fallback history:", historyError);
    return { ok: false, error: mapPostgrestError(historyError, "match_library") };
  }
  const history = ((historyData ?? []) as MatchHistoryRow[])
    .filter((h) => !!h.completed_at && (!before || h.completed_at < before))
    .sort((a, b) => (a.completed_at < b.completed_at ? 1 : -1));
  const page = history.slice(0, limit);
  const next_before = history.length > limit ? page[page.length - 1].completed_at : null;
  if (page.length === 0) return { ok: true, data: { rows: [], next_before: null } };

  const { data: rows, error } = await supabase
    .from("match_videos")
    .select(
      "id, match_id, uploaded_by, status, thumbnail_url, duration_seconds, chunk_count, chunks_completed, requested_tier",
    )
    .in(
      "match_id",
      page.map((h) => h.match_id),
    )
    .neq("status", "deleted");
  if (error) {
    console.error("getMyMatchLibrary fallback videos:", error);
    return { ok: false, error: mapPostgrestError(error, "match_library") };
  }
  const byMatch = new Map<string, RawRecord[]>();
  for (const r of rows ?? []) {
    const list = byMatch.get(r.match_id) ?? [];
    list.push({
      video_id: r.id,
      uploaded_by: r.uploaded_by,
      status: r.status,
      thumbnail_key: r.thumbnail_url,
      duration_seconds: r.duration_seconds,
      has_analysis: r.status === "analyzed",
      analysis_tier: r.status === "analyzed" ? r.requested_tier : null,
      chunk_count: r.chunk_count,
      chunks_completed: r.chunks_completed,
    });
    byMatch.set(r.match_id, list);
  }
  const rowsOut: RawRecord[] = page.map((h) => ({
    match_id: h.match_id,
    completed_at: h.completed_at,
    match_type: h.match_type,
    status: "completed",
    outcome: h.athlete_outcome,
    submission_name: h.result === "submission" ? h.submission_type_display_name : null,
    finish_time_seconds: h.finish_time_seconds,
    duration_seconds: null,
    elo_before: h.elo_before,
    elo_after: h.elo_after,
    elo_delta: h.elo_delta,
    opponent: h.opponent_id
      ? { id: h.opponent_id, display_name: h.opponent_display_name, profile_photo_url: null }
      : null,
    videos: byMatch.get(h.match_id) ?? [],
    highlight_count: 0,
  }));
  return { ok: true, data: { rows: rowsOut, next_before } };
}

/**
 * One page of the caller's Film Room library, newest first
 * (`get_my_match_library`, BE B5). Every poster on the page is signed in a
 * single `createSignedUrls` call. When the RPC is not deployed yet the page is
 * composed from older reads instead (see `MatchLibraryPage.source`).
 *
 * `viewerId` is the caller's athlete id: it orders each item's videos (own
 * recording first) and keys the fallback's history read.
 */
export async function getMyMatchLibrary(
  supabase: Client,
  viewerId: string,
  opts?: MatchLibraryOptions,
): Promise<Result<MatchLibraryPage>> {
  const limit = clampLimit(opts?.limit);
  const before = opts?.before ?? null;
  const expires = opts?.expiresInSeconds ?? 3600;
  try {
    const args: { p_limit: number; p_before?: string } = { p_limit: limit };
    if (before) args.p_before = before;
    const { data, error } = await supabase.rpc("get_my_match_library", args);

    if (error && isMissingRpcError(error)) {
      const fallback = await composeFallbackPage(supabase, viewerId, limit, before);
      if (!fallback.ok) return fallback;
      const items = await withPosters(
        supabase,
        fallback.data.rows.map((r) => toItem(r, viewerId)),
        expires,
      );
      return {
        ok: true,
        data: { items, next_before: fallback.data.next_before, source: "fallback" },
      };
    }
    if (error) {
      console.error("getMyMatchLibrary:", error);
      return { ok: false, error: mapPostgrestError(error, "match_library") };
    }

    const payload = (data ?? {}) as { items?: unknown; next_before?: unknown };
    const rawItems = Array.isArray(payload.items) ? payload.items : [];
    const items = await withPosters(
      supabase,
      rawItems.map((r) => (r && typeof r === "object" ? toItem(r as RawRecord, viewerId) : null)),
      expires,
    );
    return {
      ok: true,
      data: { items, next_before: str(payload.next_before), source: "rpc" },
    };
  } catch (err) {
    console.error("getMyMatchLibrary:", err);
    const error: DomainError = {
      code: "UNKNOWN",
      message: err instanceof Error ? err.message : "Something went wrong.",
    };
    return { ok: false, error };
  }
}

// ---------------------------------------------------------------------------
// Merged video analysis (get_video_analysis)
// ---------------------------------------------------------------------------

export interface VideoTechniqueTag {
  id: string;
  technique_name: string;
  category: string | null;
  athlete_id: string | null;
  timestamp_start: number | null;
  timestamp_end: number | null;
  submission_type_name: string | null;
}

export interface VideoAnalysis {
  summary: string | null;
  /** "standard" | "premium" */
  analysis_tier: string | null;
  positions: AnalysisPosition[];
  scoring_moments: AnalysisScoringMoment[];
  technique_tags: VideoTechniqueTag[];
  completed_at: string | null;
}

/**
 * The latest completed analysis for one video (participant-gated
 * SECURITY DEFINER `get_video_analysis`).
 *
 *   { ok: true, data: VideoAnalysis }  a breakdown exists
 *   { ok: true, data: null }           no completed analysis (yet)
 *   { ok: false, error }               read failed or not a participant
 */
export async function getVideoAnalysis(
  supabase: Client,
  videoId: string,
): Promise<Result<VideoAnalysis | null>> {
  if (!isUuid(videoId)) return { ok: true, data: null };
  try {
    const { data, error } = await supabase.rpc("get_video_analysis", {
      p_video_id: videoId,
    });
    if (error) {
      console.error("getVideoAnalysis:", error);
      return { ok: false, error: mapPostgrestError(error, "video_analysis") };
    }
    const payload = (data ?? {}) as { analysis?: RawRecord | null; technique_tags?: unknown };
    const a = payload.analysis;
    if (!a || typeof a !== "object") return { ok: true, data: null };
    const tags = (Array.isArray(payload.technique_tags) ? payload.technique_tags : [])
      .filter((t): t is RawRecord => !!t && typeof t === "object")
      .map((t) => ({
        id: str(t.id) ?? "",
        technique_name: str(t.technique_name) ?? "",
        category: str(t.category),
        athlete_id: str(t.athlete_id),
        timestamp_start: num(t.timestamp_start),
        timestamp_end: num(t.timestamp_end),
        submission_type_name: str(t.submission_type_name),
      }))
      .filter((t) => t.technique_name.length > 0);
    return {
      ok: true,
      data: {
        summary: str(a.summary),
        analysis_tier: str(a.analysis_tier),
        positions: Array.isArray(a.positions) ? (a.positions as AnalysisPosition[]) : [],
        scoring_moments: Array.isArray(a.scoring_moments)
          ? (a.scoring_moments as AnalysisScoringMoment[])
          : [],
        technique_tags: tags,
        completed_at: str(a.completed_at),
      },
    };
  } catch (err) {
    console.error("getVideoAnalysis:", err);
    return {
      ok: false,
      error: {
        code: "UNKNOWN",
        message: err instanceof Error ? err.message : "Something went wrong.",
      },
    };
  }
}

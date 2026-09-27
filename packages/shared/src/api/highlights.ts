import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import {
  HIGHLIGHT_FREE_TEXT_MAX,
  type HighlightFeedbackChip,
} from "../constants/highlights";
import {
  domainErrorFromHint,
  mapPostgrestError,
  type DomainError,
  type Result,
} from "./errors";
import { highlightRpc, type RawHighlightProgress } from "./highlight-rpc";
import {
  isStorageObjectMissing,
  MATCH_VIDEO_BUCKET,
  signPosterKey,
} from "./queries";

/**
 * Highlight reels client layer (jr_be spec 014 section 9.5). The athlete's
 * OWN reel of one match video: progress, playback signing, feedback,
 * regeneration and retry. Nothing here shares or exports footage.
 */

type Client = SupabaseClient<Database>;

export type { HighlightFeedbackChip } from "../constants/highlights";

export type HighlightPhase =
  | "disabled"
  | "unavailable"
  | "waiting_for_analysis"
  | "planning"
  | "rendering"
  | "ready"
  | "regenerating"
  | "failed"
  | "invalidated"
  | "none";

export interface HighlightSegment {
  start_s: number;
  end_s: number;
  label?: string;
}

export type HighlightStatus = "pending" | "rendering" | "ready" | "failed" | "invalidated";
export type HighlightPlanStatus = "pending" | "planning" | "planned" | "failed" | "invalidated";

export interface HighlightPlayback {
  storagePath: string;
  posterPath: string | null;
  durationS: number;
  version: number;
  segments: HighlightSegment[];
  readyAt: string;
}

export interface HighlightProgress {
  matchVideoId: string;
  athleteId: string;
  enabled: boolean;
  phase: HighlightPhase;
  highlightId: string | null;
  status: HighlightStatus | null;
  planStatus: HighlightPlanStatus | null;
  renderTotal: number;
  renderMax: number;
  rendersRemaining: number;
  canRegenerate: boolean;
  lastAttemptFailed: boolean;
  playback: HighlightPlayback | null;
  errorMessage: string | null;
  identityDisputed: boolean;
  lastChangeSummary: string | null;
  updatedAt: string | null;
}

export interface HighlightPlaybackUrls {
  url: string;
  posterUrl: string | null;
  version: number;
  durationS: number;
}

export interface HighlightFeedbackParams {
  highlightId: string;
  rating: -1 | 1 | null;
  chips: HighlightFeedbackChip[];
  freeText: string | null;
}

export interface HighlightRegenerateResult {
  feedbackId: string;
  highlightId: string;
  renderTotal: number;
  rendersRemaining: number;
  changeSummary: string | null;
}

const PHASES: ReadonlySet<string> = new Set<HighlightPhase>([
  "disabled",
  "unavailable",
  "waiting_for_analysis",
  "planning",
  "rendering",
  "ready",
  "regenerating",
  "failed",
  "invalidated",
  "none",
]);

/** Phases in which the reel is still moving without realtime to tell us. */
export const HIGHLIGHT_ACTIVE_PHASES: ReadonlySet<HighlightPhase> = new Set<HighlightPhase>([
  "waiting_for_analysis",
  "planning",
  "rendering",
  "regenerating",
]);

function num(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function segmentsFrom(value: unknown): HighlightSegment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const s = raw as Record<string, unknown>;
    const seg: HighlightSegment = { start_s: num(s.start_s), end_s: num(s.end_s) };
    if (typeof s.label === "string" && s.label) seg.label = s.label;
    return [seg];
  });
}

/**
 * snake_case JSONB to the camelCase surface. An unknown phase (a newer
 * backend) degrades to "unavailable", which the UI renders as nothing.
 */
export function toHighlightProgress(raw: RawHighlightProgress): HighlightProgress {
  const p = raw.playback;
  return {
    matchVideoId: raw.match_video_id,
    athleteId: raw.athlete_id,
    enabled: raw.enabled === true,
    phase: PHASES.has(raw.phase) ? (raw.phase as HighlightPhase) : "unavailable",
    highlightId: raw.highlight_id ?? null,
    status: (raw.status ?? null) as HighlightStatus | null,
    planStatus: (raw.plan_status ?? null) as HighlightPlanStatus | null,
    renderTotal: num(raw.render_total),
    renderMax: num(raw.render_max),
    rendersRemaining: Math.max(num(raw.renders_remaining), 0),
    canRegenerate: raw.can_regenerate === true,
    lastAttemptFailed: raw.last_attempt_failed === true,
    playback: p
      ? {
          storagePath: p.storage_path,
          posterPath: p.poster_path ?? null,
          durationS: num(p.duration_s),
          version: num(p.version),
          segments: segmentsFrom(p.segments),
          readyAt: p.ready_at,
        }
      : null,
    errorMessage: raw.error_message ?? null,
    identityDisputed: raw.identity_disputed === true,
    lastChangeSummary: raw.last_change_summary ?? null,
    updatedAt: raw.updated_at ?? null,
  };
}

function unexpected(context: string, err: unknown): DomainError {
  console.error(`${context}:`, err);
  return {
    code: "UNKNOWN",
    message: err instanceof Error ? err.message : "Something went wrong.",
  };
}

/** Trimmed, capped free text; blank becomes null. */
function normalizeFreeText(text: string | null): string | null {
  const trimmed = (text ?? "").trim().slice(0, HIGHLIGHT_FREE_TEXT_MAX).trim();
  return trimmed ? trimmed : null;
}

/** The caller's own reel state for one match video (`get_highlight_progress`). */
export async function getHighlightProgress(
  supabase: Client,
  matchVideoId: string,
): Promise<Result<HighlightProgress>> {
  try {
    const { data, error } = await highlightRpc(supabase, "get_highlight_progress", {
      p_match_video_id: matchVideoId,
    });
    if (error) return { ok: false, error: mapPostgrestError(error, "highlight_progress") };
    if (!data || typeof data !== "object") {
      return { ok: false, error: { code: "UNKNOWN", message: "No highlight progress returned." } };
    }
    return { ok: true, data: toHighlightProgress(data) };
  } catch (err) {
    return { ok: false, error: unexpected("getHighlightProgress", err) };
  }
}

/**
 * Sign the LIVE render (never the in-flight `storage_path`) and its poster in
 * the private match-videos bucket. The poster is best effort (null on any
 * failure); a missing video object maps to VIDEO_FILE_MISSING.
 */
export async function signHighlightPlayback(
  supabase: Client,
  playback: HighlightPlayback,
  expiresInSeconds = 3600,
): Promise<Result<HighlightPlaybackUrls>> {
  try {
    const [{ data: signed, error: signError }, posterUrl] = await Promise.all([
      supabase.storage
        .from(MATCH_VIDEO_BUCKET)
        .createSignedUrl(playback.storagePath, expiresInSeconds),
      signPosterKey(supabase, playback.posterPath, expiresInSeconds),
    ]);
    if (signError) {
      if (isStorageObjectMissing(signError)) {
        return {
          ok: false,
          error: { code: "VIDEO_FILE_MISSING", message: "The highlight file was not found." },
        };
      }
      return { ok: false, error: { code: "UNKNOWN", message: signError.message } };
    }
    if (!signed?.signedUrl) {
      return { ok: false, error: { code: "UNKNOWN", message: "Storage returned no signed URL." } };
    }
    return {
      ok: true,
      data: {
        url: signed.signedUrl,
        posterUrl,
        version: playback.version,
        durationS: playback.durationS,
      },
    };
  } catch (err) {
    return { ok: false, error: unexpected("signHighlightPlayback", err) };
  }
}

/** Rating / chips / text WITHOUT regenerating (`submit_highlight_feedback`). */
export async function submitHighlightFeedback(
  supabase: Client,
  params: HighlightFeedbackParams,
): Promise<Result<{ feedbackId: string }>> {
  try {
    const { data, error } = await highlightRpc(supabase, "submit_highlight_feedback", {
      p_highlight_id: params.highlightId,
      p_rating: params.rating,
      p_chips: [...params.chips],
      p_free_text: normalizeFreeText(params.freeText),
    });
    if (error) return { ok: false, error: mapPostgrestError(error, "highlight_feedback") };
    if (typeof data !== "string" || !data) {
      return { ok: false, error: { code: "UNKNOWN", message: "No feedback id returned." } };
    }
    return { ok: true, data: { feedbackId: data } };
  } catch (err) {
    return { ok: false, error: unexpected("submitHighlightFeedback", err) };
  }
}

/** Re-arm a FAILED reel with the same segments (`retry_highlight_render`). */
export async function retryHighlightRender(
  supabase: Client,
  highlightId: string,
): Promise<Result<{ highlightId: string }>> {
  try {
    const { data, error } = await highlightRpc(supabase, "retry_highlight_render", {
      p_highlight_id: highlightId,
    });
    if (error) return { ok: false, error: mapPostgrestError(error, "highlight_retry") };
    return { ok: true, data: { highlightId: typeof data === "string" && data ? data : highlightId } };
  } catch (err) {
    return { ok: false, error: unexpected("retryHighlightRender", err) };
  }
}

/** HTTP status fallback when an edge-function error body carries no hint. */
function hintForStatus(status: number | undefined): string | null {
  if (status === 401) return "highlight_no_athlete";
  return null;
}

/**
 * Read a functions-js error. A FunctionsHttpError carries the Response in
 * `context`; its JSON body is `{ ok: false, error: { hint, message } }`
 * (spec 9.3). A non-JSON body, a relay or a fetch error is UNKNOWN (except a
 * bare 401, which is the gateway rejecting the JWT).
 */
async function domainErrorFromFunctionsError(error: unknown): Promise<DomainError> {
  const e = error as { message?: string; context?: unknown } | null;
  const ctx = e?.context as { status?: number; json?: () => Promise<unknown> } | undefined;
  const fallback = e?.message || "Something went wrong.";
  if (!ctx || typeof ctx.json !== "function") return { code: "UNKNOWN", message: fallback };
  let body: unknown;
  try {
    body = await ctx.json();
  } catch {
    return { code: "UNKNOWN", message: fallback };
  }
  const bodyError = (body as { error?: { hint?: unknown; message?: unknown } } | null)?.error;
  const hint = typeof bodyError?.hint === "string" ? bodyError.hint : hintForStatus(ctx.status);
  const message = typeof bodyError?.message === "string" ? bodyError.message : fallback;
  return domainErrorFromHint(hint, message);
}

interface RegenerateResponseBody {
  ok?: boolean;
  feedback_id?: unknown;
  highlight_id?: unknown;
  render_total?: unknown;
  renders_remaining?: unknown;
  change_summary?: unknown;
  error?: { hint?: unknown; message?: unknown };
}

/**
 * Store feedback AND ask the AI for a new cut (edge function
 * `highlight-regenerate`, spec 9.3). Can take ~30 s of model time.
 */
export async function regenerateHighlight(
  supabase: Client,
  params: HighlightFeedbackParams,
): Promise<Result<HighlightRegenerateResult>> {
  try {
    const { data, error } = await supabase.functions.invoke<RegenerateResponseBody>(
      "highlight-regenerate",
      {
        body: {
          highlight_id: params.highlightId,
          rating: params.rating,
          chips: [...params.chips],
          free_text: normalizeFreeText(params.freeText),
        },
      },
    );
    if (error) return { ok: false, error: await domainErrorFromFunctionsError(error) };
    if (!data || typeof data !== "object" || data.ok !== true) {
      const hint = typeof data?.error?.hint === "string" ? data.error.hint : null;
      const message = typeof data?.error?.message === "string" ? data.error.message : null;
      return { ok: false, error: domainErrorFromHint(hint, message) };
    }
    return {
      ok: true,
      data: {
        feedbackId: String(data.feedback_id ?? ""),
        highlightId: String(data.highlight_id ?? params.highlightId),
        renderTotal: num(data.render_total),
        rendersRemaining: Math.max(num(data.renders_remaining), 0),
        changeSummary: typeof data.change_summary === "string" ? data.change_summary : null,
      },
    };
  } catch (err) {
    return { ok: false, error: unexpected("regenerateHighlight", err) };
  }
}

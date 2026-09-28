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
import { toMatchDetected, toNoMatchReason } from "../utils/match-detection";
import {
  isStorageObjectMissing,
  MATCH_VIDEO_BUCKET,
  signPosterKey,
} from "./queries";

/**
 * Highlight reels client layer (jr_be spec 015 section 9.5). The athlete's
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
  | "none"
  /**
   * The analysis found no jiu-jitsu in the video (jr_be-0qf), so no reel
   * will be made. Not a failure: no error, no actions.
   */
  | "no_match";

export interface HighlightSegment {
  start_s: number;
  end_s: number;
  label?: string;
}

export type HighlightStatus = "pending" | "rendering" | "ready" | "failed" | "invalidated";
export type HighlightPlanStatus = "pending" | "planning" | "planned" | "failed" | "invalidated";
/** Which athlete the latest applied regeneration built the reel from. */
export type HighlightIdentitySide = "own" | "swapped" | "mixed";

/**
 * `get_highlight_progress(p_match_video_id)` JSONB (jr_be spec 015 section
 * 9.1), snake_case. Generated types give it as `Json`; `toHighlightProgress`
 * narrows every text column to its union at this boundary.
 */
export interface RawHighlightProgress {
  match_video_id: string;
  athlete_id: string;
  enabled: boolean;
  phase: string;
  highlight_id: string | null;
  status: string | null;
  plan_status: string | null;
  render_total: number;
  render_max: number;
  renders_remaining: number;
  can_regenerate: boolean;
  last_attempt_failed: boolean;
  playback: {
    storage_path: string;
    poster_path: string | null;
    duration_s: number | string;
    version: number;
    segments: unknown;
    ready_at: string;
  } | null;
  error_message: string | null;
  identity_disputed: boolean;
  /** Additive key from B1 (not in the spec 9.1 list); may be absent. */
  identity_side?: string | null;
  last_change_summary: string | null;
  updated_at: string | null;
  /** jr_be-0qf (additive): true | false | null; absent on an older backend. */
  match_detected?: boolean | null;
  /** Model-written plain text, only when match_detected is false. */
  no_match_reason?: string | null;
}

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
  identitySide: HighlightIdentitySide | null;
  lastChangeSummary: string | null;
  updatedAt: string | null;
  /**
   * Did the video's analysis find a match? true / false, or null when
   * unknown (legacy analysis, not analysed yet, or an older backend).
   */
  matchDetected: boolean | null;
  /** Plain text (never markup), set only when `matchDetected` is false. */
  noMatchReason: string | null;
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

const STATUSES: ReadonlySet<string> = new Set<HighlightStatus>([
  "pending",
  "rendering",
  "ready",
  "failed",
  "invalidated",
]);
const PLAN_STATUSES: ReadonlySet<string> = new Set<HighlightPlanStatus>([
  "pending",
  "planning",
  "planned",
  "failed",
  "invalidated",
]);
const IDENTITY_SIDES: ReadonlySet<string> = new Set<HighlightIdentitySide>(["own", "swapped", "mixed"]);

/** `value` when it is one of `allowed`, else null. */
function oneOf<T extends string>(allowed: ReadonlySet<string>, value: unknown): T | null {
  return typeof value === "string" && allowed.has(value) ? (value as T) : null;
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
  "no_match",
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
  // A playback object without a key cannot be signed: treat as no live version.
  const p = raw.playback && typeof raw.playback.storage_path === "string" && raw.playback.storage_path
    ? raw.playback
    : null;
  const matchDetected = toMatchDetected(raw.match_detected);
  return {
    matchVideoId: raw.match_video_id,
    athleteId: raw.athlete_id,
    enabled: raw.enabled === true,
    phase: PHASES.has(raw.phase) ? (raw.phase as HighlightPhase) : "unavailable",
    highlightId: raw.highlight_id ?? null,
    status: oneOf<HighlightStatus>(STATUSES, raw.status),
    planStatus: oneOf<HighlightPlanStatus>(PLAN_STATUSES, raw.plan_status),
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
    identitySide: oneOf<HighlightIdentitySide>(IDENTITY_SIDES, raw.identity_side),
    lastChangeSummary: raw.last_change_summary ?? null,
    updatedAt: raw.updated_at ?? null,
    matchDetected,
    noMatchReason: toNoMatchReason(matchDetected, raw.no_match_reason),
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
    const { data, error } = await supabase.rpc("get_highlight_progress", {
      p_match_video_id: matchVideoId,
    });
    if (error) return { ok: false, error: mapPostgrestError(error, "highlight_progress") };
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return { ok: false, error: { code: "UNKNOWN", message: "No highlight progress returned." } };
    }
    return { ok: true, data: toHighlightProgress(data as unknown as RawHighlightProgress) };
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
    // Nulls are omitted: the SQL defaults (NULL rating, '{}' chips, NULL
    // text) apply, and the generated Args type has no `null` for them.
    const freeText = normalizeFreeText(params.freeText);
    const { data, error } = await supabase.rpc("submit_highlight_feedback", {
      p_highlight_id: params.highlightId,
      p_chips: [...params.chips],
      ...(params.rating !== null ? { p_rating: params.rating } : {}),
      ...(freeText !== null ? { p_free_text: freeText } : {}),
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
    const { data, error } = await supabase.rpc("retry_highlight_render", {
      p_highlight_id: highlightId,
    });
    if (error) return { ok: false, error: mapPostgrestError(error, "highlight_retry") };
    return { ok: true, data: { highlightId: typeof data === "string" && data ? data : highlightId } };
  } catch (err) {
    return { ok: false, error: unexpected("retryHighlightRender", err) };
  }
}

/**
 * Client-side cap on the regenerate call. The function's own AI budget is
 * ~30 s plus a repair retry; past this the outcome is unknown (the server may
 * already have armed the render), which is reported as HIGHLIGHT_REGEN_TIMEOUT.
 */
export const HIGHLIGHT_REGENERATE_TIMEOUT_MS = 90_000;

/** HTTP status fallback when an edge-function error body carries no hint. */
function hintForStatus(status: number | undefined): string | null {
  if (status === 401) return "highlight_no_athlete";
  return null;
}

/**
 * Read a functions-js error. A FunctionsHttpError carries the Response in
 * `context`; its JSON body is `{ ok: false, error: { hint, message } }`
 * (spec 9.3). With `verify_jwt = true` the Supabase gateway rejects a
 * missing/expired JWT with ITS OWN 401 body (no envelope), so any 401 without
 * a hint means signed out (ATHLETE_NOT_FOUND). Any other non-envelope body,
 * a relay or a fetch error is UNKNOWN.
 */
/**
 * No response was received, so the outcome is unknown (the server may have
 * armed the render): our 90 s abort, or ANY fetch failure functions-js wraps
 * in a FunctionsFetchError (e.g. iOS's native ~60 s "Network request failed").
 * An HTTP error response is a FunctionsHttpError and is mapped by its body.
 */
function isNoResponse(error: unknown): boolean {
  const e = error as { name?: string; context?: { name?: string } } | null;
  if (e?.name === "FunctionsFetchError") return true;
  const inner = e?.context?.name ?? e?.name;
  return inner === "AbortError" || inner === "TimeoutError";
}

async function domainErrorFromFunctionsError(error: unknown): Promise<DomainError> {
  if (isNoResponse(error)) {
    return { code: "HIGHLIGHT_REGEN_TIMEOUT", message: "Still working on it. Check back in a minute." };
  }
  const e = error as { message?: string; context?: unknown } | null;
  const ctx = e?.context as { status?: number; json?: () => Promise<unknown> } | undefined;
  const fallback = e?.message || "Something went wrong.";
  if (!ctx || typeof ctx.json !== "function") return { code: "UNKNOWN", message: fallback };
  let body: unknown;
  try {
    body = await ctx.json();
  } catch {
    // Not our envelope. A 401 is still the gateway refusing the JWT
    // (verify_jwt = true answers with its own body), i.e. signed out.
    return domainErrorFromHint(hintForStatus(ctx.status), fallback);
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
        timeout: HIGHLIGHT_REGENERATE_TIMEOUT_MS,
      },
    );
    if (error) return { ok: false, error: await domainErrorFromFunctionsError(error) };
    if (!data || typeof data !== "object" || data.ok !== true) {
      const hint = typeof data?.error?.hint === "string" ? data.error.hint : null;
      const message = typeof data?.error?.message === "string" ? data.error.message : null;
      return { ok: false, error: domainErrorFromHint(hint, message) };
    }
    if (typeof data.feedback_id !== "string" || !data.feedback_id) {
      return { ok: false, error: { code: "UNKNOWN", message: "No feedback id returned." } };
    }
    return {
      ok: true,
      data: {
        feedbackId: data.feedback_id,
        highlightId: typeof data.highlight_id === "string" && data.highlight_id ? data.highlight_id : params.highlightId,
        renderTotal: num(data.render_total),
        rendersRemaining: Math.max(num(data.renders_remaining), 0),
        changeSummary: typeof data.change_summary === "string" ? data.change_summary : null,
      },
    };
  } catch (err) {
    return { ok: false, error: unexpected("regenerateHighlight", err) };
  }
}

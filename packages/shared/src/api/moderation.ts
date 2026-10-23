/**
 * Report, block and AI processing consent (jr_be-m2s, App Store Review
 * guidelines 1.2 and 5.1.2(i); jits-rog5.4 / jits-rog5.11).
 *
 * - `block_athlete` / `unblock_athlete`: a block cancels the pair's pending
 *   challenges and removes the friendship; the server then refuses a new
 *   challenge between them (HINT `blocked`) and `get_arena_nearby` leaves
 *   them out of each other's Arena.
 * - `get_my_blocked_athletes`: the athletes I blocked (Settings, Blocked
 *   athletes). `get_my_block_ids`: every athlete in a block with me, either
 *   direction (the client-side filter).
 * - `report_content`: one report of an athlete, a match video or a highlight
 *   reel, reviewed by the team within 24 hours.
 * - `record_ai_processing_consent`: the explicit "Allow and film" before any
 *   match video is sent to Google Gemini (and stills to OpenAI).
 *
 * Results never throw; a failure is `{ ok: false, error: { hint, message } }`
 * and the caller maps the hint to its own copy.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

type Client = SupabaseClient<Database>;

export type ModerationResult<T> = { ok: true; data: T } | { ok: false; error: { hint: string; message: string } };

/** What a report can be about (`report_content.p_target_type`). */
export type ReportTargetType = "athlete" | "match_video" | "highlight";

/** The report reasons, in the order the sheet lists them (`report_content.p_reason`). */
export const REPORT_REASONS = ["inappropriate", "harassment", "impersonation", "spam", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** `report_content.p_details` is capped at this many characters. */
export const REPORT_DETAILS_MAX = 1000;

/**
 * The consent text version the app shows (`record_ai_processing_consent.p_version`).
 * Bump it whenever the "Before you film" text changes: consent to any other
 * version reads as no consent, so everyone is asked again. "2026-10-23": the
 * timekeeper's plain-language body (jits-o47s.46). The server only stores the
 * string; its timekeeper backstop checks that consent exists, not its version.
 */
export const AI_PROCESSING_CONSENT_VERSION = "2026-10-23";

export interface BlockedAthlete {
  athlete_id: string;
  display_name: string;
  blocked_at: string;
}

export interface AiProcessingConsent {
  /** When the athlete tapped "Allow and film"; null when never given. */
  consentAt: string | null;
  version: string | null;
}

type RawError = { message?: string; hint?: string | null } | null;

function fail<T>(error: RawError): ModerationResult<T> {
  return { ok: false, error: { hint: error?.hint || "unknown", message: error?.message ?? "" } };
}

function thrown<T>(err: unknown): ModerationResult<T> {
  return { ok: false, error: { hint: "unknown", message: err instanceof Error ? err.message : String(err) } };
}

export async function blockAthlete(supabase: Client, athleteId: string): Promise<ModerationResult<void>> {
  try {
    const { error } = await supabase.rpc("block_athlete", { p_athlete_id: athleteId });
    if (error) return fail(error);
    return { ok: true, data: undefined };
  } catch (err) {
    return thrown(err);
  }
}

export async function unblockAthlete(supabase: Client, athleteId: string): Promise<ModerationResult<void>> {
  try {
    const { error } = await supabase.rpc("unblock_athlete", { p_athlete_id: athleteId });
    if (error) return fail(error);
    return { ok: true, data: undefined };
  } catch (err) {
    return thrown(err);
  }
}

/** Keep only well-formed rows, most recent block first. */
export function parseBlockedAthletes(data: unknown): BlockedAthlete[] | null {
  if (data == null) return [];
  if (!Array.isArray(data)) return null;
  const out: BlockedAthlete[] = [];
  for (const raw of data as Record<string, unknown>[]) {
    if (!raw || typeof raw.athlete_id !== "string") continue;
    out.push({
      athlete_id: raw.athlete_id,
      display_name: typeof raw.display_name === "string" ? raw.display_name : "",
      blocked_at: typeof raw.blocked_at === "string" ? raw.blocked_at : "",
    });
  }
  return out.sort((a, b) => b.blocked_at.localeCompare(a.blocked_at));
}

export async function getMyBlockedAthletes(supabase: Client): Promise<ModerationResult<BlockedAthlete[]>> {
  try {
    const { data, error } = await supabase.rpc("get_my_blocked_athletes");
    if (error) return fail(error);
    const rows = parseBlockedAthletes(data);
    if (!rows) return { ok: false, error: { hint: "unknown", message: "Unexpected blocked athletes response." } };
    return { ok: true, data: rows };
  } catch (err) {
    return thrown(err);
  }
}

/**
 * `setof uuid` comes back as an array of strings (PostgREST may also wrap a
 * scalar set as objects keyed by the function name; both are accepted).
 */
export function parseBlockIds(data: unknown): string[] | null {
  if (data == null) return [];
  if (!Array.isArray(data)) return null;
  const out: string[] = [];
  for (const raw of data as unknown[]) {
    if (typeof raw === "string" && raw) out.push(raw);
    else if (raw && typeof raw === "object") {
      const v = (raw as Record<string, unknown>).get_my_block_ids ?? (raw as Record<string, unknown>).athlete_id;
      if (typeof v === "string" && v) out.push(v);
    }
  }
  return out;
}

export async function getMyBlockIds(supabase: Client): Promise<ModerationResult<string[]>> {
  try {
    const { data, error } = await supabase.rpc("get_my_block_ids");
    if (error) return fail(error);
    const ids = parseBlockIds(data);
    if (!ids) return { ok: false, error: { hint: "unknown", message: "Unexpected block ids response." } };
    return { ok: true, data: ids };
  } catch (err) {
    return thrown(err);
  }
}

export interface ReportContentInput {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  /** Optional free text; trimmed, empty is omitted, capped at REPORT_DETAILS_MAX. */
  details?: string | null;
}

/** Trim the details; empty is null; never longer than the server cap. */
export function normalizeReportDetails(details: string | null | undefined): string | null {
  const t = (details ?? "").trim();
  return t ? t.slice(0, REPORT_DETAILS_MAX) : null;
}

/** Returns the new report's id. */
export async function reportContent(supabase: Client, input: ReportContentInput): Promise<ModerationResult<string>> {
  try {
    const details = normalizeReportDetails(input.details);
    const { data, error } = await supabase.rpc("report_content", {
      p_target_type: input.targetType,
      p_target_id: input.targetId,
      p_reason: input.reason,
      ...(details !== null ? { p_details: details } : {}),
    });
    if (error) return fail(error);
    return { ok: true, data: typeof data === "string" ? data : "" };
  } catch (err) {
    return thrown(err);
  }
}

/** Record "Allow and film"; returns the stored consent time. */
export async function recordAiProcessingConsent(
  supabase: Client,
  version: string = AI_PROCESSING_CONSENT_VERSION,
): Promise<ModerationResult<string>> {
  try {
    const { data, error } = await supabase.rpc("record_ai_processing_consent", { p_version: version });
    if (error) return fail(error);
    return { ok: true, data: typeof data === "string" && data ? data : new Date().toISOString() };
  } catch (err) {
    return thrown(err);
  }
}

/**
 * The signed-in athlete's consent, read on its own (never through the
 * athlete guard select, so an older backend without the columns cannot break
 * sign-in).
 */
export async function getAiProcessingConsent(
  supabase: Client,
  athleteId: string,
): Promise<ModerationResult<AiProcessingConsent>> {
  try {
    const { data, error } = await supabase
      .from("athletes")
      .select("ai_processing_consent_at, ai_processing_consent_version")
      .eq("id", athleteId)
      .maybeSingle();
    if (error) return fail(error);
    return {
      ok: true,
      data: {
        consentAt: data?.ai_processing_consent_at ?? null,
        version: data?.ai_processing_consent_version ?? null,
      },
    };
  } catch (err) {
    return thrown(err);
  }
}

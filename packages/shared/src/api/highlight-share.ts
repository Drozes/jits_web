// STUB (replaced by feat/hl-p2-core at merge)
//
// Minimal typed stand-in for the F4 share-funnel layer (jr_be spec 014
// section 16.5), so the F7 discovery slice (feat/hl-p2-discovery) typechecks
// and bundles before feat/hl-p2-core lands. Signatures match 16.5 exactly.
// Every function fails closed: flags/reads report { ok: false } (callers treat
// that as "clips disabled, nothing to show"), telemetry is a no-op. Tests mock
// this module. The orchestrator deletes this file when merging core.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import type { Result } from "./errors";

type Client = SupabaseClient<Database>;

export interface HighlightFlags { clipsEnabled: boolean; shareEnabled: boolean }
export interface MyHighlightItem {
  highlightId: string; matchId: string; matchVideoId: string; version: number; durationS: number;
  posterPath: string | null; readyAt: string; opponentName: string | null;
  matchType: "ranked" | "casual"; outcome: "win" | "loss" | "draw" | null; playedAt: string;
  notifiedAt: string | null; unseen: boolean;
}
export interface MyHighlights { clipsEnabled: boolean; shareEnabled: boolean; items: MyHighlightItem[] }
export interface HighlightCaptionContext {
  athleteName: string; opponentName: string | null; matchType: "ranked" | "casual";
  outcome: "win" | "loss" | "draw" | null; eloAfter: number | null; eloDelta: number | null;
  technique: string | null; playedAt: string;
}
export interface HighlightDetail {
  highlightId: string; matchVideoId: string; matchId: string; version: number | null;
  clipsEnabled: boolean; shareEnabled: boolean; caption: HighlightCaptionContext;
}
export interface HighlightShareSource { highlightId: string; version: number; storagePath: string; durationS: number; fileName: string }
export type HighlightShareStep =
  | "viewer_opened" | "share_tapped" | "caption_copied" | "download_ok" | "download_failed"
  | "reels_handoff_ok" | "reels_handoff_failed" | "returned_from_instagram"
  | "share_sheet_opened" | "share_sheet_failed"
  | "saved_to_photos" | "save_failed" | "save_permission_denied"
  | "improve_tapped" | "home_card_tapped" | "home_card_dismissed"
  | "notification_opened" | "profile_row_tapped";
export type HighlightShareSourceTag = "push" | "bell" | "home" | "profile" | "match_detail" | "summary";

function stubFailure<T>(name: string): Promise<Result<T>> {
  return Promise.resolve({
    ok: false,
    error: { code: "UNKNOWN", message: `${name} is a stub until feat/hl-p2-core merges.` },
  });
}

export function getHighlightFlags(_supabase: Client): Promise<Result<HighlightFlags>> {
  return stubFailure("getHighlightFlags");
}

export function getMyHighlights(
  _supabase: Client,
  _opts?: { limit?: number; before?: string; unseenOnly?: boolean },
): Promise<Result<MyHighlights>> {
  return stubFailure("getMyHighlights");
}

export function getHighlightDetail(_supabase: Client, _highlightId: string): Promise<Result<HighlightDetail>> {
  return stubFailure("getHighlightDetail");
}

export function markHighlightSeen(_supabase: Client, _highlightId: string, _version: number): Promise<Result<null>> {
  return stubFailure("markHighlightSeen");
}

export function prepareHighlightShare(_supabase: Client, _highlightId: string): Promise<Result<HighlightShareSource>> {
  return stubFailure("prepareHighlightShare");
}

export function signHighlightDownload(
  _supabase: Client,
  _storagePath: string,
  _expiresInSeconds?: number,
): Promise<Result<{ url: string }>> {
  return stubFailure("signHighlightDownload");
}

export function logHighlightShareEvent(
  _supabase: Client,
  _highlightId: string,
  _step: HighlightShareStep,
  _detail?: Record<string, string | number | boolean | null>,
): Promise<void> {
  return Promise.resolve();
}

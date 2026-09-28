// STUB (replaced by feat/hl-p2-core at merge)
// Minimal typed stand-in for the F4 shared wrappers (jr_be spec 014 section
// 16.5) so feat/hl-p2-viewer typechecks. Signatures are copied verbatim from
// the spec; bodies do nothing. Delete this file when merging feat/hl-p2-core.
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

const STUB = { ok: false as const, error: { code: "UNKNOWN" as const, message: "stub" } };

export async function getHighlightFlags(_s: Client): Promise<Result<HighlightFlags>> { return STUB; }
export async function getMyHighlights(
  _s: Client, _opts?: { limit?: number; before?: string; unseenOnly?: boolean },
): Promise<Result<MyHighlights>> { return STUB; }
export async function getHighlightDetail(_s: Client, _id: string): Promise<Result<HighlightDetail>> { return STUB; }
export async function markHighlightSeen(_s: Client, _id: string, _v: number): Promise<Result<null>> { return STUB; }
export async function prepareHighlightShare(_s: Client, _id: string): Promise<Result<HighlightShareSource>> { return STUB; }
export async function signHighlightDownload(
  _s: Client, _path: string, _expiresInSeconds?: number,
): Promise<Result<{ url: string }>> { return STUB; }
export async function logHighlightShareEvent(
  _s: Client, _id: string, _step: HighlightShareStep,
  _detail?: Record<string, string | number | boolean | null>,
): Promise<void> {}

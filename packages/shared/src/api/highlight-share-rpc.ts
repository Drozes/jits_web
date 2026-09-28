import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

/**
 * HAND-WRITTEN RPC TYPES for the phase-2 share funnel (jr_be spec 014
 * section 16.3, migration `20260929000000_highlight_share_funnel.sql`).
 *
 * TODO(jits-s6mi.12): delete this file once `npm run db:types` has been run
 * against a stack with B9 applied. Then `highlight-share.ts` calls
 * `supabase.rpc(...)` directly with the generated Args/Returns and the
 * `Raw*` shapes below stay only as the JSONB narrowing types. This is the
 * ONLY place that knows the functions are not in `database.ts` yet.
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

/** Argument names exactly as the SQL declares them. */
export interface HighlightShareRpcArgs {
  get_highlight_flags: Record<string, never>;
  get_my_highlights: { p_limit?: number; p_before?: string; p_unseen_only?: boolean };
  get_highlight_detail: { p_highlight_id: string };
  mark_highlight_seen: { p_highlight_id: string; p_version: number };
  prepare_highlight_share: { p_highlight_id: string };
  log_highlight_share_event: {
    p_highlight_id: string;
    p_step: string;
    p_detail?: Record<string, string | number | boolean | null>;
  };
}

export type HighlightShareRpcName = keyof HighlightShareRpcArgs;

interface LooseRpcClient {
  rpc(
    fn: string,
    args?: object,
  ): PromiseLike<{ data: unknown; error: PostgrestError | null }>;
}

/**
 * `supabase.rpc` for a phase-2 function the generated types do not list yet.
 * The name and argument keys are still checked against the table above.
 */
export function callHighlightShareRpc<N extends HighlightShareRpcName>(
  supabase: SupabaseClient<Database>,
  fn: N,
  args: HighlightShareRpcArgs[N],
): PromiseLike<{ data: unknown; error: PostgrestError | null }> {
  return (supabase as unknown as LooseRpcClient).rpc(fn, args);
}

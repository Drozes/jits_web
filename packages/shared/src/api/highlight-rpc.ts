import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

/**
 * Hand-written wire types for the highlight reel RPCs (jr_be spec 014,
 * sections 5.9, 9.1 and 9.3), isolated here so exactly one file knows that
 * the generated `Database` type does not have them yet.
 *
 * TODO(jits-s6mi.9): once jr_be B1 (`jr_be-15c.11`) is applied to the local
 * stack, run `npm run db:types` from the repo root, then delete
 * `HighlightRpcFunctions` and the cast in `highlightRpc`, and call
 * `supabase.rpc(...)` directly from `highlights.ts`. The Returns of the two
 * JSONB/UUID functions will come back as `Json` / `string`; keep
 * `RawHighlightProgress` as the parse target for `get_highlight_progress`.
 */

type Client = SupabaseClient<Database>;

/** `get_highlight_progress(p_match_video_id)` JSONB, snake_case (spec 9.1). */
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
  last_change_summary: string | null;
  updated_at: string | null;
}

/** The client-callable highlight RPCs and their exact argument names. */
export interface HighlightRpcFunctions {
  get_highlight_progress: {
    Args: { p_match_video_id: string };
    Returns: RawHighlightProgress;
  };
  submit_highlight_feedback: {
    Args: {
      p_highlight_id: string;
      p_rating: -1 | 1 | null;
      p_chips: string[];
      p_free_text: string | null;
    };
    /** The new feedback row id. */
    Returns: string;
  };
  retry_highlight_render: {
    Args: { p_highlight_id: string };
    /** The highlight id. */
    Returns: string;
  };
}

export type HighlightRpcName = keyof HighlightRpcFunctions;

/**
 * Call one of the highlight RPCs with its hand-written types. The cast is
 * the only place the missing generated types are papered over.
 */
export function highlightRpc<N extends HighlightRpcName>(
  supabase: Client,
  fn: N,
  args: HighlightRpcFunctions[N]["Args"],
): PromiseLike<{
  data: HighlightRpcFunctions[N]["Returns"] | null;
  error: PostgrestError | null;
}> {
  const rpc = supabase.rpc as unknown as (
    this: Client,
    name: string,
    params: HighlightRpcFunctions[N]["Args"],
  ) => PromiseLike<{
    data: HighlightRpcFunctions[N]["Returns"] | null;
    error: PostgrestError | null;
  }>;
  return rpc.call(supabase, fn, args);
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import { mapPostgrestError, type Result } from "./errors";

type Client = SupabaseClient<Database>;

/** An athlete the viewer moved past on the Rankings board with this match. */
export interface RankPassedAthlete {
  athlete_id: string;
  display_name: string;
}

/**
 * The viewer's Rankings position before and after one match, from
 * `get_match_rank_change(p_match_id)` (jr_be B6). Ranks are 1-based and null
 * when the viewer is unranked on that side of the match. `passed` holds at
 * most three athletes whose current rating sits between the viewer's
 * `elo_before` and `elo_after`.
 */
export interface MatchRankChange {
  rank_before: number | null;
  rank_after: number | null;
  passed: RankPassedAthlete[];
}

function toRank(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : null;
}

/** Shape the raw RPC json defensively: every field is optional in practice. */
export function parseMatchRankChange(raw: unknown): MatchRankChange | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const passed = Array.isArray(r.passed)
    ? r.passed.flatMap((p): RankPassedAthlete[] => {
        if (!p || typeof p !== "object") return [];
        const row = p as Record<string, unknown>;
        if (typeof row.athlete_id !== "string") return [];
        const name = typeof row.display_name === "string" ? row.display_name.trim() : "";
        return [{ athlete_id: row.athlete_id, display_name: name || "An athlete" }];
      })
    : [];
  return { rank_before: toRank(r.rank_before), rank_after: toRank(r.rank_after), passed: passed.slice(0, 3) };
}

/**
 * Read the viewer's rank change for a finished match. Never throws: an older
 * backend without the RPC (PGRST202), a network failure or an unusable
 * payload all come back as `ok: false`, and callers simply show no rank strip.
 */
export async function getMatchRankChange(
  supabase: Client,
  matchId: string,
): Promise<Result<MatchRankChange>> {
  try {
    // Untyped until `database.ts` is regenerated against the B6 migration.
    const rpc = supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: Parameters<typeof mapPostgrestError>[0] | null }>;
    const { data, error } = await rpc.call(supabase, "get_match_rank_change", { p_match_id: matchId });
    if (error) return { ok: false, error: mapPostgrestError(error) };
    const parsed = parseMatchRankChange(data);
    if (!parsed) return { ok: false, error: { code: "UNKNOWN", message: "No rank change available." } };
    return { ok: true, data: parsed };
  } catch (err) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: err instanceof Error ? err.message : "Rank change unavailable." },
    };
  }
}

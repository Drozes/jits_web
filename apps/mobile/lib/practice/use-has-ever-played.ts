import * as React from "react";
import { supabase } from "@/lib/supabase/client";

/**
 * `matches.status` values that mean the match really started. A match is
 * created `pending` at face-off and stays `pending` when it is blocked (a
 * weight flag) or abandoned there, and `cancelled` never ran, so neither
 * counts as having played.
 */
export const PLAYED_MATCH_STATUSES = ["in_progress", "completed", "disputed", "voided"] as const;

/**
 * Whether the athlete has ever competed in a real match (one that started:
 * in progress, completed, disputed or voided; as a competitor, not a
 * referee). Drives the once-only practice offer on Home. `null` while
 * unknown; a failed read counts as played, so an unknown history never nags
 * an experienced athlete.
 *
 * `refreshKey` is an event counter (Home passes the arena store's
 * match-exit count): when it moves the read runs again. Home stays mounted,
 * so without it a first match would leave the cached `false` in place and
 * bring the offer back. The last value stays while the re-read runs.
 */
export function useHasEverPlayed(athleteId: string | null, refreshKey?: number): boolean | null {
  const [state, setState] = React.useState<{ id: string | null; value: boolean | null }>({
    id: null,
    value: null,
  });
  React.useEffect(() => {
    if (!athleteId) return;
    let cancelled = false;
    void supabase
      .from("match_participants")
      .select("match_id, matches!inner(status)", { count: "exact", head: true })
      .eq("athlete_id", athleteId)
      .eq("role", "competitor")
      .in("matches.status", [...PLAYED_MATCH_STATUSES])
      .then(({ count, error }) => {
        if (cancelled) return;
        setState({ id: athleteId, value: error ? true : (count ?? 0) > 0 });
      });
    return () => {
      cancelled = true;
    };
  }, [athleteId, refreshKey]);
  return state.id === athleteId ? state.value : null;
}

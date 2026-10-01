import * as React from "react";
import { supabase } from "@/lib/supabase/client";

/**
 * Whether the athlete has ever been in a real match (any match that was not
 * cancelled: completed, disputed or still awaiting confirmation). Drives the
 * once-only practice offer on Home. `null` while unknown; a failed read
 * counts as played, so an unknown history never nags an experienced athlete.
 */
export function useHasEverPlayed(athleteId: string | null): boolean | null {
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
      .neq("matches.status", "cancelled")
      .then(({ count, error }) => {
        if (cancelled) return;
        setState({ id: athleteId, value: error ? true : (count ?? 0) > 0 });
      });
    return () => {
      cancelled = true;
    };
  }, [athleteId]);
  return state.id === athleteId ? state.value : null;
}

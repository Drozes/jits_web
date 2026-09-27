import * as React from "react";
import { getEloStakes } from "@jits/shared/api/queries";
import type { EloStakes } from "@jits/shared/types/composites";
import { supabase } from "@/lib/supabase/client";

/**
 * The viewer's Win / Draw / Loss rating stakes for a ranked match, read once
 * from `calculate_elo_stakes` (jits-48a6). The viewer is passed as the
 * function's challenger: it is symmetric apart from the phantom weight
 * offset, which it applies from the weights themselves, so the challenger_*
 * fields are the viewer's stakes whichever side sent the challenge. Null
 * while loading, when disabled, on missing ratings and on any failure: the
 * stakes are a nicety and never show a spinner or an error.
 */
export function useViewerStakes(
  enabled: boolean,
  myElo: number | null | undefined,
  oppElo: number | null | undefined,
  myWeight: number | null | undefined,
  oppWeight: number | null | undefined,
): EloStakes | null {
  const [stakes, setStakes] = React.useState<EloStakes | null>(null);
  React.useEffect(() => {
    // Inputs changed: never show stakes computed for the old ones.
    setStakes(null);
    if (!enabled || myElo == null || oppElo == null) return;
    let cancelled = false;
    (async () => {
      try {
        const s = await getEloStakes(supabase, myElo, oppElo, myWeight ?? null, oppWeight ?? null);
        if (!cancelled) setStakes(s ?? null);
      } catch {
        if (!cancelled) setStakes(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, myElo, oppElo, myWeight, oppWeight]);
  return stakes;
}

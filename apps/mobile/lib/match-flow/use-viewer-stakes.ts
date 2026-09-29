import * as React from "react";
import { getEloStakes } from "@jits/shared/api/queries";
import type { EloStakes } from "@jits/shared/types/composites";
import { supabase } from "@/lib/supabase/client";

/**
 * The inputs a stakes read is computed from, as one comparable key. Two reads
 * with the same key return the same stakes, whichever challenge they are for.
 */
export function viewerStakesKey(
  myElo: number | null | undefined,
  oppElo: number | null | undefined,
  myWeight: number | null | undefined,
  oppWeight: number | null | undefined,
): string {
  return [myElo ?? "", oppElo ?? "", myWeight ?? "", oppWeight ?? ""].join("|");
}

/**
 * The viewer's Win / Draw / Loss rating stakes for a ranked match, read once
 * from `calculate_elo_stakes` (jits-48a6). The viewer is passed as the
 * function's challenger: it is symmetric apart from the phantom weight
 * offset, which it applies from the weights themselves, so the challenger_*
 * fields are the viewer's stakes whichever side sent the challenge. Null
 * while loading, when disabled, on missing ratings and on any failure: the
 * stakes are a nicety and never show a spinner or an error.
 *
 * The result is stored with the key of the inputs it was read for and only
 * returned while those are still the current inputs. So on the very render
 * where the inputs change (before the effect below has run), the old stakes
 * are already gone: a caller never sees one opponent's stakes against
 * another opponent.
 */
export function useViewerStakes(
  enabled: boolean,
  myElo: number | null | undefined,
  oppElo: number | null | undefined,
  myWeight: number | null | undefined,
  oppWeight: number | null | undefined,
): EloStakes | null {
  const key = viewerStakesKey(myElo, oppElo, myWeight, oppWeight);
  const [state, setState] = React.useState<{ key: string; stakes: EloStakes } | null>(null);
  React.useEffect(() => {
    // Inputs changed: never show stakes computed for the old ones.
    setState(null);
    if (!enabled || myElo == null || oppElo == null) return;
    let cancelled = false;
    const readKey = viewerStakesKey(myElo, oppElo, myWeight, oppWeight);
    (async () => {
      try {
        const s = await getEloStakes(supabase, myElo, oppElo, myWeight ?? null, oppWeight ?? null);
        if (!cancelled) setState(s ? { key: readKey, stakes: s } : null);
      } catch {
        if (!cancelled) setState(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, myElo, oppElo, myWeight, oppWeight]);
  return enabled && state?.key === key ? state.stakes : null;
}

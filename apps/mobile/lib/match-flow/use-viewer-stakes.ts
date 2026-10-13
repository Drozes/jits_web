import * as React from "react";
import { getRatingStakes } from "@jits/shared/api/queries";
import type { RatingStakes } from "@jits/shared/types/composites";
import { supabase } from "@/lib/supabase/client";

/**
 * The inputs a stakes read is keyed on, as one comparable key: the opponent,
 * the match (when there is one) and both displayed ratings. The ratings are
 * not sent to the server (it reads both athletes' state itself); they are in
 * the key so the preview is read again after either rating changes.
 */
export function viewerStakesKey(
  opponentId: string | null | undefined,
  matchId: string | null | undefined,
  myElo: number | null | undefined,
  oppElo: number | null | undefined,
): string {
  return [opponentId ?? "", matchId ?? "", myElo ?? "", oppElo ?? ""].join("|");
}

/**
 * The viewer's Win / Draw / Loss rating stakes against one opponent, read
 * once from `get_rating_stakes` (Rating V9, jr_be spec 019 section 5.2). The
 * server computes them from both athletes' full Glicko-2 state (rating, RD,
 * volatility, time since their last match), their rematch history and the
 * weights, always from the signed-in athlete's side, so `win` / `draw` /
 * `loss` are the viewer's stakes whichever side sent the challenge. With a
 * match id the server prices it on that match's challenge weights, exactly
 * as `record_match_result` will rate it. A draw can be positive (the
 * underdog gains). Null while loading, when disabled, without an opponent,
 * and on any failure or a null response: the stakes are a nicety and never
 * show a spinner or an error.
 *
 * The result is stored with the key of the inputs it was read for and only
 * returned while those are still the current inputs. So on the very render
 * where the inputs change (before the effect below has run), the old stakes
 * are already gone: a caller never sees one opponent's stakes against
 * another opponent.
 */
export function useViewerStakes(
  enabled: boolean,
  opponentId: string | null | undefined,
  matchId?: string | null,
  myElo?: number | null,
  oppElo?: number | null,
): RatingStakes | null {
  const key = viewerStakesKey(opponentId, matchId, myElo, oppElo);
  const [state, setState] = React.useState<{ key: string; stakes: RatingStakes } | null>(null);
  React.useEffect(() => {
    // Inputs changed: never show stakes computed for the old ones.
    setState(null);
    if (!enabled || !opponentId) return;
    let cancelled = false;
    const readKey = viewerStakesKey(opponentId, matchId, myElo, oppElo);
    (async () => {
      try {
        const s = await getRatingStakes(supabase, opponentId, matchId ?? null);
        if (!cancelled) setState(s ? { key: readKey, stakes: s } : null);
      } catch {
        if (!cancelled) setState(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, opponentId, matchId, myElo, oppElo]);
  return enabled && state?.key === key ? state.stakes : null;
}

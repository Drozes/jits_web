import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { getMatchChallengeWeights, weightsFor } from "@jits/shared/api/match-weights";

export interface MatchWeights {
  /** The weights shown for this match, lbs: the rated (challenge) ones once
   * read, the profile ones until then or when they cannot be read. */
  mine: number | null;
  theirs: number | null;
  /** The challenge's stamped weights were read: `mine` / `theirs` are what
   * `record_match_result` will rate on (a null there means no gap). */
  rated: boolean;
}

/**
 * The weights this match is rated on. `record_match_result` reads the
 * challenge's `challenger_weight` / `opponent_weight`, not the athletes'
 * current profile weights, so the face-off shows and prices those.
 */
export function useMatchWeights(
  challengeId: string | null | undefined,
  meId: string,
  profileMine: number | null,
  profileTheirs: number | null,
): MatchWeights {
  const [rated, setRated] = React.useState<{ mine: number | null; theirs: number | null } | null>(null);
  React.useEffect(() => {
    setRated(null);
    if (!challengeId) return;
    let cancelled = false;
    void Promise.resolve()
      .then(() => getMatchChallengeWeights(supabase, challengeId))
      .then((w) => {
        if (!cancelled) setRated(weightsFor(w, meId));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [challengeId, meId]);
  if (rated) return { mine: rated.mine, theirs: rated.theirs, rated: true };
  return { mine: profileMine, theirs: profileTheirs, rated: false };
}

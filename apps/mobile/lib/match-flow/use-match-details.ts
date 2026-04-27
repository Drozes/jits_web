import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import {
  getMatchDetails,
  getSubmissionTypes,
  type MatchDetails,
} from "@jits/shared/api/queries";
import type { SubmissionType } from "@jits/shared/types/submission-type";

interface UseMatchDetailsResult {
  match: MatchDetails | null;
  submissionTypes: SubmissionType[];
  isLoading: boolean;
  error: string | null;
  /** Force a re-fetch (e.g. after a Postgres Changes event signals the
   * row has updated and we need fresh started_at / paused_at / status). */
  refresh: () => void;
}

/**
 * Loads `getMatchDetails` plus the active `submission_types` lookup table
 * for the result step. Cancellation flag gates state writes per the
 * Phase 3 review (W3-4) standard.
 */
export function useMatchDetails(matchId: string): UseMatchDetailsResult {
  const [match, setMatch] = React.useState<MatchDetails | null>(null);
  const [submissionTypes, setSubmissionTypes] = React.useState<SubmissionType[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    (async () => {
      try {
        const [matchResult, types] = await Promise.all([
          getMatchDetails(supabase, matchId),
          getSubmissionTypes(supabase),
        ]);
        if (cancelled) return;
        if (!matchResult) {
          setError("Match not found");
          setMatch(null);
          setSubmissionTypes([]);
          return;
        }
        setMatch(matchResult);
        setSubmissionTypes(types);
      } catch (err) {
        if (cancelled) return;
        console.error("[match-flow] fetch failed", err);
        setError(err instanceof Error ? err.message : "Failed to load match");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [matchId, tick]);

  const refresh = React.useCallback(() => setTick((n) => n + 1), []);

  return { match, submissionTypes, isLoading, error, refresh };
}

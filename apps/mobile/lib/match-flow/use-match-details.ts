import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import {
  getMatchDetails,
  getSubmissionTypes,
  type MatchDetails,
} from "@jits/shared/api/queries";
import type { SubmissionType } from "@jits/shared/types/submission-type";
import { isStatusRegression } from "./reconcile";

interface UseMatchDetailsResult {
  match: MatchDetails | null;
  submissionTypes: SubmissionType[];
  isLoading: boolean;
  error: string | null;
  /** Force a re-fetch (e.g. after a Postgres Changes event signals the
   * row has updated and we need fresh started_at / paused_at / status). */
  refresh: () => void;
  /** Replace the match in hand with a snapshot fetched elsewhere (the
   * reconciler), without entering the loading state. */
  applyMatch: (next: MatchDetails) => void;
}

/**
 * Keep the newer of two reads of the same match. Two fetch paths write here
 * (this hook's own load/refresh and the reconciler) and their responses can
 * land out of order, so an older status never replaces a newer one.
 */
function newer(prev: MatchDetails | null, next: MatchDetails): MatchDetails {
  if (prev && prev.id === next.id && isStatusRegression(prev.status, next.status)) return prev;
  // An identical re-read (most polls) keeps the same object, so the wizard
  // and the live step do not re-render every few seconds for nothing.
  if (prev && JSON.stringify(prev) === JSON.stringify(next)) return prev;
  return next;
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
        setMatch((prev) => newer(prev, matchResult));
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
  const applyMatch = React.useCallback((next: MatchDetails) => {
    setMatch((prev) => (prev && prev.id !== next.id ? prev : newer(prev, next)));
  }, []);

  return { match, submissionTypes, isLoading, error, refresh, applyMatch };
}

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
 * Delay before the ONE automatic retry of a failed re-fetch. The confirm
 * step's refresh() is what brings in the post-ELO ratings for the summary;
 * when it hit a dead zone the summary kept the pre-ELO snapshot until the
 * next foreground. Long enough for a blip to clear, short enough that the
 * athlete is still looking at the summary.
 */
export const REFETCH_RETRY_DELAY_MS = 3_000;

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
  // The match in hand, readable from the fetch below without making it a
  // dependency (that would re-fetch on every successful load). Synced in an
  // effect declared BEFORE the fetch effect, so it is current when that runs.
  const matchRef = React.useRef<MatchDetails | null>(null);
  React.useEffect(() => {
    matchRef.current = match;
  }, [match]);
  // The `tick` the automatic retry targets, so a retry that also fails does
  // not schedule another (one retry, never a loop). Keyed on the tick rather
  // than a consume-once flag so it survives StrictMode's double-invoked
  // effects: the second run sees the same tick and still knows it is the
  // retry.
  const retryTickRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    // A RE-fetch of the match already on screen, as opposed to a first load
    // (or a load for a different matchId). `getMatchDetails` returns null on
    // ANY failure, a network blip included, so a failed re-fetch is not
    // evidence the match is gone. Treating it as one nulled the match and
    // set `error`, and the wizard swapped a finished match's summary for
    // "Match unavailable" (and disabled its reconciler) because the confirm
    // step's refresh() hit a dead zone. Keep what we have; the reconciler
    // and the next refresh() get another go.
    const revalidating = matchRef.current?.id === matchId;
    const isRetry = retryTickRef.current === tick;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    // A failed re-fetch keeps the match in hand (above) and gets exactly one
    // delayed retry. A manual refresh() or a matchId change in the meantime
    // runs this effect's cleanup, which cancels the pending retry, so `tick`
    // is still current when the timer fires.
    const scheduleRetry = () => {
      if (isRetry) return;
      retryTimer = setTimeout(() => {
        retryTickRef.current = tick + 1;
        setTick(tick + 1);
      }, REFETCH_RETRY_DELAY_MS);
    };

    (async () => {
      try {
        const [matchResult, types] = await Promise.all([
          getMatchDetails(supabase, matchId),
          getSubmissionTypes(supabase),
        ]);
        if (cancelled) return;
        if (!matchResult) {
          if (revalidating) {
            console.warn("[match-flow] re-fetch returned no match; keeping the loaded one");
            scheduleRetry();
            return;
          }
          setError("Match not found");
          setMatch(null);
          setSubmissionTypes([]);
          return;
        }
        setMatch((prev) => newer(prev, matchResult));
        setSubmissionTypes(types);
      } catch (err) {
        if (cancelled) return;
        if (revalidating) {
          console.warn("[match-flow] re-fetch failed; keeping the loaded match", err);
          scheduleRetry();
          return;
        }
        console.error("[match-flow] fetch failed", err);
        setError(err instanceof Error ? err.message : "Failed to load match");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [matchId, tick]);

  const refresh = React.useCallback(() => setTick((n) => n + 1), []);
  const applyMatch = React.useCallback((next: MatchDetails) => {
    setMatch((prev) => (prev && prev.id !== next.id ? prev : newer(prev, next)));
  }, []);

  return { match, submissionTypes, isLoading, error, refresh, applyMatch };
}

import * as React from "react";
import { useFocusEffect } from "expo-router";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/hooks";
import {
  getMatchDetailView,
  type MatchDetailView,
} from "@jits/shared/api/queries";
import type { DomainError } from "@jits/shared/api/errors";

export type MatchDetailState = "loading" | "ready" | "error";

interface UseMatchDetailResult {
  state: MatchDetailState;
  data: MatchDetailView | null;
  error: DomainError | null;
  /** A re-read is in flight while the last good data stays on screen. */
  refreshing: boolean;
  refetch: () => void;
}

/**
 * One past match for the pushed match detail screen (V-epic jits-5tj9.7).
 *
 * useEffect + cancelled flag (the use-match-details.ts pattern) so an unmount
 * during a slow read never writes state. A refetch (pull-to-refresh, "Try
 * again", or the screen regaining focus) keeps the loaded match on screen
 * with `refreshing: true` instead of flashing the skeleton; a failed refetch
 * keeps it too. Focus refetch skips the first focus because mount already
 * fetched; it exists so a video that finished uploading shows up when the
 * athlete comes back from the player.
 */
export function useMatchDetail(
  matchId: string | undefined,
): UseMatchDetailResult {
  const { athlete } = useAuth();
  const athleteId = athlete?.id;
  const [state, setState] = React.useState<MatchDetailState>("loading");
  const [data, setData] = React.useState<MatchDetailView | null>(null);
  const [error, setError] = React.useState<DomainError | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [tick, setTick] = React.useState(0);
  // Which match the data on screen belongs to, so a param change reloads
  // with the skeleton instead of showing the previous match as "refreshing".
  const loadedFor = React.useRef<string | null>(null);

  React.useEffect(() => {
    // Auth still resolving: stay in the loading state.
    if (!athleteId) return;
    let cancelled = false;
    const id = matchId ?? "";
    const hasData = loadedFor.current === id;
    if (hasData) {
      setRefreshing(true);
    } else {
      setState("loading");
      setData(null);
    }

    (async () => {
      // Malformed or missing ids resolve to MATCH_NOT_FOUND without a round trip.
      const result = await getMatchDetailView(supabase, id, athleteId);
      if (cancelled) return;
      setRefreshing(false);
      if (result.ok) {
        loadedFor.current = id;
        setData(result.data);
        setError(null);
        setState("ready");
        return;
      }
      if (hasData) return;
      setError(result.error);
      setState("error");
    })();

    return () => {
      cancelled = true;
    };
  }, [matchId, athleteId, tick]);

  const refetch = React.useCallback(() => setTick((n) => n + 1), []);

  const firstFocus = React.useRef(true);
  useFocusEffect(
    React.useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      refetch();
    }, [refetch]),
  );

  return { state, data, error, refreshing, refetch };
}

import * as React from "react";
import { useFocusEffect } from "expo-router";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/hooks";
import {
  getMatchDetailView,
  type MatchDetailView,
} from "@jits/shared/api/queries";
import type { DomainError } from "@jits/shared/api/errors";
import { useMatchVideosRealtime } from "@jits/shared/hooks/use-match-videos-realtime";

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
 * athlete comes back from the player. A realtime subscription on the match's
 * `match_videos` re-reads in place (no spinner) as angles arrive and move.
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
  // A realtime re-read (jits-n2im.12) refreshes the data in place: no pull
  // spinner every time the other phone's heartbeat moves the percent.
  const silentRef = React.useRef(false);

  React.useEffect(() => {
    // Auth still resolving (or signed out mid-refresh): no read, and never
    // leave a cancelled refresh's spinner running.
    if (!athleteId) {
      setRefreshing(false);
      return;
    }
    let cancelled = false;
    const id = matchId ?? "";
    const hasData = loadedFor.current === id;
    const silent = silentRef.current;
    silentRef.current = false;
    if (hasData) {
      if (!silent) setRefreshing(true);
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

  // Any match_videos INSERT/UPDATE for this match (the other athlete's or
  // the timekeeper's angle being reserved, its heartbeat, the land flip, the
  // poster or normalized_path arriving, a pipeline step) re-reads the RPC,
  // so nothing waits for a refocus or a pull (jits-n2im.12, jr_be-1wk).
  const silentRefetch = React.useCallback(() => {
    silentRef.current = true;
    setTick((n) => n + 1);
  }, []);
  useMatchVideosRealtime(supabase, athleteId && matchId ? matchId : null, silentRefetch);

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

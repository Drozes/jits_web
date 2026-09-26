import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { getMyMatchVideos, type MatchVideoListItem } from "@jits/shared/api/queries";
import { useCachedResource } from "@/lib/cache/use-cached-resource";

/** Max video ROWS read for the list; covers the demo without pagination UI. */
const MY_MATCH_VIDEOS_LIMIT = 100;

export type MyMatchVideos = {
  items: MatchVideoListItem[];
  isLoading: boolean;
  /** A fetch is running (cold or background). */
  isValidating: boolean;
  /** Last load error, kept through a retry until a load succeeds. */
  error: Error | null;
  refetch: () => void;
};

/**
 * Own past-match videos for the Profile tab, one item per match, through the
 * same stale-while-revalidate cache as the rest of the profile payload.
 * Unlike get_athlete_videos this includes failed-status videos and disputed
 * matches and is not capped at 10. The fetcher throws on `ok: false` so the
 * cache surfaces `error` and the section can offer a retry instead of hiding.
 */
export function useMyMatchVideos(athleteId: string | undefined): MyMatchVideos {
  const { data, isLoading, isValidating, error, refetch } = useCachedResource<MatchVideoListItem[]>(
    `my-match-videos:${athleteId ?? "anon"}`,
    async () => {
      if (!athleteId) return [];
      const result = await getMyMatchVideos(supabase, athleteId, { limit: MY_MATCH_VIDEOS_LIMIT });
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
    },
    [athleteId],
  );

  // The cache clears `error` as soon as a retry starts; keep the last one
  // until a load actually succeeds so a retry row does not blink away.
  const [lastError, setLastError] = React.useState<Error | null>(null);
  React.useEffect(() => {
    if (error) setLastError(error);
    else if (!isValidating && data !== undefined) setLastError(null);
  }, [error, isValidating, data]);

  return { items: data ?? [], isLoading, isValidating, error: error ?? lastError, refetch };
}

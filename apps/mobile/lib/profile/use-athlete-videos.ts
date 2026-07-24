import { supabase } from "@/lib/supabase/client";
import { getAthleteVideos, type AthleteVideoRow } from "@jits/shared/api/queries";
import { useCachedResource } from "@/lib/cache/use-cached-resource";

/**
 * Own past-match videos for the Profile tab, served through the same
 * stale-while-revalidate cache as the rest of the profile payload.
 * Aggregate-read style: errors resolve to [] inside getAthleteVideos, so
 * the section simply hides rather than toasting on a failed fetch.
 */
export function useAthleteVideos(athleteId: string | undefined) {
  const { data, isLoading, isStale, refetch } = useCachedResource<AthleteVideoRow[]>(
    `athlete-videos:${athleteId ?? "anon"}`,
    async () => (athleteId ? getAthleteVideos(supabase, athleteId) : []),
    [athleteId],
  );

  return { videos: data ?? [], isLoading, refreshing: isStale, refetch };
}

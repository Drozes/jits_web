import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { getAthleteStatsRpc, getMatchHistory, type AthleteStatsRpc } from "@jits/shared/api/queries";
import type { MatchHistoryRow } from "@jits/shared/types/composites";
import { useCachedResource, type CancelToken } from "@/lib/cache/use-cached-resource";
import { toast } from "@/components/ui/toast";

interface ProfilePayload {
  stats: AthleteStatsRpc | null;
  gymName: string | null;
  eloThisMonth: number;
  history: MatchHistoryRow[];
}

const EMPTY: ProfilePayload = { stats: null, gymName: null, eloThisMonth: 0, history: [] };

export function useProfileData(athleteId: string | undefined, primaryGymId: string | null | undefined) {
  const { data, isLoading, isStale, error, refetch } = useCachedResource<ProfilePayload>(
    `profile:${athleteId ?? "anon"}`,
    async (_signal: CancelToken) => {
      if (!athleteId) return EMPTY;

      // Stats, gym name, and match history are all keyed only by athleteId and
      // mutually independent, so fetch all three concurrently in one Promise.all
      // rather than a parallel pair followed by a serial leg.
      const [stats, gymResult, history] = await Promise.all([
        getAthleteStatsRpc(supabase, athleteId),
        primaryGymId
          ? supabase.from("gyms").select("name").eq("id", primaryGymId).maybeSingle()
          : Promise.resolve({ data: null }),
        getMatchHistory(supabase, athleteId),
      ]);

      // Derive "ELO this month" from the same history array.
      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const eloThisMonth = history
        .filter((m) => m.completed_at != null && new Date(m.completed_at) >= startOfMonth)
        .reduce((sum, m) => sum + (m.elo_delta ?? 0), 0);

      return {
        stats,
        gymName: (gymResult.data as { name: string } | null)?.name ?? null,
        eloThisMonth,
        history,
      };
    },
    [athleteId, primaryGymId],
  );

  React.useEffect(() => {
    if (error) toast.error("Could not load profile");
  }, [error]);

  return {
    stats: data?.stats ?? null,
    gymName: data?.gymName ?? null,
    eloThisMonth: data?.eloThisMonth ?? 0,
    history: data?.history ?? [],
    isLoading,
    // Warm background revalidate keeps data on screen; mirror it to the pull-to-refresh spinner.
    refreshing: isStale,
    onRefresh: refetch,
  };
}

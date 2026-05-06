import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { getAthleteStatsRpc, type AthleteStatsRpc } from "@jits/shared/api/queries";
import { toast } from "@/components/ui/toast";

export function useProfileData(athleteId: string | undefined, primaryGymId: string | null | undefined) {
  const [stats, setStats] = React.useState<AthleteStatsRpc | null>(null);
  const [gymName, setGymName] = React.useState<string | null>(null);
  const [eloThisMonth, setEloThisMonth] = React.useState<number>(0);
  const [isLoading, setIsLoading] = React.useState(true);
  const [refreshTick, setRefreshTick] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);

  React.useEffect(() => {
    if (!athleteId) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);

    (async () => {
      try {
        const [statsResult, gymResult] = await Promise.all([
          getAthleteStatsRpc(supabase, athleteId),
          primaryGymId
            ? supabase.from("gyms").select("name").eq("id", primaryGymId).maybeSingle()
            : Promise.resolve({ data: null }),
        ]);

        if (cancelled) return;
        setStats(statsResult);
        setGymName((gymResult.data as { name: string } | null)?.name ?? null);

        const { data: history } = await supabase.rpc("get_match_history", { p_athlete_id: athleteId });
        if (cancelled) return;
        const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const monthly = (history ?? [])
          .filter((m: { completed_at: string }) => new Date(m.completed_at) >= startOfMonth)
          .reduce((sum: number, m: { elo_delta: number | null }) => sum + (m.elo_delta ?? 0), 0);
        setEloThisMonth(monthly);
      } catch (err) {
        console.error("[profile] fetch failed", err);
        if (!cancelled) toast.error("Could not load profile");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [athleteId, primaryGymId, refreshTick]);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    setRefreshTick((n) => n + 1);
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  return { stats, gymName, eloThisMonth, isLoading, refreshing, onRefresh };
}

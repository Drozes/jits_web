import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { getAthletesStatsRpc } from "@jits/shared/api/queries";
import { extractGymName } from "@jits/shared/utils";
import { toast } from "@/components/ui";

export interface RankedAthlete {
  id: string;
  rank: number;
  displayName: string;
  currentElo: number;
  eloTrend: "up" | "down" | "neutral";
  gymName?: string;
  profilePhotoUrl?: string | null;
  wins: number;
  losses: number;
  isCurrentUser: boolean;
  gender: "M" | "F" | null;
}

export interface RankedGym {
  id: string;
  rank: number;
  name: string;
  totalElo: number;
  averageElo: number;
  memberCount: number;
}

export function useLeaderboardData(currentAthleteId: string | undefined) {
  const [athletes, setAthletes] = React.useState<RankedAthlete[] | null>(null);
  const [gyms, setGyms] = React.useState<RankedGym[] | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const fetchAll = React.useCallback(
    async (mode: "initial" | "refresh") => {
      if (!currentAthleteId) return;
      if (mode === "initial") setIsLoading(true);
      else setIsRefreshing(true);
      try {
        const { data, error } = await supabase
          .from("athletes")
          .select(
            "id, display_name, current_elo, highest_elo, primary_gym_id, profile_photo_url, gender, gyms!fk_athletes_primary_gym(name)",
          )
          .eq("status", "active")
          .order("current_elo", { ascending: false })
          .limit(50);
        if (error) throw error;

        const athleteIds = (data ?? []).map((a) => a.id);
        const statsMap = await getAthletesStatsRpc(supabase, athleteIds);

        const ranked: RankedAthlete[] = (data ?? []).map((a, i) => {
          const stats = statsMap.get(a.id) ?? { wins: 0, losses: 0, draws: 0 };
          const eloTrend: "up" | "down" | "neutral" =
            a.current_elo === 1000 && a.highest_elo === 1000
              ? "neutral"
              : a.current_elo >= a.highest_elo
                ? "up"
                : "down";
          return {
            id: a.id,
            rank: i + 1,
            displayName: a.display_name,
            currentElo: a.current_elo,
            eloTrend,
            gymName:
              extractGymName(a.gyms as unknown as { name: string } | null) ?? undefined,
            profilePhotoUrl: a.profile_photo_url,
            gender: a.gender as "M" | "F" | null,
            wins: stats.wins,
            losses: stats.losses,
            isCurrentUser: a.id === currentAthleteId,
          };
        });

        // Aggregate gyms
        const gymMap = new Map<
          string,
          { name: string; totalElo: number; memberCount: number }
        >();
        for (const a of data ?? []) {
          if (!a.primary_gym_id) continue;
          const name =
            extractGymName(a.gyms as unknown as { name: string } | null) ?? "Unknown";
          const entry = gymMap.get(a.primary_gym_id) ?? {
            name,
            totalElo: 0,
            memberCount: 0,
          };
          entry.totalElo += a.current_elo;
          entry.memberCount++;
          gymMap.set(a.primary_gym_id, entry);
        }
        const rankedGyms: RankedGym[] = Array.from(gymMap.entries())
          .map(([id, s]) => ({
            id,
            name: s.name,
            totalElo: s.totalElo,
            memberCount: s.memberCount,
            averageElo: Math.round(s.totalElo / s.memberCount),
          }))
          .sort((a, b) => b.totalElo - a.totalElo)
          .map((g, i) => ({ ...g, rank: i + 1 }));

        setAthletes(ranked);
        setGyms(rankedGyms);
      } catch (err) {
        console.error("[leaderboard] fetch failed", err);
        toast.error("Failed to load leaderboard");
      } finally {
        if (mode === "initial") setIsLoading(false);
        else setIsRefreshing(false);
      }
    },
    [currentAthleteId],
  );

  React.useEffect(() => {
    void fetchAll("initial");
  }, [fetchAll]);

  return { athletes, gyms, isLoading, isRefreshing, refresh: () => fetchAll("refresh") };
}

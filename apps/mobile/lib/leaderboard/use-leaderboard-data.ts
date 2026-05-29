import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { getAthletesStatsRpc } from "@jits/shared/api/queries";
import { extractGymName } from "@jits/shared/utils";
import { toast } from "@/components/ui";
import { useCachedResource } from "@/lib/cache/use-cached-resource";

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

interface LeaderboardPayload {
  athletes: RankedAthlete[];
  gyms: RankedGym[];
}

// gender filter is applied client-side over this same payload, so it is NOT part
// of the key. `isCurrentUser` is baked into the payload, so the cache key includes
// the viewer's athlete id (see the hook below): this keeps each viewer's
// highlighted row correct and prevents a freshly-authed mount from deduping onto
// the earlier unauthed (empty-id) in-flight fetch. Cancellation is handled solely
// by the hook's token guard, so this fetcher never inspects a cancel signal.
async function fetchLeaderboard(
  currentAthleteId: string,
): Promise<LeaderboardPayload> {
  // SEQUENTIAL BY NECESSITY: the stats RPC keys off the athlete IDs returned by
  // the athletes SELECT, so these two stay chained (no Promise.all). There is
  // no wasted await between them — the second fires the instant IDs land.
  const { data, error } = await supabase
    .from("athletes")
    .select(
      "id, display_name, current_elo, highest_elo, primary_gym_id, profile_photo_url, gender, gyms!fk_athletes_primary_gym(name)",
    )
    .eq("status", "active")
    .order("current_elo", { ascending: false })
    .limit(50);
  if (error) throw error;

  const rows = data ?? [];
  const statsMap = await getAthletesStatsRpc(
    supabase,
    rows.map((a) => a.id),
  );

  const athletes: RankedAthlete[] = rows.map((a, i) => {
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
  for (const a of rows) {
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
  const gyms: RankedGym[] = Array.from(gymMap.entries())
    .map(([id, s]) => ({
      id,
      name: s.name,
      totalElo: s.totalElo,
      memberCount: s.memberCount,
      averageElo: Math.round(s.totalElo / s.memberCount),
    }))
    .sort((a, b) => b.totalElo - a.totalElo)
    .map((g, i) => ({ ...g, rank: i + 1 }));

  return { athletes, gyms };
}

export function useLeaderboardData(currentAthleteId: string | undefined) {
  const { data, isLoading, isStale, error, refresh } =
    useCachedResource<LeaderboardPayload>(
      `leaderboard:${currentAthleteId ?? ""}`,
      () => fetchLeaderboard(currentAthleteId ?? ""),
      [currentAthleteId],
    );

  // Surface fetch errors via the per-tab toast; stale data stays on screen.
  React.useEffect(() => {
    if (error) toast.error("Failed to load leaderboard");
  }, [error]);

  return {
    athletes: data?.athletes ?? null,
    gyms: data?.gyms ?? null,
    // Cold start only: no cached value AND we still have no athlete id resolved.
    isLoading: isLoading || !currentAthleteId,
    isRefreshing: isStale,
    refresh,
  };
}

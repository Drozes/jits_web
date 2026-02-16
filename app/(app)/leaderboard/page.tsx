import { Suspense } from "react";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { LeaderboardContent } from "./leaderboard-content";
import { extractGymName } from "@/lib/utils";
import {
  getPendingChallengeOpponentIds,
  getAthletesStatsRpc,
} from "@/lib/api/queries";

function LeaderboardSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="h-8 w-40 bg-muted rounded" />
      <div className="flex gap-4 justify-center"><div className="h-32 w-24 bg-muted rounded-lg" /><div className="h-40 w-24 bg-muted rounded-lg" /><div className="h-32 w-24 bg-muted rounded-lg" /></div>
      <div className="h-16 bg-muted rounded-lg" />
      <div className="h-16 bg-muted rounded-lg" />
    </div>
  );
}

export default function LeaderboardPage() {
  return (
    <Suspense fallback={<LeaderboardSkeleton />}>
      <LeaderboardData />
    </Suspense>
  );
}

async function LeaderboardData() {
  const { athlete: currentAthlete } = await requireAthlete();
  const supabase = await createClient();

  // Fetch all athletes ranked by ELO, join gym name
  const { data: athletes } = await supabase
    .from("athletes")
    .select("id, display_name, current_elo, primary_gym_id, gyms!fk_athletes_primary_gym(name)")
    .eq("status", "active")
    .order("current_elo", { ascending: false })
    .limit(50);

  // Fetch all stats via batch RPC (bypasses match_participants RLS)
  const athleteIds = (athletes ?? []).map((a) => a.id);
  const statsMap = await getAthletesStatsRpc(supabase, athleteIds);

  const rankedAthletes = (athletes ?? []).map((a, i) => {
    const stats = statsMap.get(a.id) ?? { wins: 0, losses: 0, draws: 0 };
    return {
      id: a.id,
      rank: i + 1,
      displayName: a.display_name,
      currentElo: a.current_elo,
      gymName: extractGymName(a.gyms as { name: string }[] | null) ?? undefined,
      wins: stats.wins,
      losses: stats.losses,
      isCurrentUser: a.id === currentAthlete.id,
    };
  });

  // Count members and total ELO per gym from athlete data
  const gymStatsMap = new Map<string, { name: string; totalElo: number; memberCount: number }>();
  for (const a of athletes ?? []) {
    if (!a.primary_gym_id) continue;
    const gymName = extractGymName(a.gyms as { name: string }[] | null) ?? "Unknown";
    const entry = gymStatsMap.get(a.primary_gym_id) ?? { name: gymName, totalElo: 0, memberCount: 0 };
    entry.totalElo += a.current_elo;
    entry.memberCount++;
    gymStatsMap.set(a.primary_gym_id, entry);
  }

  const rankedGyms = Array.from(gymStatsMap.entries())
    .map(([id, stats]) => ({
      id,
      name: stats.name,
      totalElo: stats.totalElo,
      averageElo: Math.round(stats.totalElo / stats.memberCount),
      memberCount: stats.memberCount,
    }))
    .sort((a, b) => b.totalElo - a.totalElo)
    .map((g, i) => ({ ...g, rank: i + 1 }));

  const challengedIds = await getPendingChallengeOpponentIds(supabase, currentAthlete.id);

  return (
    <LeaderboardContent
      athletes={rankedAthletes}
      gyms={rankedGyms}
      challengedIds={Array.from(challengedIds)}
    />
  );
}

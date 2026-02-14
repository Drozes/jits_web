import { Suspense } from "react";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { LeaderboardContent } from "./leaderboard-content";

export default function LeaderboardPage() {
  return (
    <Suspense>
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
    .select("id, display_name, current_elo, primary_gym_id, gyms!athletes_primary_gym_id_fkey(name)")
    .eq("status", "active")
    .order("current_elo", { ascending: false })
    .limit(50);

  // Fetch all outcomes for these athletes in one query
  const athleteIds = (athletes ?? []).map((a) => a.id);
  const { data: allOutcomes } = await supabase
    .from("match_participants")
    .select("athlete_id, outcome")
    .in("athlete_id", athleteIds)
    .not("outcome", "is", null);

  // Aggregate W/L per athlete
  const statsMap = new Map<string, { wins: number; losses: number }>();
  for (const o of allOutcomes ?? []) {
    const entry = statsMap.get(o.athlete_id) ?? { wins: 0, losses: 0 };
    if (o.outcome === "win") entry.wins++;
    else if (o.outcome === "loss") entry.losses++;
    statsMap.set(o.athlete_id, entry);
  }

  const rankedAthletes = (athletes ?? []).map((a, i) => {
    const gymsArr = a.gyms as { name: string }[] | null;
    const stats = statsMap.get(a.id) ?? { wins: 0, losses: 0 };
    return {
      id: a.id,
      rank: i + 1,
      displayName: a.display_name,
      currentElo: a.current_elo,
      gymName: gymsArr?.[0]?.name,
      wins: stats.wins,
      losses: stats.losses,
      isCurrentUser: a.id === currentAthlete.id,
    };
  });

  // Fetch gyms with member stats
  const { data: gyms } = await supabase
    .from("gyms")
    .select("id, name")
    .eq("status", "active");

  // Count members and total ELO per gym from athlete data
  const gymStatsMap = new Map<string, { name: string; totalElo: number; memberCount: number }>();
  for (const a of athletes ?? []) {
    if (!a.primary_gym_id) continue;
    const gymsArr = a.gyms as { name: string }[] | null;
    const gymName = gymsArr?.[0]?.name ?? "Unknown";
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

  return (
    <LeaderboardContent
      athletes={rankedAthletes}
      gyms={rankedGyms}
    />
  );
}

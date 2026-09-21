import { Suspense } from "react";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { LeaderboardContent } from "./leaderboard-content";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeaderActions } from "@/components/layout/page-header-actions";
import { extractGymName } from "@jits/shared/utils";
import {
  getPendingChallengeOpponentIds,
  getAthletesStatsRpc,
  getGymLadder,
} from "@jits/shared/api/queries";

function LeaderboardSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="h-8 w-40 bg-muted rounded" />
      <div className="flex gap-4 justify-center"><div className="h-32 w-24 bg-muted rounded-2xl" /><div className="h-40 w-24 bg-muted rounded-2xl" /><div className="h-32 w-24 bg-muted rounded-2xl" /></div>
      <div className="h-16 bg-muted rounded-2xl" />
      <div className="h-16 bg-muted rounded-2xl" />
    </div>
  );
}

export default function LeaderboardPage() {
  // The guard runs inside the Suspense'd <LeaderboardData/>. Awaiting it here,
  // outside <Suspense>, accesses uncached data and breaks Next 16
  // cacheComponents prerender (jits-v0n).
  return (
    <>
      <AppHeader title="Rankings" rightAction={<PageHeaderActions />} />
      <PageContainer wide className="pt-6">
        <Suspense fallback={<LeaderboardSkeleton />}>
          <LeaderboardData />
        </Suspense>
      </PageContainer>
    </>
  );
}

async function LeaderboardData() {
  const { athlete: currentAthlete } = await requireAthlete();
  const supabase = await createClient();

  // The athlete board is explicitly a TOP 50: ordered by current_elo DESC and
  // cut at 50. That is a fine basis for "the 50 highest-rated fighters" and a
  // terrible one for anything gym-wide, which is why the gym board below no
  // longer derives from it.
  const [{ data: athletes }, gymLadder] = await Promise.all([
    supabase
      .from("athletes")
      .select("id, display_name, current_elo, highest_elo, primary_gym_id, profile_photo_url, gender, gyms!fk_athletes_primary_gym(name)")
      .eq("status", "active")
      .order("current_elo", { ascending: false })
      .limit(50),
    // Whole-population gym aggregate, computed in the database.
    getGymLadder(supabase),
  ]);

  // Fetch all stats via batch RPC (bypasses match_participants RLS)
  const athleteIds = (athletes ?? []).map((a) => a.id);
  const statsMap = await getAthletesStatsRpc(supabase, athleteIds);

  const rankedAthletes = (athletes ?? []).map((a, i) => {
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
      gymName: extractGymName(a.gyms as unknown as { name: string } | null) ?? undefined,
      profilePhotoUrl: a.profile_photo_url ?? undefined,
      gender: a.gender as "M" | "F" | null,
      wins: stats.wins,
      losses: stats.losses,
      isCurrentUser: a.id === currentAthlete.id,
    };
  });

  // ---------------------------------------------------------------------
  // GYM BOARD: whole-population aggregate, not a slice of the top 50.
  //
  // THE BUG THIS REPLACES. The gym rows used to be grouped out of the 50
  // athletes fetched above, so every number on them was a function of the cut:
  // "memberCount" was "members of this gym who happen to sit in the global top
  // 50" rendered as "N athletes"; "Avg" was the average of only those members,
  // which is biased upward by construction and rises as a gym's weaker members
  // are excluded; and the ranking key, totalElo, rewarded having many athletes
  // above the cut rather than a strong gym. Past 50 active athletes all three
  // were wrong, and wrong in a direction no one would notice from the screen.
  //
  // THE FIX: `get_gym_ladder` (jr_be 20260605000000_gym_owner_portal_rpcs.sql)
  // aggregates over EVERY active athlete with a primary gym, server side:
  //   athlete_count = COUNT(*) of the gym's active members  (exact)
  //   avg_elo       = AVG(current_elo) over those members   (exact, 1 decimal)
  // Its p_range argument only bounds match_count and momentum, which this
  // screen does not use, so the two numbers taken here are window-independent.
  // It is aggregate-only and granted to `authenticated`, so no manager gate.
  //
  // `get_gym_member_counts()` would have fixed the count alone and left the
  // average a slice artefact; this RPC fixes the count, the average AND the
  // ordering in one round trip, so it is used instead of both.
  //
  // totalElo is DERIVED (avg x count) because no RPC returns a summed ELO and a
  // backend migration is out of scope here. The BE rounds avg_elo to one
  // decimal, so the derived total is within +/- 0.05 per member of the true sum
  // (under 1 ELO for a 15-member gym) and is a whole-roster total rather than a
  // top-50 subtotal. The board still ranks by it, so the order and the headline
  // number on each row continue to agree.
  const rankedGyms = gymLadder
    .map((g) => ({
      id: g.gymId,
      name: g.gymName,
      memberCount: g.athleteCount,
      averageElo: Math.round(g.avgElo),
      totalElo: Math.round(g.avgElo * g.athleteCount),
    }))
    .sort(
      (a, b) =>
        b.totalElo - a.totalElo ||
        b.averageElo - a.averageElo ||
        a.name.localeCompare(b.name),
    )
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

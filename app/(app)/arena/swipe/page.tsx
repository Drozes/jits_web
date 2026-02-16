import { Suspense } from "react";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { SwipeDiscoveryClient } from "./swipe-discovery-client";
import { extractGymName } from "@/lib/utils";
import { getAthletesStatsRpc } from "@/lib/api/queries";

export default function SwipeDiscoveryPage() {
  return (
    <Suspense fallback={<SwipeSkeleton />}>
      <SwipeData />
    </Suspense>
  );
}

async function SwipeData() {
  const { athlete: currentAthlete } = await requireAthlete();
  const supabase = await createClient();

  // Fetch athletes ordered by ELO proximity
  const { data: athletes } = await supabase
    .from("athletes")
    .select(
      "id, display_name, current_elo, current_weight, primary_gym_id, gyms!fk_athletes_primary_gym(name)",
    )
    .eq("status", "active")
    .neq("id", currentAthlete.id)
    .order("current_elo", { ascending: false })
    .limit(30);

  // Fetch stats via batch RPC (bypasses match_participants RLS)
  const athleteIds = (athletes ?? []).map((a) => a.id);
  const statsMap = await getAthletesStatsRpc(supabase, athleteIds);

  const competitors = (athletes ?? []).map((a) => {
    const stats = statsMap.get(a.id) ?? { wins: 0, losses: 0, draws: 0 };
    return {
      id: a.id,
      displayName: a.display_name,
      currentElo: a.current_elo,
      gymName: extractGymName(a.gyms as { name: string }[] | null),
      weight: a.current_weight,
      wins: stats.wins,
      losses: stats.losses,
    };
  });

  return <SwipeDiscoveryClient competitors={competitors} />;
}

function SwipeSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="h-14 bg-muted" />
      <div className="px-4 flex flex-col items-center gap-6">
        <div className="h-96 w-full max-w-xs rounded-2xl bg-muted" />
        <div className="flex gap-6">
          <div className="h-14 w-14 rounded-full bg-muted" />
          <div className="h-14 w-14 rounded-full bg-muted" />
          <div className="h-14 w-14 rounded-full bg-muted" />
        </div>
      </div>
    </div>
  );
}

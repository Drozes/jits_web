import { Suspense } from "react";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { SwipeDiscoveryClient } from "./swipe-discovery-client";

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
      "id, display_name, current_elo, primary_gym_id, gyms!athletes_primary_gym_id_fkey(name)",
    )
    .eq("status", "active")
    .neq("id", currentAthlete.id)
    .order("current_elo", { ascending: false })
    .limit(30);

  // Compute stats for each athlete
  const athleteIds = (athletes ?? []).map((a) => a.id);
  const { data: allOutcomes } = await supabase
    .from("match_participants")
    .select("athlete_id, outcome")
    .in("athlete_id", athleteIds)
    .not("outcome", "is", null);

  const competitors = (athletes ?? []).map((a) => {
    const gymsArr = a.gyms as { name: string }[] | null;
    const outcomes = allOutcomes?.filter((o) => o.athlete_id === a.id) ?? [];
    const wins = outcomes.filter((o) => o.outcome === "win").length;
    const losses = outcomes.filter((o) => o.outcome === "loss").length;

    return {
      id: a.id,
      displayName: a.display_name,
      currentElo: a.current_elo,
      gymName: gymsArr?.[0]?.name ?? null,
      wins,
      losses,
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

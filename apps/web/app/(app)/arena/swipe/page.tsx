import { Suspense } from "react";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { SwipeDiscoveryClient } from "./swipe-discovery-client";
import { extractGymName } from "@jits/shared/utils";
import { getAthletesStatsRpc } from "@jits/shared/api/queries";

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
      "id, display_name, current_elo, current_weight, primary_gym_id, profile_photo_url, gyms!fk_athletes_primary_gym(name)",
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
      gymName: extractGymName(a.gyms as unknown as { name: string } | null),
      weight: a.current_weight,
      profilePhotoUrl: a.profile_photo_url ?? undefined,
      wins: stats.wins,
      losses: stats.losses,
    };
  });

  return <SwipeDiscoveryClient competitors={competitors} />;
}

function SwipeSkeleton() {
  const block = {
    background: "var(--bg-elevated)",
    borderRadius: "var(--radius-md)",
  } as const;
  return (
    <div
      className="flex flex-col animate-pulse"
      style={{ gap: "var(--space-6)" }}
    >
      <div className="h-14" style={block} />
      <div
        className="px-4 flex flex-col items-center"
        style={{ gap: "var(--space-6)" }}
      >
        <div className="h-96 w-full max-w-xs" style={block} />
        <div className="flex" style={{ gap: "var(--space-6)" }}>
          <div
            className="h-14 w-14"
            style={{ ...block, borderRadius: "var(--radius-sm)" }}
          />
          <div
            className="h-11 w-11"
            style={{ ...block, borderRadius: "var(--radius-sm)" }}
          />
          <div
            className="h-14 w-14"
            style={{ ...block, borderRadius: "var(--radius-sm)" }}
          />
        </div>
      </div>
    </div>
  );
}

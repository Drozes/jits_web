import { Suspense } from "react";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { ArenaContent } from "./arena-content";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeaderActions } from "@/components/layout/page-header-actions";
import { getArenaData } from "@jits/shared/api/queries";

function ArenaSkeleton() {
  const bar = {
    background: "var(--bg-elevated)",
    borderRadius: "var(--radius-md)",
  } as const;
  return (
    <div
      className="flex flex-col animate-pulse"
      style={{ gap: "var(--space-6)" }}
    >
      <div
        className="h-7 w-32"
        style={{ ...bar, borderRadius: "var(--radius-xs)" }}
      />
      <div className="h-24" style={bar} />
      <div className="h-24" style={bar} />
      <div className="h-24" style={bar} />
    </div>
  );
}

export default function ArenaPage() {
  return (
    <>
      <AppHeader title="Arena" rightAction={<PageHeaderActions />} />
      <PageContainer className="pt-6">
        <Suspense fallback={<ArenaSkeleton />}>
          <ArenaData />
        </Suspense>
      </PageContainer>
    </>
  );
}

async function ArenaData() {
  const { athlete: currentAthlete } = await requireAthlete();
  const supabase = await createClient();

  // get_arena_data orders looking_athletes by current_elo DESC and applies
  // p_limit (default 20). Presence is uncapped, so a low default silently hid
  // live athletes below the cut and under-reported the "Online now" count.
  const arena = await getArenaData(supabase, 100);

  type ArenaAthlete = { id: string; display_name: string; current_elo: number; gym_name: string | null; current_weight: number | null; profile_photo_url?: string | null };
  const toCompetitor = (a: ArenaAthlete) => ({
    id: a.id,
    displayName: a.display_name,
    currentElo: a.current_elo,
    gymName: a.gym_name ?? undefined,
    weight: a.current_weight ?? undefined,
    profilePhotoUrl: a.profile_photo_url ?? undefined,
    eloDiff: a.current_elo - currentAthlete.current_elo,
  });

  return (
    <ArenaContent
      lookingCompetitors={arena.looking_athletes.map((a) => toCompetitor(a))}
      currentAthleteId={currentAthlete.id}
      currentAthleteWeight={currentAthlete.current_weight}
      currentAthleteRanked={currentAthlete.looking_for_ranked}
      challengedIds={arena.challenged_opponent_ids}
    />
  );
}

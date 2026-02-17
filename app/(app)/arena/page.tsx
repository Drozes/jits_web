import { Suspense } from "react";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { ArenaContent } from "./arena-content";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeaderActions } from "@/components/layout/page-header-actions";
import { getArenaData } from "@/lib/api/queries";

function ArenaSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="h-7 w-32 bg-muted rounded" />
      <div className="h-24 bg-muted rounded-2xl" />
      <div className="h-24 bg-muted rounded-2xl" />
      <div className="h-24 bg-muted rounded-2xl" />
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

  const arena = await getArenaData(supabase);

  type ArenaAthlete = { id: string; display_name: string; current_elo: number; gym_name: string | null; current_weight: number | null; profile_photo_url?: string | null; looking_for_casual?: boolean; looking_for_ranked?: boolean };
  const toCompetitor = (a: ArenaAthlete) => ({
    id: a.id,
    displayName: a.display_name,
    currentElo: a.current_elo,
    gymName: a.gym_name ?? undefined,
    weight: a.current_weight ?? undefined,
    profilePhotoUrl: a.profile_photo_url ?? undefined,
    eloDiff: a.current_elo - currentAthlete.current_elo,
    lookingForCasual: a.looking_for_casual ?? false,
    lookingForRanked: a.looking_for_ranked ?? false,
  });

  return (
    <ArenaContent
      lookingCompetitors={arena.looking_athletes.map((a) => toCompetitor(a))}
      currentAthleteId={currentAthlete.id}
      currentAthleteCasual={currentAthlete.looking_for_casual}
      currentAthleteRanked={currentAthlete.looking_for_ranked}
      challengedIds={arena.challenged_opponent_ids}
    />
  );
}

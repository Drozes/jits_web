import { Suspense } from "react";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { ArenaContent } from "./arena-content";
import { getArenaData } from "@/lib/api/queries";

function ArenaSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="h-7 w-32 bg-muted rounded" />
      <div className="h-24 bg-muted rounded-lg" />
      <div className="h-24 bg-muted rounded-lg" />
      <div className="h-24 bg-muted rounded-lg" />
    </div>
  );
}

export default function ArenaPage() {
  return (
    <Suspense fallback={<ArenaSkeleton />}>
      <ArenaData />
    </Suspense>
  );
}

async function ArenaData() {
  const { athlete: currentAthlete } = await requireAthlete();
  const supabase = await createClient();

  const arena = await getArenaData(supabase);

  type ArenaAthlete = { id: string; display_name: string; current_elo: number; gym_name: string | null; looking_for_casual?: boolean; looking_for_ranked?: boolean };
  const toCompetitor = (a: ArenaAthlete) => ({
    id: a.id,
    displayName: a.display_name,
    currentElo: a.current_elo,
    gymName: a.gym_name ?? undefined,
    eloDiff: a.current_elo - currentAthlete.current_elo,
    lookingForCasual: a.looking_for_casual ?? false,
    lookingForRanked: a.looking_for_ranked ?? false,
  });

  const activityItems = arena.recent_activity.map((a) => ({
    id: a.match_id,
    winnerName: a.winner_name,
    loserName: a.loser_name,
    result: a.result,
    date: a.completed_at,
  }));

  return (
    <ArenaContent
      lookingCompetitors={arena.looking_athletes.map((a) => toCompetitor(a))}
      otherCompetitors={arena.other_athletes.map((a) => toCompetitor(a))}
      activityItems={activityItems}
      currentAthleteId={currentAthlete.id}
      currentAthleteCasual={currentAthlete.looking_for_casual}
      currentAthleteRanked={currentAthlete.looking_for_ranked}
      challengedIds={arena.challenged_opponent_ids}
    />
  );
}

import { Suspense } from "react";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { ArenaContent } from "./arena-content";
import { extractGymName } from "@/lib/utils";
import { getPendingChallengeOpponentIds } from "@/lib/api/queries";

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

  const athleteSelect = "id, display_name, current_elo, looking_for_casual, looking_for_ranked, primary_gym_id, gyms!fk_athletes_primary_gym(name)";

  // Fetch athletes looking for a match (casual or ranked)
  const { data: lookingAthletes } = await supabase
    .from("athletes")
    .select(athleteSelect)
    .eq("status", "active")
    .or("looking_for_casual.eq.true,looking_for_ranked.eq.true")
    .neq("id", currentAthlete.id)
    .order("current_elo", { ascending: false });

  // Fetch other active athletes (not looking)
  const { data: otherAthletes } = await supabase
    .from("athletes")
    .select(athleteSelect)
    .eq("status", "active")
    .eq("looking_for_casual", false)
    .eq("looking_for_ranked", false)
    .neq("id", currentAthlete.id)
    .order("current_elo", { ascending: false })
    .limit(20);

  const toCompetitor = (a: (typeof lookingAthletes extends (infer T)[] | null ? T : never)) => ({
    id: a.id,
    displayName: a.display_name,
    currentElo: a.current_elo,
    gymName: extractGymName(a.gyms as { name: string }[] | null) ?? undefined,
    eloDiff: a.current_elo - currentAthlete.current_elo,
    lookingForCasual: a.looking_for_casual,
    lookingForRanked: a.looking_for_ranked,
  });

  const lookingCompetitors = (lookingAthletes ?? []).map(toCompetitor);
  const otherCompetitors = (otherAthletes ?? []).map(toCompetitor);

  // Fetch pending challenge opponent IDs
  const challengedIds = await getPendingChallengeOpponentIds(supabase, currentAthlete.id);

  // Fetch recent completed matches for activity feed
  const { data: recentMatchParticipants } = await supabase
    .from("match_participants")
    .select(
      `
      outcome,
      athlete_id,
      match_id,
      athletes!fk_participants_athlete(display_name),
      matches(id, created_at, result, status)
    `,
    )
    .eq("outcome", "win")
    .eq("role", "competitor")
    .order("match_id", { ascending: false })
    .limit(5);

  // Batch-fetch all losers in a single query (instead of N+1)
  const activityMatchIds = (recentMatchParticipants ?? []).map((mp) => mp.match_id);
  const { data: allLosers } = activityMatchIds.length
    ? await supabase
        .from("match_participants")
        .select("match_id, athletes!fk_participants_athlete(display_name)")
        .in("match_id", activityMatchIds)
        .eq("outcome", "loss")
    : { data: [] as { match_id: string; athletes: unknown }[] };

  const loserByMatch = new Map<string, string>();
  for (const l of allLosers ?? []) {
    const arr = l.athletes as { display_name: string }[] | null;
    loserByMatch.set(l.match_id, arr?.[0]?.display_name ?? "Unknown");
  }

  const activityItems = (recentMatchParticipants ?? []).map((mp) => {
    const winnerArr = mp.athletes as { display_name: string }[] | null;
    const matchArr = mp.matches as
      | { id: string; created_at: string; result: string | null; status: string }[]
      | null;
    return {
      id: mp.match_id,
      winnerName: winnerArr?.[0]?.display_name ?? "Unknown",
      loserName: loserByMatch.get(mp.match_id) ?? "Unknown",
      result: matchArr?.[0]?.result ?? "submission",
      date: matchArr?.[0]?.created_at ?? "",
    };
  });

  return (
    <ArenaContent
      lookingCompetitors={lookingCompetitors}
      otherCompetitors={otherCompetitors}
      activityItems={activityItems}
      currentAthleteId={currentAthlete.id}
      currentAthleteCasual={currentAthlete.looking_for_casual}
      currentAthleteRanked={currentAthlete.looking_for_ranked}
      challengedIds={Array.from(challengedIds)}
    />
  );
}

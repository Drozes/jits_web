import { Suspense } from "react";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { ArenaContent } from "./arena-content";
import { extractGymName } from "@/lib/utils";

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

  const athleteSelect = "id, display_name, current_elo, looking_for_match, primary_gym_id, gyms!fk_athletes_primary_gym(name)";

  // Fetch athletes looking for a match
  const { data: lookingAthletes } = await supabase
    .from("athletes")
    .select(athleteSelect)
    .eq("status", "active")
    .eq("looking_for_match", true)
    .neq("id", currentAthlete.id)
    .order("current_elo", { ascending: false });

  // Fetch other active athletes (not looking)
  const { data: otherAthletes } = await supabase
    .from("athletes")
    .select(athleteSelect)
    .eq("status", "active")
    .eq("looking_for_match", false)
    .neq("id", currentAthlete.id)
    .order("current_elo", { ascending: false })
    .limit(20);

  const toCompetitor = (a: (typeof lookingAthletes extends (infer T)[] | null ? T : never)) => ({
    id: a.id,
    displayName: a.display_name,
    currentElo: a.current_elo,
    gymName: extractGymName(a.gyms as { name: string }[] | null) ?? undefined,
    eloDiff: a.current_elo - currentAthlete.current_elo,
    lookingForMatch: a.looking_for_match ?? false,
  });

  const lookingCompetitors = (lookingAthletes ?? []).map(toCompetitor);
  const otherCompetitors = (otherAthletes ?? []).map(toCompetitor);

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

  // For each winning participant, get the loser's name
  const activityItems = await Promise.all(
    (recentMatchParticipants ?? []).map(async (mp) => {
      const winnerArr = mp.athletes as { display_name: string }[] | null;
      const matchArr = mp.matches as
        | { id: string; created_at: string; result: string | null; status: string }[]
        | null;
      const match = matchArr?.[0];

      const { data: loser } = await supabase
        .from("match_participants")
        .select("athletes!fk_participants_athlete(display_name)")
        .eq("match_id", mp.match_id)
        .eq("outcome", "loss")
        .single();

      const loserArr = loser?.athletes as { display_name: string }[] | null;

      return {
        id: mp.match_id,
        winnerName: winnerArr?.[0]?.display_name ?? "Unknown",
        loserName: loserArr?.[0]?.display_name ?? "Unknown",
        result: match?.result ?? "submission",
        date: match?.created_at ?? "",
      };
    }),
  );

  return (
    <ArenaContent
      lookingCompetitors={lookingCompetitors}
      otherCompetitors={otherCompetitors}
      activityItems={activityItems}
      currentAthleteId={currentAthlete.id}
      currentAthleteLooking={currentAthlete.looking_for_match ?? false}
    />
  );
}

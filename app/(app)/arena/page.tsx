import { Suspense } from "react";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { ArenaContent } from "./arena-content";
import { extractGymName } from "@/lib/utils";

export default function ArenaPage() {
  return (
    <Suspense>
      <ArenaData />
    </Suspense>
  );
}

async function ArenaData() {
  const { athlete: currentAthlete } = await requireAthlete();
  const supabase = await createClient();

  // Fetch other athletes ordered by ELO proximity to current user
  const { data: athletes } = await supabase
    .from("athletes")
    .select("id, display_name, current_elo, looking_for_match, primary_gym_id, gyms!athletes_primary_gym_id_fkey(name)")
    .eq("status", "active")
    .neq("id", currentAthlete.id)
    .order("current_elo", { ascending: false })
    .limit(20);

  const competitors = (athletes ?? []).map((a) => ({
    id: a.id,
    displayName: a.display_name,
    currentElo: a.current_elo,
    gymName: extractGymName(a.gyms as { name: string }[] | null) ?? undefined,
    eloDiff: a.current_elo - currentAthlete.current_elo,
    lookingForMatch: a.looking_for_match ?? false,
  }));

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
      competitors={competitors}
      activityItems={activityItems}
      currentAthleteId={currentAthlete.id}
      currentAthleteLooking={currentAthlete.looking_for_match ?? false}
    />
  );
}

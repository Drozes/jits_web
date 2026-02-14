import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { MatchCard } from "@/components/domain/match-card";
import { Swords } from "lucide-react";

export async function DashboardMatches() {
  const { athlete } = await requireAthlete();
  const supabase = await createClient();

  const { data: recentMatches } = await supabase
    .from("match_participants")
    .select(
      `
      outcome,
      elo_delta,
      match_id,
      matches(id, created_at, status),
      athletes!fk_participants_athlete(display_name)
    `,
    )
    .eq("athlete_id", athlete.id)
    .not("outcome", "is", null)
    .order("match_id", { ascending: false })
    .limit(5);

  const matchesWithOpponents = await Promise.all(
    (recentMatches ?? []).map(async (mp) => {
      const { data: opponent } = await supabase
        .from("match_participants")
        .select("athletes!fk_participants_athlete(display_name)")
        .eq("match_id", mp.match_id)
        .neq("athlete_id", athlete.id)
        .eq("role", "competitor")
        .single();

      const athletes = opponent?.athletes as
        | { display_name: string }[]
        | null;
      const opponentName = athletes?.[0]?.display_name ?? "Unknown";

      const matchArr = mp.matches as
        | { id: string; created_at: string; status: string }[]
        | null;
      const match = matchArr?.[0] ?? null;

      return {
        id: mp.match_id,
        opponentName,
        result: mp.outcome as "win" | "loss" | "draw",
        eloDelta: mp.elo_delta,
        date: match?.created_at ?? "",
      };
    }),
  );

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Swords className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Recent Matches</h2>
      </div>
      {matchesWithOpponents.length > 0 ? (
        <div className="flex flex-col gap-2">
          {matchesWithOpponents.map((match) => (
            <MatchCard
              key={match.id}
              type="match"
              opponentName={match.opponentName}
              result={match.result}
              eloDelta={match.eloDelta}
              date={match.date}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
          <p className="text-sm">
            No matches yet — find an opponent in the Arena!
          </p>
        </div>
      )}
    </section>
  );
}

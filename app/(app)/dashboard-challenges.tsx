import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { MatchCard } from "@/components/domain/match-card";
import { Zap } from "lucide-react";

export async function DashboardChallenges() {
  const { athlete } = await requireAthlete();
  const supabase = await createClient();

  const { data: pendingChallenges } = await supabase
    .from("challenges")
    .select(
      "id, created_at, status, challenger:athletes!fk_challenges_challenger(display_name)",
    )
    .eq("opponent_id", athlete.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(5);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Zap className="h-5 w-5 text-yellow-500" />
        <h2 className="text-lg font-semibold">Incoming Challenges</h2>
      </div>
      {pendingChallenges && pendingChallenges.length > 0 ? (
        <div className="flex flex-col gap-2">
          {pendingChallenges.map((challenge) => {
            const challengerArr = challenge.challenger as
              | { display_name: string }[]
              | null;
            const challenger = challengerArr?.[0] ?? null;
            return (
              <MatchCard
                key={challenge.id}
                type="challenge"
                opponentName={challenger?.display_name ?? "Unknown"}
                status="Pending"
                date={challenge.created_at}
              />
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
          <p className="text-sm">No pending challenges</p>
        </div>
      )}
    </section>
  );
}

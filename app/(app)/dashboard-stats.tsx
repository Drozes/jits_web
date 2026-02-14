import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { computeStats, computeWinStreak } from "@/lib/utils";
import { StatOverview } from "@/components/domain/stat-overview";

export async function DashboardStats() {
  const { athlete } = await requireAthlete();
  const supabase = await createClient();

  const { data: outcomes } = await supabase
    .from("match_participants")
    .select("outcome")
    .eq("athlete_id", athlete.id)
    .not("outcome", "is", null);

  const { wins, losses, winRate } = computeStats(outcomes ?? []);

  const { data: recentOutcomes } = await supabase
    .from("match_participants")
    .select("outcome, match_id, matches(created_at)")
    .eq("athlete_id", athlete.id)
    .not("outcome", "is", null)
    .order("match_id", { ascending: false })
    .limit(50);

  const winStreak = computeWinStreak(recentOutcomes ?? []);

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold">
          Hey, {athlete.display_name}
        </h1>
        <p className="text-sm text-muted-foreground">
          Here&apos;s your overview
        </p>
      </div>
      <StatOverview
        athlete={athlete}
        stats={{ wins, losses, winRate, winStreak }}
      />
    </>
  );
}

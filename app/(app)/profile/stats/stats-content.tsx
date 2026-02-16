import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { StatsTabs } from "./stats-tabs";
import { getMatchHistory, getEloHistory } from "@/lib/api/queries";

export async function StatsContent() {
  const { athlete } = await requireAthlete();
  const supabase = await createClient();

  // Fetch match history and ELO history via RPCs (bypass RLS)
  const [matchHistory, eloHistory] = await Promise.all([
    getMatchHistory(supabase, athlete.id),
    getEloHistory(supabase, athlete.id),
  ]);

  // Compute stats from match history
  const wins = matchHistory.filter((m) => m.athlete_outcome === "win").length;
  const losses = matchHistory.filter((m) => m.athlete_outcome === "loss").length;
  const draws = matchHistory.filter((m) => m.athlete_outcome === "draw").length;
  const total = wins + losses + draws;
  const winRate = total > 0 ? Math.round((wins / (wins + losses || 1)) * 100) : 0;

  // Win streak (matchHistory is newest first)
  let winStreak = 0;
  for (const m of matchHistory) {
    if (m.athlete_outcome === "win") winStreak++;
    else break;
  }

  // ELO change this month
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const eloThisMonth = matchHistory
    .filter((m) => new Date(m.completed_at) >= startOfMonth)
    .reduce((sum, m) => sum + (m.elo_delta ?? 0), 0);

  // Recent performance periods
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  function periodStats(since: Date) {
    const filtered = matchHistory.filter(
      (m) => new Date(m.completed_at) >= since,
    );
    const w = filtered.filter((m) => m.athlete_outcome === "win").length;
    const l = filtered.filter((m) => m.athlete_outcome === "loss").length;
    const elo = filtered.reduce((sum, m) => sum + (m.elo_delta ?? 0), 0);
    return { wins: w, losses: l, eloChange: elo };
  }

  const recentPerformance = [
    { period: "This Week", ...periodStats(oneWeekAgo) },
    { period: "This Month", ...periodStats(oneMonthAgo) },
    { period: "Last 3 Months", ...periodStats(threeMonthsAgo) },
  ];

  // Submission stats
  const submissionWins = matchHistory.filter(
    (m) => m.athlete_outcome === "win" && m.result === "submission",
  ).length;
  const submissionRate =
    wins > 0 ? Math.round((submissionWins / wins) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-bold">Performance Stats</h2>

      {/* Quick stats header */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <Card>
          <CardContent className="py-3 px-2">
            <p className="text-2xl font-bold text-primary tabular-nums">
              {athlete.current_elo}
            </p>
            <p className="text-xs text-muted-foreground">Current ELO</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-2">
            <p className="text-2xl font-bold tabular-nums">{wins}</p>
            <p className="text-xs text-muted-foreground">Total Wins</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-2">
            <p className="text-2xl font-bold text-primary tabular-nums">
              {winRate}%
            </p>
            <p className="text-xs text-muted-foreground">Win Rate</p>
          </CardContent>
        </Card>
      </div>

      <StatsTabs
        winStreak={winStreak}
        eloThisMonth={eloThisMonth}
        submissionRate={submissionRate}
        totalMatches={total}
        recentPerformance={recentPerformance}
        matchHistory={matchHistory}
        eloHistory={eloHistory}
        currentElo={athlete.current_elo}
      />
    </div>
  );
}

import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { StatsTabs } from "./stats-tabs";
import { computeStats, computeWinStreak } from "@/lib/utils";
import { getMatchHistory, getEloHistory } from "@/lib/api/queries";

export async function StatsContent() {
  const { athlete } = await requireAthlete();
  const supabase = await createClient();

  // Fetch all match participation outcomes
  const { data: participations } = await supabase
    .from("match_participants")
    .select("outcome, elo_delta, match_id, matches(created_at, duration_seconds, result)")
    .eq("athlete_id", athlete.id)
    .not("outcome", "is", null)
    .order("match_id", { ascending: false });

  const { wins, losses, winRate } = computeStats(participations ?? []);
  const draws =
    participations?.filter((p) => p.outcome === "draw").length ?? 0;
  const total = wins + losses + draws;
  const winStreak = computeWinStreak(participations ?? []);

  // Calculate ELO change this month
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonthParticipations =
    participations?.filter((p) => {
      const matchArr = p.matches as
        | { created_at: string; duration_seconds: number; result: string | null }[]
        | null;
      const match = matchArr?.[0];
      return match && new Date(match.created_at) >= startOfMonth;
    }) ?? [];
  const eloThisMonth = thisMonthParticipations.reduce(
    (sum, p) => sum + (p.elo_delta ?? 0),
    0,
  );

  // Recent performance periods
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  function periodStats(since: Date) {
    const filtered =
      participations?.filter((p) => {
        const matchArr = p.matches as
          | { created_at: string; duration_seconds: number; result: string | null }[]
          | null;
        const match = matchArr?.[0];
        return match && new Date(match.created_at) >= since;
      }) ?? [];
    const w = filtered.filter((p) => p.outcome === "win").length;
    const l = filtered.filter((p) => p.outcome === "loss").length;
    const elo = filtered.reduce((sum, p) => sum + (p.elo_delta ?? 0), 0);
    return { wins: w, losses: l, eloChange: elo };
  }

  const recentPerformance = [
    { period: "This Week", ...periodStats(oneWeekAgo) },
    { period: "This Month", ...periodStats(oneMonthAgo) },
    { period: "Last 3 Months", ...periodStats(threeMonthsAgo) },
  ];

  // Submission stats
  const submissionWins =
    participations?.filter((p) => {
      const matchArr = p.matches as
        | { created_at: string; duration_seconds: number; result: string | null }[]
        | null;
      const match = matchArr?.[0];
      return p.outcome === "win" && match?.result === "submission";
    }).length ?? 0;
  const submissionRate =
    wins > 0 ? Math.round((submissionWins / wins) * 100) : 0;

  // Fetch match history and ELO history in parallel
  const [matchHistory, eloHistory] = await Promise.all([
    getMatchHistory(supabase, athlete.id),
    getEloHistory(supabase, athlete.id),
  ]);

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

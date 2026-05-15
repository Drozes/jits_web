import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { Plate, EloTile } from "@/components/ui/elo-system";
import { StatsTabs } from "./stats-tabs";
import { MilestoneProgress } from "./milestone-progress";
import {
  getMatchHistory,
  getEloHistory,
  getWeeklyMatchActivity,
  getSubmissionBreakdown,
  getWeightClassStats,
} from "@jits/shared/api/queries";

export async function StatsContent() {
  const { athlete } = await requireAthlete();
  const supabase = await createClient();

  const [matchHistory, eloHistory, weeklyActivity, submissions, weightStats] =
    await Promise.all([
      getMatchHistory(supabase, athlete.id),
      getEloHistory(supabase, athlete.id),
      getWeeklyMatchActivity(supabase, athlete.id),
      getSubmissionBreakdown(supabase, athlete.id),
      getWeightClassStats(supabase, athlete.id),
    ]);

  const wins = matchHistory.filter((m) => m.athlete_outcome === "win").length;
  const losses = matchHistory.filter((m) => m.athlete_outcome === "loss").length;
  const draws = matchHistory.filter((m) => m.athlete_outcome === "draw").length;
  const total = wins + losses + draws;
  const winRate = total > 0 ? Math.round((wins / (wins + losses || 1)) * 100) : 0;

  let winStreak = 0;
  for (const m of matchHistory) {
    if (m.athlete_outcome === "win") winStreak++;
    else break;
  }

  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const eloThisMonth = matchHistory
    .filter((m) => new Date(m.completed_at) >= startOfMonth)
    .reduce((sum, m) => sum + (m.elo_delta ?? 0), 0);

  function periodStats(since: Date) {
    const filtered = matchHistory.filter((m) => new Date(m.completed_at) >= since);
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

  const submissionWins = matchHistory.filter(
    (m) => m.athlete_outcome === "win" && m.result === "submission",
  ).length;
  const submissionRate = wins > 0 ? Math.round((submissionWins / wins) * 100) : 0;

  return (
    <div className="flex flex-col gap-4 animate-page-in">
      <h2
        className="font-heading uppercase"
        style={{
          fontFamily: "var(--font-heading)",
          fontWeight: 700,
          fontSize: "var(--size-label-l)",
          letterSpacing: "var(--ls-caps-l)",
          color: "var(--text-secondary)",
        }}
      >
        Performance
      </h2>

      <div className="grid grid-cols-3 gap-2">
        <EloTile label="ELO" value={athlete.current_elo} size="medium" />
        <EloTile label="Wins" value={wins} size="medium" />
        <EloTile label="Win Rate" value={`${winRate}%`} size="medium" />
      </div>

      <Plate>
        <h3
          className="font-heading uppercase"
          style={{
            fontFamily: "var(--font-heading)",
            fontWeight: 700,
            fontSize: "var(--size-label-s)",
            letterSpacing: "var(--ls-caps-xl)",
            color: "var(--text-tertiary)",
            marginBottom: "var(--space-3)",
          }}
        >
          Rating Milestone
        </h3>
        <MilestoneProgress elo={athlete.current_elo} />
      </Plate>

      <StatsTabs
        winStreak={winStreak}
        eloThisMonth={eloThisMonth}
        submissionRate={submissionRate}
        totalMatches={total}
        recentPerformance={recentPerformance}
        matchHistory={matchHistory}
        eloHistory={eloHistory}
        currentElo={athlete.current_elo}
        weeklyActivity={weeklyActivity}
        submissions={submissions}
        weightClassStats={weightStats}
      />
    </div>
  );
}

import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, Swords, Trophy, Flame } from "lucide-react";
import type { Athlete } from "@/types/athlete";

interface AthleteStats {
  wins: number;
  losses: number;
  draws: number;
  winStreak: number;
  rank: number;
  bestRank: number;
  bestWinStreak: number;
}

interface StatOverviewProps {
  athlete: Athlete;
  stats: AthleteStats;
}

function PeakLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] text-muted-foreground mt-0.5">
      {children}
    </p>
  );
}

export function StatOverview({ athlete, stats }: StatOverviewProps) {
  const showPeakElo = athlete.highest_elo > athlete.current_elo;
  const showBestRank = stats.bestRank < stats.rank;
  const showBestStreak = stats.bestWinStreak > stats.winStreak;

  return (
    <div className="grid grid-cols-2 gap-3 stagger-children">
      <Card className="overflow-hidden">
        <CardContent className="relative pt-4 pb-4">
          <div className="absolute -right-3 -top-3 h-16 w-16 rounded-full bg-primary/5" />
          <div className="flex items-center gap-1.5 mb-1.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10">
              <TrendingUp className="h-3.5 w-3.5 text-primary" />
            </div>
            <p className="text-xs font-medium text-muted-foreground">ELO Rating</p>
          </div>
          <p className="text-2xl font-bold tabular-nums">
            {athlete.current_elo}
          </p>
          {showPeakElo && <PeakLabel>peak: {athlete.highest_elo}</PeakLabel>}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="relative pt-4 pb-4">
          <div className="absolute -right-3 -top-3 h-16 w-16 rounded-full bg-yellow-500/5" />
          <div className="flex items-center gap-1.5 mb-1.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-yellow-500/10">
              <Trophy className="h-3.5 w-3.5 text-yellow-500" />
            </div>
            <p className="text-xs font-medium text-muted-foreground">Rank</p>
          </div>
          <p className="text-2xl font-bold tabular-nums">
            #{stats.rank}
          </p>
          {showBestRank && <PeakLabel>best: #{stats.bestRank}</PeakLabel>}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="relative pt-4 pb-4">
          <div className="absolute -right-3 -top-3 h-16 w-16 rounded-full bg-muted/50" />
          <div className="flex items-center gap-1.5 mb-1.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-muted">
              <Swords className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <p className="text-xs font-medium text-muted-foreground">Record</p>
          </div>
          <p className="text-2xl font-bold tabular-nums">
            <span className="text-green-500">{stats.wins}</span>
            <span className="text-muted-foreground/50 mx-0.5">-</span>
            <span className="text-amber-500">{stats.draws}</span>
            <span className="text-muted-foreground/50 mx-0.5">-</span>
            <span className="text-red-500">{stats.losses}</span>
          </p>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="relative pt-4 pb-4">
          <div className="absolute -right-3 -top-3 h-16 w-16 rounded-full bg-orange-500/5" />
          <div className="flex items-center gap-1.5 mb-1.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-orange-500/10">
              <Flame className="h-3.5 w-3.5 text-orange-500" />
            </div>
            <p className="text-xs font-medium text-muted-foreground">Win Streak</p>
          </div>
          <p className="text-2xl font-bold tabular-nums">
            {stats.winStreak}
          </p>
          {showBestStreak && <PeakLabel>best: {stats.bestWinStreak}</PeakLabel>}
        </CardContent>
      </Card>
    </div>
  );
}

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
          <div className="absolute -right-2 -top-2 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <TrendingUp className="h-5 w-5 text-primary/70" />
          </div>
          <p className="text-sm font-medium text-muted-foreground mb-1.5">ELO Rating</p>
          <p className="text-2xl font-bold tabular-nums">
            {athlete.current_elo}
          </p>
          {showPeakElo && <PeakLabel>peak: {athlete.highest_elo}</PeakLabel>}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="relative pt-4 pb-4">
          <div className="absolute -right-2 -top-2 flex h-14 w-14 items-center justify-center rounded-full bg-yellow-500/10">
            <Trophy className="h-5 w-5 text-yellow-500/70" />
          </div>
          <p className="text-sm font-medium text-muted-foreground mb-1.5">Rank</p>
          <p className="text-2xl font-bold tabular-nums">
            #{stats.rank}
          </p>
          {showBestRank && <PeakLabel>best: #{stats.bestRank}</PeakLabel>}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="relative pt-4 pb-4">
          <div className="absolute -right-2 -top-2 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Swords className="h-5 w-5 text-muted-foreground/70" />
          </div>
          <p className="text-sm font-medium text-muted-foreground mb-1.5">Record</p>
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
          <div className="absolute -right-2 -top-2 flex h-14 w-14 items-center justify-center rounded-full bg-orange-500/10">
            <Flame className="h-5 w-5 text-orange-500/70" />
          </div>
          <p className="text-sm font-medium text-muted-foreground mb-1.5">Win Streak</p>
          <p className="text-2xl font-bold tabular-nums">
            {stats.winStreak}
          </p>
          {showBestStreak && <PeakLabel>best: {stats.bestWinStreak}</PeakLabel>}
        </CardContent>
      </Card>
    </div>
  );
}

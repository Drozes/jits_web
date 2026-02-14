import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, Swords, Percent, Flame } from "lucide-react";
import type { Athlete } from "@/types/athlete";

interface AthleteStats {
  wins: number;
  losses: number;
  winRate: number;
  winStreak: number;
}

interface StatOverviewProps {
  athlete: Athlete;
  stats: AthleteStats;
}

export function StatOverview({ athlete, stats }: StatOverviewProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp className="h-3.5 w-3.5 text-primary" />
            <p className="text-xs text-muted-foreground">ELO Rating</p>
          </div>
          <p className="text-2xl font-bold text-primary tabular-nums">
            {athlete.current_elo}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-1.5 mb-1">
            <Swords className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Record</p>
          </div>
          <p className="text-2xl font-bold tabular-nums">
            <span className="text-green-500">{stats.wins}</span>
            <span className="text-muted-foreground mx-1">-</span>
            <span className="text-red-500">{stats.losses}</span>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-1.5 mb-1">
            <Percent className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Win Rate</p>
          </div>
          <p className="text-2xl font-bold tabular-nums">
            {stats.winRate}%
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-1.5 mb-1">
            <Flame className="h-3.5 w-3.5 text-orange-500" />
            <p className="text-xs text-muted-foreground">Win Streak</p>
          </div>
          <p className="text-2xl font-bold tabular-nums">
            {stats.winStreak}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

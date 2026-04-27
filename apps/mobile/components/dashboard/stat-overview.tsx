import * as React from "react";
import { Text, View } from "react-native";
import { Flame, Swords, TrendingUp, Trophy } from "lucide-react-native";
import { Card, CardContent } from "../ui/card";

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
  athlete: { current_elo: number; highest_elo: number };
  stats: AthleteStats;
}

function PeakLabel({ children }: { children: React.ReactNode }) {
  return <Text className="text-[10px] text-muted-foreground mt-0.5">{children}</Text>;
}

export function StatOverview({ athlete, stats }: StatOverviewProps) {
  const showPeakElo = athlete.highest_elo > athlete.current_elo;
  const showBestRank = stats.bestRank > 0 && stats.bestRank < stats.rank;
  const showBestStreak = stats.bestWinStreak > stats.winStreak;

  return (
    <View className="flex-row flex-wrap gap-3">
      <View className="flex-1 min-w-[45%]">
        <Card className="overflow-hidden">
          <CardContent className="relative pt-4 pb-4">
            <View className="absolute -right-2 -top-2 h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <TrendingUp size={20} className="text-primary" />
            </View>
            <Text className="text-sm font-medium text-muted-foreground mb-1.5">ELO Rating</Text>
            <Text className="text-2xl font-bold tabular-nums text-foreground">{athlete.current_elo}</Text>
            {showPeakElo ? <PeakLabel>peak: {athlete.highest_elo}</PeakLabel> : null}
          </CardContent>
        </Card>
      </View>

      <View className="flex-1 min-w-[45%]">
        <Card className="overflow-hidden">
          <CardContent className="relative pt-4 pb-4">
            <View className="absolute -right-2 -top-2 h-14 w-14 items-center justify-center rounded-full bg-yellow-500/10">
              <Trophy size={20} className="text-yellow-500" />
            </View>
            <Text className="text-sm font-medium text-muted-foreground mb-1.5">Rank</Text>
            <Text className="text-2xl font-bold tabular-nums text-foreground">
              {stats.rank > 0 ? `#${stats.rank}` : "—"}
            </Text>
            {showBestRank ? <PeakLabel>best: #{stats.bestRank}</PeakLabel> : null}
          </CardContent>
        </Card>
      </View>

      <View className="flex-1 min-w-[45%]">
        <Card className="overflow-hidden">
          <CardContent className="relative pt-4 pb-4">
            <View className="absolute -right-2 -top-2 h-14 w-14 items-center justify-center rounded-full bg-muted">
              <Swords size={20} className="text-muted-foreground" />
            </View>
            <Text className="text-sm font-medium text-muted-foreground mb-1.5">Record</Text>
            <Text className="text-2xl font-bold tabular-nums">
              <Text className="text-success">{stats.wins}</Text>
              <Text className="text-muted-foreground"> - </Text>
              <Text className="text-amber-500">{stats.draws}</Text>
              <Text className="text-muted-foreground"> - </Text>
              <Text className="text-destructive">{stats.losses}</Text>
            </Text>
          </CardContent>
        </Card>
      </View>

      <View className="flex-1 min-w-[45%]">
        <Card className="overflow-hidden">
          <CardContent className="relative pt-4 pb-4">
            <View className="absolute -right-2 -top-2 h-14 w-14 items-center justify-center rounded-full bg-orange-500/10">
              <Flame size={20} className="text-orange-500" />
            </View>
            <Text className="text-sm font-medium text-muted-foreground mb-1.5">Win Streak</Text>
            <Text className="text-2xl font-bold tabular-nums text-foreground">{stats.winStreak}</Text>
            {showBestStreak ? <PeakLabel>best: {stats.bestWinStreak}</PeakLabel> : null}
          </CardContent>
        </Card>
      </View>
    </View>
  );
}

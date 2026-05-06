import * as React from "react";
import { Text, View } from "react-native";
import { Card, CardContent } from "../ui/card";

interface ProfileQuickStatsProps {
  totalMatches: number;
  winStreak: number;
  bestWinStreak: number;
  eloThisMonth: number;
}

function StatCard({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <View className="flex-1 min-w-[45%]">
      <Card>
        <CardContent className="py-3 px-3 items-center">
          <Text className={`text-xl font-mono tabular-nums ${valueClassName ?? "text-foreground"}`}>
            {value}
          </Text>
          <Text className="text-xs text-muted-foreground mt-0.5">{label}</Text>
        </CardContent>
      </Card>
    </View>
  );
}

export function ProfileQuickStats({ totalMatches, winStreak, bestWinStreak, eloThisMonth }: ProfileQuickStatsProps) {
  const eloFormatted = eloThisMonth > 0 ? `+${eloThisMonth}` : `${eloThisMonth}`;
  const eloClass = eloThisMonth > 0 ? "text-success" : eloThisMonth < 0 ? "text-destructive" : "text-foreground";

  return (
    <View className="flex-row flex-wrap gap-3">
      <StatCard label="Total Matches" value={String(totalMatches)} />
      <StatCard label="Current Streak" value={String(winStreak)} />
      <StatCard label="Best Streak" value={String(bestWinStreak)} />
      <StatCard label="ELO This Month" value={eloFormatted} valueClassName={eloClass} />
    </View>
  );
}

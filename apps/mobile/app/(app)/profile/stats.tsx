import * as React from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronLeft, LineChart, Swords } from "lucide-react-native";
import { useRequireAthlete } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { supabase } from "@/lib/supabase/client";
import { getEloHistory, getMatchHistory } from "@jits/shared/api/queries";
import type { EloHistoryRow, MatchHistoryRow } from "@jits/shared/types/composites";
import { Card, CardContent } from "@/components/ui/card";
import { MatchCard } from "@/components/match-card";
import { cn } from "@/lib/cn";
import { toast } from "@/components/ui/toast";
import type { MatchOutcome } from "@jits/shared/constants";

type Filter = "all" | "ranked" | "casual";

const filters: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "ranked", label: "Ranked" },
  { value: "casual", label: "Casual" },
];

interface StatsData {
  matchHistory: MatchHistoryRow[];
  eloHistory: EloHistoryRow[];
}

export default function ProfileStatsScreen() {
  const { athlete } = useRequireAthlete();
  const router = useRouter();
  const tokens = useThemedTokens();
  const [data, setData] = React.useState<StatsData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [refreshTick, setRefreshTick] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);
  const [filter, setFilter] = React.useState<Filter>("all");

  React.useEffect(() => {
    if (!athlete) return;
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      try {
        const [matchHistory, eloHistory] = await Promise.all([
          getMatchHistory(supabase, athlete.id),
          getEloHistory(supabase, athlete.id),
        ]);
        if (!cancelled) setData({ matchHistory, eloHistory });
      } catch (err) {
        console.error("[stats] fetch failed", err);
        if (!cancelled) toast.error("Could not load stats");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [athlete?.id, refreshTick]);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    setRefreshTick((n) => n + 1);
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  const matchHistory = data?.matchHistory ?? [];
  const filtered = filter === "all" ? matchHistory : matchHistory.filter((m) => m.match_type === filter);
  const wins = filtered.filter((m) => m.athlete_outcome === "win").length;
  const losses = filtered.filter((m) => m.athlete_outcome === "loss").length;
  const draws = filtered.filter((m) => m.athlete_outcome === "draw").length;
  const total = wins + losses;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

  if (!athlete) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator color={tokens.primary} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      {/* Top bar */}
      <View className="flex-row items-center px-4 pt-12 pb-3 gap-2">
        <Pressable onPress={() => router.back()} className="h-9 w-9 items-center justify-center rounded-full active:bg-muted/60" accessibilityRole="button">
          <ChevronLeft size={22} className="text-foreground" />
        </Pressable>
        <Text className="text-lg font-semibold text-foreground">Stats</Text>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(m) => m.match_id}
        contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.primary} />}
        ListHeaderComponent={
          <View className="gap-4 mb-2">
            {/* Quick stats */}
            <View className="flex-row gap-3">
              <Card className="flex-1">
                <CardContent className="py-3 px-2 items-center">
                  <Text className="text-2xl font-bold tabular-nums text-foreground">{athlete.current_elo}</Text>
                  <Text className="text-xs text-muted-foreground">Current ELO</Text>
                </CardContent>
              </Card>
              <Card className="flex-1">
                <CardContent className="py-3 px-2 items-center">
                  <Text className="text-2xl font-bold tabular-nums text-foreground">{wins}</Text>
                  <Text className="text-xs text-muted-foreground">Total Wins</Text>
                </CardContent>
              </Card>
              <Card className="flex-1">
                <CardContent className="py-3 px-2 items-center">
                  <Text className="text-2xl font-bold tabular-nums text-success">{winRate}%</Text>
                  <Text className="text-xs text-muted-foreground">Win Rate</Text>
                </CardContent>
              </Card>
            </View>

            {/* ELO history placeholder */}
            <Card>
              <CardContent className="p-4 items-center gap-2">
                <View className="flex-row items-center gap-2">
                  <LineChart size={16} className="text-primary" />
                  <Text className="text-sm font-semibold text-foreground">ELO History</Text>
                </View>
                <View className="h-32 w-full items-center justify-center bg-muted/40 rounded-lg">
                  <Text className="text-xs text-muted-foreground text-center px-4">
                    {data?.eloHistory.length
                      ? `${data.eloHistory.length} rating points recorded. Chart visualization coming in polish phase.`
                      : "ELO history chart (placeholder)"}
                  </Text>
                </View>
              </CardContent>
            </Card>

            {/* Filter row */}
            <View className="flex-row items-center justify-between">
              <View className="flex-row gap-1">
                {filters.map((f) => (
                  <Pressable
                    key={f.value}
                    onPress={() => setFilter(f.value)}
                    className={cn(
                      "rounded-full px-3 py-1",
                      filter === f.value ? "bg-primary" : "bg-muted",
                    )}
                  >
                    <Text className={cn("text-xs font-medium", filter === f.value ? "text-primary-foreground" : "text-muted-foreground")}>
                      {f.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View className="flex-row items-center gap-1.5">
                <Text className="text-xs font-semibold text-success tabular-nums">{wins}W</Text>
                <Text className="text-xs text-muted-foreground">-</Text>
                <Text className="text-xs font-semibold text-destructive tabular-nums">{losses}L</Text>
                <Text className="text-xs text-muted-foreground">-</Text>
                <Text className="text-xs font-semibold text-muted-foreground tabular-nums">{draws}D</Text>
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <View className="py-12 items-center"><ActivityIndicator color={tokens.primary} /></View>
          ) : (
            <View className="py-12 items-center">
              <Swords size={32} className="text-muted-foreground" />
              <Text className="font-medium text-foreground mt-2">No matches yet</Text>
              <Text className="text-sm text-muted-foreground mt-1">
                {filter === "all" ? "Complete a match to see your history" : `No ${filter} matches yet`}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <MatchCard
            type="match"
            opponentName={item.opponent_display_name}
            result={item.athlete_outcome as MatchOutcome}
            matchType={item.match_type as "ranked" | "casual"}
            eloDelta={item.match_type === "ranked" ? item.elo_delta : undefined}
            date={item.completed_at}
          />
        )}
      />
    </View>
  );
}

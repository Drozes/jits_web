import * as React from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { Swords } from "lucide-react-native";
import { useRouter } from "expo-router";
import { useRequireAthlete } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { supabase } from "@/lib/supabase/client";
import {
  getEloHistory,
  getMatchHistory,
  getWeeklyMatchActivity,
  getSubmissionBreakdown,
} from "@jits/shared/api/queries";
import type { EloHistoryRow, MatchHistoryRow } from "@jits/shared/types/composites";
import type { WeeklyActivity, SubmissionBreakdown } from "@jits/shared/types/analytics";
import { MatchCard } from "@/components/match-card";
import { SubmissionBreakdownSection } from "@/components/profile/submission-breakdown";
import { WeeklyActivitySection } from "@/components/profile/weekly-activity";
import { MilestoneProgress } from "@/components/profile/milestone-progress";
import { AppHeader } from "@/components/layout/app-header";
import { MetaTag } from "@/components/ui/elo-system";
import { toast } from "@/components/ui/toast";
import { matchDetailHref } from "@/lib/match-detail/href";
import type { MatchOutcome } from "@jits/shared/constants";
import { recordedEloDelta } from "@jits/shared/utils";

interface StatsData {
  matchHistory: MatchHistoryRow[];
  eloHistory: EloHistoryRow[];
  weeklyActivity: WeeklyActivity[];
  submissions: SubmissionBreakdown[];
}

export default function ProfileStatsScreen() {
  const { athlete } = useRequireAthlete();
  const tokens = useThemedTokens();
  const router = useRouter();
  const [data, setData] = React.useState<StatsData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [refreshTick, setRefreshTick] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);

  React.useEffect(() => {
    if (!athlete) return;
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      try {
        const [matchHistory, eloHistory, weeklyActivity, submissions] = await Promise.all([
          getMatchHistory(supabase, athlete.id),
          getEloHistory(supabase, athlete.id),
          getWeeklyMatchActivity(supabase, athlete.id),
          getSubmissionBreakdown(supabase, athlete.id),
        ]);
        if (!cancelled) setData({ matchHistory, eloHistory, weeklyActivity, submissions });
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
  // Every match is ranked: the record covers all completed matches (no filter).
  const wins = matchHistory.filter((m) => m.athlete_outcome === "win").length;
  const losses = matchHistory.filter((m) => m.athlete_outcome === "loss").length;
  const draws = matchHistory.filter((m) => m.athlete_outcome === "draw").length;
  const total = wins + losses;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

  if (!athlete) {
    return (
      <View className="flex-1 bg-surface items-center justify-center">
        <ActivityIndicator color={tokens.accentCta} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface">
      <AppHeader title="Stats" back />

      <FlatList
        data={matchHistory}
        keyExtractor={(m) => m.match_id}
        contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 8 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.accentCta} />}
        ListHeaderComponent={
          <StatsHeader
            athlete={athlete}
            data={data}
            wins={wins}
            losses={losses}
            draws={draws}
            winRate={winRate}
          />
        }
        ListEmptyComponent={
          isLoading ? (
            <View className="py-12 items-center"><ActivityIndicator color={tokens.accentCta} /></View>
          ) : (
            <View className="py-12 items-center gap-2">
              <Swords size={28} color={tokens.textTertiary} />
              <Text className="font-heading text-[14px] text-ink uppercase tracking-caps">No matches yet</Text>
              <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l">
                Complete a match to see your history
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <MatchCard
            type="match"
            opponentName={item.opponent_display_name}
            result={item.athlete_outcome as MatchOutcome}
            eloDelta={recordedEloDelta(item) ?? undefined}
            date={item.completed_at}
            onPress={() => router.push(matchDetailHref(item.match_id))}
          />
        )}
      />
    </View>
  );
}

interface StatTileProps {
  label: string;
  value: string | number;
  valueClassName?: string;
}

function StatTile({ label, value, valueClassName }: StatTileProps) {
  return (
    <View className="flex-1 bg-surface-3 border border-hairline rounded-md px-3 py-3 items-center">
      <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl">
        {label}
      </Text>
      <Text
        className={`font-mono-bold tabular-nums mt-1 ${valueClassName ?? "text-ink"}`}
        style={{ fontSize: 22, lineHeight: 26 }}
      >
        {value}
      </Text>
    </View>
  );
}

function StatsHeader({ athlete, data, wins, losses, draws, winRate }: {
  athlete: { current_elo: number };
  data: StatsData | null;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
}) {
  return (
    <View className="gap-4 mb-2">
      <View className="flex-row gap-3">
        <StatTile label="ELO" value={athlete.current_elo} />
        <StatTile label="Wins" value={wins} />
        <StatTile label="Win Rate" value={`${winRate}%`} />
      </View>

      <MilestoneProgress elo={athlete.current_elo} />

      {data?.weeklyActivity && <WeeklyActivitySection weeks={data.weeklyActivity} />}
      {data?.submissions && <SubmissionBreakdownSection submissions={data.submissions} />}

      <View className="flex-row items-center justify-between">
        <MetaTag>Record</MetaTag>
        <View className="flex-row items-center gap-2">
          <Text className="font-mono-bold text-[11px] text-ink tabular-nums">{wins}W</Text>
          <Text className="font-mono text-[11px] text-ink-3">·</Text>
          <Text className="font-mono-bold text-[11px] text-negative tabular-nums">{losses}L</Text>
          <Text className="font-mono text-[11px] text-ink-3">·</Text>
          <Text className="font-mono text-[11px] text-ink-3 tabular-nums">{draws}D</Text>
        </View>
      </View>

      <MetaTag>Match History</MetaTag>
    </View>
  );
}

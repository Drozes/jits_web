import * as React from "react";
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Calendar } from "lucide-react-native";
import { useRequireAthlete } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { supabase } from "@/lib/supabase/client";
import { getActiveSession, getDashboardSummary } from "@jits/shared/api/queries";
import type { DashboardSummary } from "@jits/shared/types/composites";
import type { ActiveSessionInfo } from "@jits/shared/types/session";
import { StatOverview } from "@/components/dashboard/stat-overview";
import { ActiveSessionCard } from "@/components/dashboard/active-session-card";
import { RecentActivitySection } from "@/components/dashboard/recent-activity-section";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { toast } from "@/components/ui/toast";

interface DashboardData {
  summary: DashboardSummary;
  activeSession: ActiveSessionInfo | null;
}

function useDashboardData(athleteId: string | undefined) {
  const [data, setData] = React.useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [refreshTick, setRefreshTick] = React.useState(0);

  React.useEffect(() => {
    if (!athleteId) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);

    (async () => {
      try {
        const [summary, activeSession] = await Promise.all([
          getDashboardSummary(supabase),
          getActiveSession(supabase, athleteId),
        ]);
        if (!cancelled) setData({ summary, activeSession });
      } catch (err) {
        console.error("[dashboard] fetch failed", err);
        if (!cancelled) toast.error("Could not load dashboard");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [athleteId, refreshTick]);

  const refresh = React.useCallback(() => setRefreshTick((n) => n + 1), []);
  return { data, isLoading, refresh };
}

export default function DashboardScreen() {
  const { athlete } = useRequireAthlete();
  const router = useRouter();
  const tokens = useThemedTokens();
  const { data, isLoading, refresh } = useDashboardData(athlete?.id);
  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    refresh();
    // Small grace period so the spinner is visible.
    setTimeout(() => setRefreshing(false), 600);
  }, [refresh]);

  if (!athlete) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator color={tokens.primary} />
      </SafeAreaView>
    );
  }

  const recentMatches = (data?.summary.recent_matches ?? []).map((m) => ({
    id: m.match_id,
    opponentName: m.opponent_name,
    result: m.outcome,
    eloDelta: m.elo_delta,
    date: m.completed_at,
  }));

  const recentActivity = (data?.summary.recent_activity ?? []).map((a) => ({
    id: a.match_id,
    winnerName: a.winner_name,
    loserName: a.loser_name,
    result: a.result,
    date: a.completed_at,
  }));

  const stats = data?.summary.stats;
  const rank = data?.summary.rank;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 24 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.primary} />}
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-2xl font-bold text-foreground">
          Hey, <Text className="text-primary">{athlete.display_name}</Text>
        </Text>
        <NotificationBell athleteId={athlete.id} />
      </View>

      {isLoading && !data ? (
        <View className="py-16 items-center">
          <ActivityIndicator color={tokens.primary} />
        </View>
      ) : (
        <>
          <StatOverview
            athlete={{
              current_elo: athlete.current_elo,
              highest_elo: athlete.highest_elo ?? athlete.current_elo,
            }}
            stats={{
              wins: stats?.wins ?? 0,
              losses: stats?.losses ?? 0,
              draws: stats?.draws ?? 0,
              winStreak: stats?.win_streak ?? 0,
              rank: rank?.current ?? 0,
              bestRank: rank?.best ?? 0,
              bestWinStreak: stats?.best_win_streak ?? 0,
            }}
          />

          <View className="gap-3">
            <View className="flex-row items-center gap-2">
              <View className="h-7 w-7 items-center justify-center rounded-lg bg-success/10">
                <Calendar size={16} className="text-success" />
              </View>
              <Text className="text-lg font-semibold text-foreground">Sessions</Text>
            </View>
            <ActiveSessionCard session={data?.activeSession ?? null} />
          </View>

          <RecentActivitySection
            myMatches={recentMatches}
            allActivity={recentActivity}
            onPressMatch={() => {
              // Match detail screens are owned by Track B / future phases. For now,
              // surface a soft notice so taps aren't silent.
              toast.info("Match details coming soon");
            }}
            onPressFindSession={() => router.push("/(app)/gyms")}
          />
        </>
      )}
    </ScrollView>
    </SafeAreaView>
  );
}

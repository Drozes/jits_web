import * as React from "react";
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRequireAthlete } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { supabase } from "@/lib/supabase/client";
import { getDashboardSummary } from "@jits/shared/api/queries";
import type { DashboardSummary } from "@jits/shared/types/composites";
import { Avatar32, EloTile, MetaTag, Wordmark } from "@/components/ui/elo-system";
import { ArenaNudgeCard } from "@/components/dashboard/arena-nudge-card";
import { RecentActivitySection } from "@/components/dashboard/recent-activity-section";
import { StatOverview } from "@/components/dashboard/stat-overview";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { toast } from "@/components/ui/toast";
import {
  SkeletonProvider,
  SkeletonBlock,
  SkeletonPlate,
  SkeletonParticipantRow,
} from "@/components/ui/skeleton";
import { useCachedResource } from "@/lib/cache/use-cached-resource";

interface DashboardData {
  summary: DashboardSummary;
}

function useDashboardData(athleteId: string | undefined) {
  const { data, isLoading, isStale, error, refresh } = useCachedResource<DashboardData>(
    `dashboard:${athleteId}`,
    async (_signal) => ({ summary: await getDashboardSummary(supabase) }),
    [athleteId],
  );

  React.useEffect(() => {
    if (error) toast.error("Could not load dashboard");
  }, [error]);

  return { data, isLoading, isStale, refresh };
}

/** Cold-start placeholder mirroring RecentActivity + StatOverview. */
function DashboardSkeleton() {
  return (
    <SkeletonProvider>
      <SkeletonPlate style={{ gap: 8 }}>
        <SkeletonParticipantRow />
        <SkeletonParticipantRow />
        <SkeletonParticipantRow />
      </SkeletonPlate>
      <SkeletonBlock height={72} radius="md" className="mt-5" />
    </SkeletonProvider>
  );
}

export default function DashboardScreen() {
  const { athlete } = useRequireAthlete();
  const insets = useSafeAreaInsets();
  const tokens = useThemedTokens();
  const { data, isLoading, isStale, refresh } = useDashboardData(athlete?.id);

  const onRefresh = React.useCallback(() => {
    // SWR keeps stale data on screen while revalidating; no artificial delay.
    refresh();
  }, [refresh]);

  if (!athlete) {
    return (
      <View className="flex-1 bg-surface items-center justify-center">
        <ActivityIndicator color={tokens.accentCta} />
      </View>
    );
  }

  const stats = data?.summary.stats;

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

  return (
    <View className="flex-1 bg-surface">
      <View
        className="bg-surface-2 border-b border-hairline flex-row items-center justify-between px-4"
        style={{ paddingTop: insets.top, height: 56 + insets.top }}
      >
        <Wordmark size="md" />
        <View className="flex-row items-center gap-2">
          <NotificationBell athleteId={athlete.id} />
          <Avatar32
            name={athlete.display_name}
            photoUrl={athlete.profile_photo_url}
          />
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 24,
          paddingBottom: 32 + insets.bottom,
          gap: 20,
        }}
        refreshControl={
          <RefreshControl
            refreshing={isStale}
            onRefresh={onRefresh}
            tintColor={tokens.accentCta}
          />
        }
      >
        <View>
          <MetaTag>Welcome back</MetaTag>
          <Text className="font-heading text-[26px] text-ink mt-2" numberOfLines={1}>
            {athlete.display_name}
          </Text>
        </View>

        {/* Both read only the athlete, never the summary, so they paint on the
            first frame. The Arena is the only way to a match on mobile
            (jits-gewv), so its CTA must not wait behind a skeleton. */}
        <EloTile
          size="hero"
          label="Current ELO Rating"
          value={athlete.current_elo}
          accentBar
        />
        <ArenaNudgeCard />

        {isLoading ? (
          <DashboardSkeleton />
        ) : (
          <>
            <RecentActivitySection
              myMatches={recentMatches}
              allActivity={recentActivity}
              onPressMatch={() => toast.info("Match details coming soon")}
            />

            <StatOverview
              stats={{
                wins: stats?.wins ?? 0,
                losses: stats?.losses ?? 0,
                draws: stats?.draws ?? 0,
              }}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

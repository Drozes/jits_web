import * as React from "react";
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useRequireAthlete } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { BrandHeader } from "@/components/layout/brand-header";
import { supabase } from "@/lib/supabase/client";
import { getDashboardSummary } from "@jits/shared/api/queries";
import type { DashboardSummary } from "@jits/shared/types/composites";
import { EloTile, MetaTag } from "@/components/ui/elo-system";
import { ArenaNudgeCard } from "@/components/dashboard/arena-nudge-card";
import { RecentActivitySection } from "@/components/dashboard/recent-activity-section";
import { StatOverview } from "@/components/dashboard/stat-overview";
import { toast } from "@/components/ui/toast";
import {
  SkeletonProvider,
  SkeletonBlock,
  SkeletonPlate,
  SkeletonParticipantRow,
} from "@/components/ui/skeleton";
import { useCachedResource } from "@/lib/cache/use-cached-resource";
import { usePullToRefresh, useRefetchOnRefocus } from "@/lib/cache/use-refocus-refetch";
import { useMatchExitCount } from "@/lib/arena/arena-store";
import { matchDetailHref } from "@/lib/match-detail/href";
import { ResumeMatchCard } from "@/components/dashboard/resume-match-card";
import { PracticeOfferCard } from "@/components/dashboard/practice-offer-card";
import { shouldOfferPracticeMatch } from "@/lib/practice/constants";
import { useMyActiveMatch } from "@/lib/match-flow/use-my-active-match";

interface DashboardData {
  summary: DashboardSummary;
}

function useDashboardData(athleteId: string | undefined) {
  const { data, isLoading, isValidating, error, refresh } = useCachedResource<DashboardData>(
    `dashboard:${athleteId}`,
    async (_signal) => ({ summary: await getDashboardSummary(supabase) }),
    [athleteId],
  );

  React.useEffect(() => {
    if (error) toast.error("Could not load dashboard");
  }, [error]);

  return { data, isLoading, isValidating, refresh };
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
  const router = useRouter();
  const { data, isLoading, isValidating, refresh } = useDashboardData(athlete?.id);
  // SWR keeps stale data on screen while revalidating; the spinner shows only
  // for a pull, never for the silent refetch when the tab regains focus.
  const { match: activeMatch, refresh: refreshActiveMatch } = useMyActiveMatch(athlete?.id);
  const refreshAll = React.useCallback(() => {
    refresh();
    refreshActiveMatch();
  }, [refresh, refreshActiveMatch]);
  const { refreshing, onRefresh } = usePullToRefresh(refreshAll, isValidating);
  useRefetchOnRefocus(refresh, useMatchExitCount());
  // "Not now" hides the practice offer at once, before the athlete re-reads.
  const [practiceDismissed, setPracticeDismissed] = React.useState(false);

  if (!athlete) {
    return (
      <View className="flex-1 bg-surface items-center justify-center">
        <ActivityIndicator color={tokens.accentCta} />
      </View>
    );
  }

  const stats = data?.summary.stats;
  // "Welcome back" only for someone who has actually been here: a brand-new
  // athlete (zero matches) and the pre-load frame both get a plain "Welcome".
  const hasMatches = !!stats && stats.wins + stats.losses + stats.draws > 0;
  const offerPractice =
    !practiceDismissed &&
    shouldOfferPracticeMatch({
      athlete,
      hasActiveMatch: !!activeMatch,
      statsLoaded: !!stats,
      hasMatches,
    });

  const recentMatches = (data?.summary.recent_matches ?? []).map((m) => ({
    id: m.match_id,
    opponentName: m.opponent_name,
    result: m.outcome,
    matchType:
      m.match_type === "ranked" ? ("ranked" as const) : m.match_type === "casual" ? ("casual" as const) : undefined,
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
      <BrandHeader athleteId={athlete.id} />

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
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={tokens.accentCta}
          />
        }
      >
        <View>
          <MetaTag>{hasMatches ? "Welcome back" : "Welcome"}</MetaTag>
          <Text className="font-heading text-[26px] text-ink mt-2" numberOfLines={1}>
            {athlete.display_name}
          </Text>
        </View>

        {/* A match the app lost (killed mid-match, jits-r9a) comes first and
            takes Home's one red CTA; the Arena card steps down while it shows. */}
        {activeMatch ? <ResumeMatchCard match={activeMatch} /> : null}

        {/* Both read only the athlete, never the summary, so they paint on the
            first frame. The Arena is the only way to a match on mobile
            (jits-gewv), so its CTA must not wait behind a skeleton. */}
        <EloTile
          size="hero"
          label="Current ELO Rating"
          value={athlete.current_elo}
          accentBar
        />
        {/* One-time practice offer for a brand-new athlete. While it shows
            it holds the red CTA and the Arena card steps down. */}
        {offerPractice ? (
          <PracticeOfferCard onDismiss={() => setPracticeDismissed(true)} />
        ) : null}
        <ArenaNudgeCard secondary={!!activeMatch || offerPractice} />

        {isLoading ? (
          <DashboardSkeleton />
        ) : (
          <>
            <RecentActivitySection
              myMatches={recentMatches}
              allActivity={recentActivity}
              onPressMatch={(id) => router.push(matchDetailHref(id))}
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

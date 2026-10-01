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
import { RecentActivitySection } from "@/components/dashboard/recent-activity-section";
import { toast } from "@/components/ui/toast";
import {
  SkeletonProvider,
  SkeletonPlate,
  SkeletonParticipantRow,
} from "@/components/ui/skeleton";
import { useCachedResource } from "@/lib/cache/use-cached-resource";
import { usePullToRefresh, useRefetchOnRefocus } from "@/lib/cache/use-refocus-refetch";
import { useMatchExitCount } from "@/lib/arena/arena-store";
import { matchDetailHref } from "@/lib/match-detail/href";
import { ResumeMatchCard } from "@/components/dashboard/resume-match-card";
import { PracticeOfferCard } from "@/components/dashboard/practice-offer-card";
import { InviteHomeCard } from "@/components/invite/invite-home-card";
import { shouldOfferPracticeMatch } from "@/lib/practice/constants";
import { useHasEverPlayed } from "@/lib/practice/use-has-ever-played";
import { useMyActiveMatch } from "@/lib/match-flow/use-my-active-match";
import { NewHighlightCard } from "@/components/dashboard/new-highlight-card";
import { useNewHighlight } from "@/lib/highlight/use-new-highlight";
import { requestBellRefresh } from "@/lib/highlight/highlight-store";
import { markNotificationRouterReady } from "@/lib/notifications/handlers";
import { formatRecord, recordA11yLabel } from "@/lib/athlete/record";

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

/** Cold-start placeholder mirroring RecentActivity. */
function DashboardSkeleton() {
  return (
    <SkeletonProvider>
      <SkeletonPlate style={{ gap: 8 }}>
        <SkeletonParticipantRow />
        <SkeletonParticipantRow />
        <SkeletonParticipantRow />
      </SkeletonPlate>
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
  const newHighlight = useNewHighlight(athlete?.id);
  const refreshNewHighlight = newHighlight.refresh;
  const refreshAll = React.useCallback(() => {
    refresh();
    refreshActiveMatch();
    refreshNewHighlight(true);
    // The bell sits in this screen's header: a pull refreshes it too.
    requestBellRefresh();
  }, [refresh, refreshActiveMatch, refreshNewHighlight]);
  const { refreshing, onRefresh } = usePullToRefresh(refreshAll, isValidating);
  const matchExits = useMatchExitCount();
  useRefetchOnRefocus(refresh, matchExits);
  // Home is the first signed-in screen a launch lands on: from here a
  // notification tap (including the one that launched the app) can be routed
  // without the auth redirect replacing it.
  React.useEffect(() => {
    if (athlete) markNotificationRouterReady();
  }, [athlete]);
  // "Not now" hides the practice offer at once, before the athlete re-reads.
  const [practiceDismissed, setPracticeDismissed] = React.useState(false);
  // Any real match ever (one that started): the practice offer is only for an
  // athlete who has never played (owner, 2026-10-01). Re-read on every match
  // exit, because this tab stays mounted through a first match.
  const hasEverPlayed = useHasEverPlayed(athlete?.id ?? null, matchExits);

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
      hasEverPlayed,
    });

  // The record rides in the Elo tile (P-Home). It needs the summary, so the
  // line appears once that lands; a summary with no stats is a 0-0-0 record.
  const record = data
    ? { wins: stats?.wins ?? 0, losses: stats?.losses ?? 0, draws: stats?.draws ?? 0 }
    : null;

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
      <BrandHeader />

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
            takes Home's one red CTA. */}
        {activeMatch ? <ResumeMatchCard match={activeMatch} /> : null}

        {/* A reel the athlete has not watched yet. Secondary only: the one
            red CTA stays Resume or the practice offer. */}
        {newHighlight.highlight ? (
          <NewHighlightCard highlight={newHighlight.highlight} onDismiss={newHighlight.dismiss} />
        ) : null}

        {/* The rating reads only the athlete, so it paints on the first frame;
            the record line under it joins once the summary lands, into a
            reserved slot so the tile never grows. No label and no Arena card
            (P-Home): the Arena tab is the way to a match. */}
        <EloTile
          size="hero"
          value={athlete.current_elo}
          meta={record ? formatRecord(record) : undefined}
          metaLabel={record ? recordA11yLabel(record) : undefined}
          reserveMeta
          accentBar
        />
        {/* One-time practice offer for a brand-new athlete. While it shows
            it holds Home's red CTA. */}
        {offerPractice ? (
          <PracticeOfferCard onDismiss={() => setPracticeDismissed(true)} />
        ) : null}
        {/* Invite fallback (jr_be spec 016): never beside a practice offer or a resume prompt. */}
        {!offerPractice && !activeMatch ? <InviteHomeCard /> : null}

        {isLoading ? (
          <DashboardSkeleton />
        ) : (
          <RecentActivitySection
            myMatches={recentMatches}
            allActivity={recentActivity}
            onPressMatch={(id) => router.push(matchDetailHref(id))}
          />
        )}
      </ScrollView>
    </View>
  );
}

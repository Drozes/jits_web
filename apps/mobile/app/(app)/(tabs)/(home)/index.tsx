import * as React from "react";
import { ActivityIndicator, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useRequireAthlete } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { BrandHeader } from "@/components/layout/brand-header";
import { RecentActivitySection } from "@/components/dashboard/recent-activity-section";
import {
  SkeletonProvider,
  SkeletonPlate,
  SkeletonParticipantRow,
} from "@/components/ui/skeleton";
import { useDashboardSummary } from "@/lib/dashboard/use-dashboard-summary";
import { usePullToRefresh, useRefetchOnRefocus } from "@/lib/cache/use-refocus-refetch";
import { useMatchExitCount } from "@/lib/arena/arena-store";
import { matchDetailHref } from "@/lib/match-detail/href";
import { ResumeMatchCard } from "@/components/dashboard/resume-match-card";
import { PracticeOfferCard } from "@/components/dashboard/practice-offer-card";
import { InviteHomeCard } from "@/components/invite/invite-home-card";
import { shouldOfferPracticeMatch } from "@/lib/practice/constants";
import { useHasEverPlayed } from "@/lib/practice/use-has-ever-played";
import { useMyActiveMatch } from "@/lib/match-flow/use-my-active-match";
import { HomeHighlightsCarousel } from "@/components/reels/lane-carousels";
import { useHomeHighlights } from "@/lib/highlight/use-home-highlights";
import { logEmptyCta } from "@/lib/matches/telemetry";
import { useMilestoneCelebration } from "@/lib/milestones/use-milestone-celebration";
import { MilestoneMoment } from "@/components/milestones/milestone-moment";
import { requestBellRefresh } from "@/lib/highlight/highlight-store";
import { markNotificationRouterReady } from "@/lib/notifications/handlers";

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
  // Shared with the header's Your numbers sheet: one cache entry.
  const { data, isLoading, isValidating, refresh } = useDashboardSummary(athlete?.id);
  // SWR keeps stale data on screen while revalidating; the spinner shows only
  // for a pull, never for the silent refetch when the tab regains focus.
  const { match: activeMatch, refresh: refreshActiveMatch } = useMyActiveMatch(athlete?.id);
  // The Highlights carousel's empty-state copy needs the completed match
  // count: a number once the summary lands (no stats = 0), null if it failed,
  // undefined while it loads.
  const summaryStats = data?.summary.stats;
  const matchCount = data
    ? summaryStats
      ? summaryStats.wins + summaryStats.losses + summaryStats.draws
      : 0
    : isLoading
      ? undefined
      : null;
  const highlights = useHomeHighlights(athlete?.id, matchCount);
  const refetchHighlights = highlights.refetch;
  const onHighlightsCta = React.useCallback(
    (tile: { variant: "first_highlight" | "find_match" }) =>
      logEmptyCta({ surface: "home", state: tile.variant === "first_highlight" ? "zero" : "no_reels", cta: "arena" }),
    [],
  );
  // The first highlight celebrates on the carousel (spec 10.6), unless the
  // Matches carousel celebrated it first. Home never celebrates matches.
  const firstReel = highlights.items[0] ?? null;
  const { celebration, dismiss: dismissMilestone } = useMilestoneCelebration("home", athlete?.id, {
    highlights: {
      count: highlights.items.length,
      hasMore: highlights.pageSource.cursor !== null,
      first: firstReel ? { highlightId: firstReel.highlightId, unseen: firstReel.unseen, readyAt: firstReel.readyAt } : null,
    },
  });
  const refreshAll = React.useCallback(() => {
    refresh();
    refreshActiveMatch();
    refetchHighlights(true);
    // The bell sits in this screen's header: a pull refreshes it too.
    requestBellRefresh();
  }, [refresh, refreshActiveMatch, refetchHighlights]);
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
        <ActivityIndicator color={tokens.textTertiary} />
      </View>
    );
  }

  const stats = data?.summary.stats;
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
      {/* The rating lives in the header (jits-1ez5): no greeting, name or EloTile. */}
      <BrandHeader title="Home" />

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
            tintColor={tokens.textTertiary}
          />
        }
      >
        {/* A match the app lost (killed mid-match, jits-r9a) comes first and
            takes Home's one red CTA (spec matches-tab PM7). */}
        {activeMatch ? <ResumeMatchCard match={activeMatch} /> : null}

        {/* The ONE Highlights carousel (spec matches-tab 7, C-HM3): own reels
            in phase 1, later friend, nearby and Elo sources in the same row.
            No red: Home's one red CTA stays Resume or the practice offer.
            Hidden with clips off or a failed read (Home stays quiet). */}
        {/* Only with tiles: an empty wrapper would add a gap to the scroll. */}
        {highlights.tiles.length > 0 ? (
          <MilestoneMoment celebration={celebration} onDismiss={dismissMilestone}>
            <HomeHighlightsCarousel
              tiles={highlights.tiles}
              pageSource={highlights.pageSource}
              markSeenLocally={highlights.markSeenLocally}
              onCtaPress={onHighlightsCta}
            />
          </MilestoneMoment>
        ) : null}

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

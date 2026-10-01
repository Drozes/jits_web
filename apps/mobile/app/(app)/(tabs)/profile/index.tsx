import * as React from "react";
import { ActivityIndicator, Pressable, RefreshControl, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ArrowUpRight } from "lucide-react-native";
import { useRequireAthlete } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { useProfileData } from "@/lib/profile/use-profile-data";
import { useRefetchOnUploadSettled } from "@/lib/profile/use-my-match-videos";
import { useMatchLibraryFirstPage } from "@/lib/film-room/use-match-library";
import { usePullToRefresh, useRefetchOnRefocus } from "@/lib/cache/use-refocus-refetch";
import { useMatchExitCount } from "@/lib/arena/arena-store";
import { matchDetailHref } from "@/lib/match-detail/href";
import { ProfileHeader } from "@/components/profile/profile-header";
import { ProfileQuickStats } from "@/components/profile/profile-quick-stats";
import { AccountSection } from "@/components/profile/account-section";
import { FilmRoomPreview } from "@/components/profile/film-room-preview";
import { HighlightsRow } from "@/components/profile/highlights-row";
import { useMyHighlights } from "@/lib/highlight/use-my-highlights";
import { ShareProfileSheet } from "@/components/share-profile-sheet";
import { ProfileInviteActions } from "@/components/invite/profile-invite-actions";
import { TabHeader } from "@/components/layout/tab-header";
import { PageContainer } from "@/components/layout/page-container";
import { AppVersionLabel } from "@/components/layout/app-version-label";
import { MetaTag, ParticipantRow } from "@/components/ui/elo-system";
import { HistoryRowAction } from "@/components/profile/history-row-action";
import {
  SkeletonProvider,
  SkeletonPlate,
  SkeletonAvatar,
  SkeletonText,
  SkeletonBlock,
  SkeletonParticipantRow,
} from "@/components/ui/skeleton";
import { formatRelativeDate } from "@jits/shared/utils";

type ShareAthlete = {
  id: string;
  displayName: string;
  elo: number;
  wins: number;
  losses: number;
  weight: number | null;
  gymName?: string | null;
};

/**
 * Secondary, full-width, in the body rather than the header: the tab headers
 * carry only the LIVE signal and the bell. Surface-styled like "View Detailed
 * Stats", never Signal Red, so it does not compete with a primary CTA.
 */
function ShareProfileButton({ athlete }: { athlete: ShareAthlete }) {
  const tokens = useThemedTokens();
  return (
    <ShareProfileSheet athlete={athlete}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Share profile"
        className="flex-row items-center justify-center gap-2 bg-surface-3 border border-hairline-strong rounded-sm px-5 py-3 active:bg-surface-4"
      >
        <View pointerEvents="none">
          <ArrowUpRight size={16} color={tokens.textSecondary} />
        </View>
        <Text className="font-heading text-[12px] text-ink uppercase tracking-caps">
          Share profile
        </Text>
      </Pressable>
    </ShareProfileSheet>
  );
}

/**
 * Cold-load placeholder mirroring the real layout: header plate (avatar + two
 * name/gym lines), a 3-tile stat strip, then four recent-match rows under the
 * "Recent Matches" tag. Static by default per the minimal-motion brand rule.
 */
function ProfileSkeleton() {
  return (
    <SkeletonProvider>
      <SkeletonPlate>
        <View className="flex-row items-center gap-4">
          <SkeletonAvatar size={80} />
          <View className="flex-1 min-w-0">
            <SkeletonText lines={2} lastLineWidth="50%" />
          </View>
        </View>
      </SkeletonPlate>

      <View className="flex-row gap-3">
        <SkeletonBlock width="100%" height={84} className="flex-1" />
        <SkeletonBlock width="100%" height={84} className="flex-1" />
        <SkeletonBlock width="100%" height={84} className="flex-1" />
      </View>

      <View className="gap-3">
        <MetaTag>Recent Matches</MetaTag>
        <View className="gap-[1px]">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonParticipantRow key={i} />
          ))}
        </View>
      </View>
    </SkeletonProvider>
  );
}

export default function ProfileScreen() {
  const { athlete } = useRequireAthlete();
  const router = useRouter();
  const tokens = useThemedTokens();
  const { stats, gymName, eloThisMonth, history, isLoading, refreshing: profileBusy, onRefresh: refetchProfile } =
    useProfileData(athlete?.id, athlete?.primary_gym_id);
  const library = useMatchLibraryFirstPage(athlete?.id);
  const refetchVideos = library.refetch;
  const highlights = useMyHighlights(athlete?.id);
  const refetchHighlights = highlights.refetch;

  // Pull-to-refresh and returning to the tab both reload the profile, the
  // Film Room preview and the highlights row, so a video uploaded from the
  // match wizard (and the reel made from it) shows up here.
  const refetchAll = React.useCallback(() => {
    refetchProfile();
    refetchVideos();
    refetchHighlights();
  }, [refetchProfile, refetchVideos, refetchHighlights]);
  const { refreshing, onRefresh } = usePullToRefresh(refetchAll, profileBusy || library.isValidating);
  useRefetchOnRefocus(refetchAll, useMatchExitCount());
  // The video row lands when the upload settles, often after that refocus.
  const historyMatchIds = React.useMemo(() => history.map((m) => m.match_id), [history]);
  useRefetchOnUploadSettled(historyMatchIds, refetchVideos);

  // Serve recent matches from the single cached history payload fetched by
  // useProfileData; no separate round-trip.
  const recent = React.useMemo(() => history.slice(0, 5), [history]);

  if (!athlete) {
    return (
      <View className="flex-1 bg-surface items-center justify-center">
        <ActivityIndicator color={tokens.accentCta} />
      </View>
    );
  }

  const shareAthlete: ShareAthlete = {
    id: athlete.id,
    displayName: athlete.display_name ?? "",
    elo: athlete.current_elo,
    wins: stats?.wins ?? 0,
    losses: stats?.losses ?? 0,
    weight: athlete.current_weight,
    gymName,
  };

  return (
    <View className="flex-1 bg-surface">
      <TabHeader title="Profile" />
      <PageContainer
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.accentCta} />
        }
        contentContainerStyle={{ paddingTop: 24, gap: 24 }}
      >
        {isLoading && !stats ? (
          <ProfileSkeleton />
        ) : (
          <>
            <ProfileHeader athlete={athlete} gymName={gymName} />

            <ShareProfileButton athlete={shareAthlete} />
            <ProfileInviteActions />

            <ProfileQuickStats
              totalMatches={stats?.totalMatches ?? 0}
              winStreak={stats?.winStreak ?? 0}
              bestWinStreak={stats?.bestWinStreak ?? 0}
              eloThisMonth={eloThisMonth}
              winRate={stats?.winRate}
            />

            <View className="gap-3">
              <MetaTag>Recent Matches</MetaTag>
              {recent.length === 0 ? (
                <View className="bg-surface-3 border border-hairline-faint rounded-xs px-4 py-6 items-center">
                  <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l">
                    No Matches Yet
                  </Text>
                </View>
              ) : (
                <View className="gap-[1px]">
                  {recent.map((m) => {
                    const name = m.opponent_display_name ?? "Opponent";
                    return (
                      <ParticipantRow
                        key={m.match_id}
                        name={`vs ${name}`}
                        subtitle={formatRelativeDate(m.completed_at)}
                        onPress={() => router.push(matchDetailHref(m.match_id))}
                        accessibilityLabel={`Open match vs ${name}`}
                        action={<HistoryRowAction eloDelta={m.elo_delta} eloAfter={m.elo_after} />}
                      />
                    );
                  })}
                </View>
              )}
            </View>

            <HighlightsRow
              items={highlights.items}
              clipsEnabled={highlights.clipsEnabled}
              onOpen={highlights.markSeenLocally}
            />

            <FilmRoomPreview
              items={library.data?.items}
              error={!!library.error}
              onRetry={refetchVideos}
              viewer={{ name: athlete.display_name ?? "You", photoUrl: athlete.profile_photo_url }}
            />

            <View className="gap-2">
              <Pressable
                onPress={() => router.push("/(app)/profile/stats")}
                accessibilityRole="button"
                className="bg-surface-3 border border-hairline-strong rounded-sm px-5 py-4 items-center active:bg-surface-4"
              >
                <Text className="font-heading text-[12px] text-ink uppercase tracking-caps">
                  View Detailed Stats
                </Text>
              </Pressable>
            </View>

            <AccountSection />

            <View className="items-center gap-1 py-2">
              <Text className="text-center font-mono text-[10px] text-ink-3 uppercase tracking-caps-l">
                ELO RATED Beta
              </Text>
              <AppVersionLabel />
            </View>
          </>
        )}
      </PageContainer>
    </View>
  );
}

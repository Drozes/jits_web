import * as React from "react";
import { ActivityIndicator, Pressable, RefreshControl, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ArrowUpRight } from "lucide-react-native";
import { useRequireAthlete } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { useProfileData } from "@/lib/profile/use-profile-data";
import { usePullToRefresh, useRefetchOnRefocus } from "@/lib/cache/use-refocus-refetch";
import { useMatchExitCount } from "@/lib/arena/arena-store";
import { ProfileHeader } from "@/components/profile/profile-header";
import { ProfileQuickStats } from "@/components/profile/profile-quick-stats";
import { AccountSection } from "@/components/profile/account-section";
import { ShareProfileSheet } from "@/components/share-profile-sheet";
import { ProfileInviteActions } from "@/components/invite/profile-invite-actions";
import { TabHeader } from "@/components/layout/tab-header";
import { PageContainer } from "@/components/layout/page-container";
import { AppVersionLabel } from "@/components/layout/app-version-label";
import { Button } from "@/components/ui/elo-system/button";
import {
  SkeletonProvider,
  SkeletonPlate,
  SkeletonAvatar,
  SkeletonText,
  SkeletonBlock,
} from "@/components/ui/skeleton";

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
        <Text className="font-heading text-small text-ink uppercase tracking-caps">
          Share profile
        </Text>
      </Pressable>
    </ShareProfileSheet>
  );
}

/**
 * Cold-load placeholder mirroring the real layout: header plate (avatar + two
 * name/gym lines), then the 3-tile stat strip. The bars carry the shared
 * skeleton shimmer (Motion Rule, Ambient tier). Match history lives on the
 * Matches tab now (spec specs/matches-tab/spec.md section 9), so there are no
 * recent-match rows here.
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
    </SkeletonProvider>
  );
}

export default function ProfileScreen() {
  const { athlete } = useRequireAthlete();
  const router = useRouter();
  const tokens = useThemedTokens();
  const { stats, gymName, eloThisMonth, isLoading, refreshing: profileBusy, onRefresh: refetchProfile } =
    useProfileData(athlete?.id, athlete?.primary_gym_id);

  // Pull-to-refresh and returning to the tab (or out of a match) re-read the
  // profile only: match history, film and highlights live on the Matches tab
  // and Home now (spec specs/matches-tab/spec.md section 9).
  const { refreshing, onRefresh } = usePullToRefresh(refetchProfile, profileBusy);
  useRefetchOnRefocus(refetchProfile, useMatchExitCount());

  if (!athlete) {
    return (
      <View className="flex-1 bg-surface items-center justify-center">
        <ActivityIndicator color={tokens.textTertiary} />
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
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.textTertiary} />
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

            <View className="gap-2">
              <Button
                variant="secondary"
                label="View Detailed Stats"
                onPress={() => router.push("/(app)/profile/stats")}
              />
            </View>

            <AccountSection />

            <View className="items-center gap-1 py-2">
              <Text className="text-center font-mono tabular-nums text-micro text-ink-3 uppercase tracking-caps-l">
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

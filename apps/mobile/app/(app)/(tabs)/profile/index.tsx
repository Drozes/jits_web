import * as React from "react";
import { ActivityIndicator, Pressable, RefreshControl, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ArrowUpRight } from "lucide-react-native";
import { useRequireAthlete } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { useProfileData } from "@/lib/profile/use-profile-data";
import { ProfileHeader } from "@/components/profile/profile-header";
import { ProfileQuickStats } from "@/components/profile/profile-quick-stats";
import { AccountSection } from "@/components/profile/account-section";
import { ShareProfileSheet } from "@/components/share-profile-sheet";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { MetaTag, ParticipantRow, DeltaNumber } from "@/components/ui/elo-system";
import { supabase } from "@/lib/supabase/client";
import { getMatchHistory } from "@jits/shared/api/queries";
import type { MatchHistoryRow } from "@jits/shared/types/composites";
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

function ShareButton({ athlete }: { athlete: ShareAthlete }) {
  const tokens = useThemedTokens();
  return (
    <ShareProfileSheet athlete={athlete}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Share"
        className="w-8 h-8 items-center justify-center rounded-xs active:bg-surface-3"
      >
        <ArrowUpRight size={18} color={tokens.textSecondary} />
      </Pressable>
    </ShareProfileSheet>
  );
}

export default function ProfileScreen() {
  const { athlete } = useRequireAthlete();
  const router = useRouter();
  const tokens = useThemedTokens();
  const { stats, gymName, eloThisMonth, isLoading, refreshing, onRefresh } =
    useProfileData(athlete?.id, athlete?.primary_gym_id);

  const [recent, setRecent] = React.useState<MatchHistoryRow[]>([]);
  React.useEffect(() => {
    if (!athlete?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const history = await getMatchHistory(supabase, athlete.id);
        if (!cancelled) setRecent(history.slice(0, 5));
      } catch (err) {
        console.warn("[profile] recent fetch failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [athlete?.id, refreshing]);

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
      <AppHeader title="Profile" rightAction={<ShareButton athlete={shareAthlete} />} />
      <PageContainer
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.accentCta} />
        }
        contentContainerStyle={{ paddingTop: 24, gap: 24 }}
      >
        {isLoading && !stats ? (
          <View className="py-16 items-center">
            <ActivityIndicator color={tokens.accentCta} />
          </View>
        ) : (
          <>
            <ProfileHeader athlete={athlete} gymName={gymName} />

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
                  {recent.map((m) => (
                    <ParticipantRow
                      key={m.match_id}
                      name={`vs ${m.opponent_display_name ?? "Opponent"}`}
                      subtitle={formatRelativeDate(m.completed_at)}
                      action={
                        m.match_type === "ranked" && m.elo_delta != null ? (
                          <DeltaNumber value={m.elo_delta} size="m" showSign />
                        ) : undefined
                      }
                    />
                  ))}
                </View>
              )}
            </View>

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

            <Text className="text-center font-mono text-[10px] text-ink-3 uppercase tracking-caps-l py-2">
              ELO RATED Beta
            </Text>
          </>
        )}
      </PageContainer>
    </View>
  );
}

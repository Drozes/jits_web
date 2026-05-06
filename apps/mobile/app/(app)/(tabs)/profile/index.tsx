import * as React from "react";
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Share2, Trophy } from "lucide-react-native";
import { useRequireAthlete } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { useProfileData } from "@/lib/profile/use-profile-data";
import { ProfileHeader } from "@/components/profile/profile-header";
import { ProfileQuickStats } from "@/components/profile/profile-quick-stats";
import { AccountSection } from "@/components/profile/account-section";
import { ShareProfileSheet } from "@/components/share-profile-sheet";
import { Button } from "@/components/ui/button";

export default function ProfileScreen() {
  const { athlete } = useRequireAthlete();
  const router = useRouter();
  const tokens = useThemedTokens();
  const { stats, gymName, eloThisMonth, isLoading, refreshing, onRefresh } =
    useProfileData(athlete?.id, athlete?.primary_gym_id);

  if (!athlete) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator color={tokens.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.primary} />
        }
      >
        <Text className="text-2xl font-heading text-foreground">Profile</Text>

        {isLoading && !stats ? (
          <View className="py-16 items-center">
            <ActivityIndicator color={tokens.primary} />
          </View>
        ) : (
          <>
            <ProfileHeader
              athlete={athlete}
              gymName={gymName}
              stats={{
                wins: stats?.wins ?? 0,
                losses: stats?.losses ?? 0,
                winRate: stats?.winRate ?? 0,
              }}
            />

            <View className="flex-row gap-2">
              <Button variant="outline" className="flex-1" onPress={() => router.push("/(app)/profile/stats")}>
                <Trophy size={16} className="text-foreground" />
                <Text className="text-sm font-medium text-foreground ml-2">View Stats</Text>
              </Button>
              <ShareProfileSheet
                athlete={{
                  id: athlete.id,
                  displayName: athlete.display_name ?? "",
                  elo: athlete.current_elo,
                  wins: stats?.wins ?? 0,
                  losses: stats?.losses ?? 0,
                  weight: athlete.current_weight,
                  gymName,
                }}
              >
                <Button variant="outline" size="icon">
                  <Share2 size={16} className="text-foreground" />
                </Button>
              </ShareProfileSheet>
            </View>

            <ProfileQuickStats
              totalMatches={stats?.totalMatches ?? 0}
              winStreak={stats?.winStreak ?? 0}
              bestWinStreak={stats?.bestWinStreak ?? 0}
              eloThisMonth={eloThisMonth}
            />

            <AccountSection />

            <Text className="text-center text-xs text-muted-foreground pb-2">
              ELO RATED Beta
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

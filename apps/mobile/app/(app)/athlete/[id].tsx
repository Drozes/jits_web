import * as React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, BarChart3, Swords } from "lucide-react-native";
import { Button } from "@/components/ui/button";
import { CompareStatsModal } from "@/components/compare-stats-modal";
import { CompetitorHeader } from "@/components/athlete/competitor-header";
import { HeadToHeadCard } from "@/components/athlete/head-to-head-card";
import { useRequireAthlete } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { useAthleteProfile } from "@/lib/athlete/use-athlete-profile";
import { toast } from "@/components/ui";

export default function AthleteProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const tokens = useThemedTokens();
  const { athlete, isLoading: authLoading } = useRequireAthlete();
  const { data, isLoading, notFound } = useAthleteProfile(id, athlete?.id);
  const [compareOpen, setCompareOpen] = React.useState(false);

  if (authLoading || isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator color={tokens.primary} />
      </SafeAreaView>
    );
  }

  if (notFound || !data || !athlete) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
        <View className="flex-row items-center px-4 py-3">
          <Pressable onPress={() => router.back()} className="p-2 -ml-2">
            <ArrowLeft size={20} color={tokens.foreground} />
          </Pressable>
        </View>
        <View className="flex-1 items-center justify-center">
          <Text className="text-base text-foreground">Athlete not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="flex-row items-center px-4 py-3 border-b border-border">
        <Pressable onPress={() => router.back()} className="p-2 -ml-2">
          <ArrowLeft size={20} color={tokens.foreground} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <CompetitorHeader
          athlete={data.competitor}
          gymName={data.competitorGymName}
          stats={data.compStats}
        />

        <View className="flex-row gap-2">
          <Button
            variant="outline"
            className="flex-1"
            leftIcon={<BarChart3 size={16} color={tokens.foreground} />}
            onPress={() => setCompareOpen(true)}
          >
            Compare Stats
          </Button>
          <Button
            variant="secondary"
            className="flex-1 opacity-60"
            leftIcon={<Swords size={16} color={tokens.mutedForeground} />}
            onPress={() => toast.info("Challenges coming soon")}
            disabled
          >
            Challenge
          </Button>
        </View>

        <HeadToHeadCard matches={data.headToHead} />
      </ScrollView>

      <CompareStatsModal
        open={compareOpen}
        onOpenChange={setCompareOpen}
        currentAthlete={{
          displayName: athlete.display_name,
          elo: athlete.current_elo,
          ...data.myStats,
          weight: athlete.current_weight,
        }}
        competitor={{
          displayName: data.competitor.display_name,
          elo: data.competitor.current_elo,
          ...data.compStats,
          weight: data.competitor.current_weight,
        }}
        headToHead={data.headToHead}
      />
    </SafeAreaView>
  );
}

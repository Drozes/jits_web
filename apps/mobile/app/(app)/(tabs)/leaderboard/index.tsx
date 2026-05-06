import * as React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRequireAthlete } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { useLeaderboardData } from "@/lib/leaderboard/use-leaderboard-data";
import { GenderFilterRow, type GenderFilter } from "@/components/leaderboard/gender-filter-row";
import { FightersList } from "@/components/leaderboard/fighters-list";
import { GymsList } from "@/components/leaderboard/gyms-list";

export default function LeaderboardScreen() {
  const { athlete, isLoading: authLoading } = useRequireAthlete();
  const tokens = useThemedTokens();
  const { athletes, gyms, isLoading, isRefreshing, refresh } = useLeaderboardData(
    athlete?.id,
  );
  const [tab, setTab] = React.useState<"fighters" | "gyms">("fighters");
  const [genderFilter, setGenderFilter] = React.useState<GenderFilter>(() => {
    if (athlete?.gender === "M") return "male";
    if (athlete?.gender === "F") return "female";
    return "all";
  });

  const filteredAthletes = React.useMemo(() => {
    if (!athletes) return [];
    if (genderFilter === "all") return athletes;
    return athletes.filter((a) =>
      genderFilter === "male" ? a.gender === "M" : a.gender === "F",
    );
  }, [athletes, genderFilter]);

  if (authLoading || !athlete || isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator color={tokens.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="px-4 pt-4 pb-2">
        <Text className="text-2xl font-heading text-foreground mb-3">Rankings</Text>
        <Tabs value={tab} onValueChange={(v) => setTab(v as "fighters" | "gyms")}>
          <TabsList>
            <TabsTrigger value="fighters">Fighters</TabsTrigger>
            <TabsTrigger value="gyms">Gyms</TabsTrigger>
          </TabsList>
        </Tabs>
        {tab === "fighters" ? (
          <GenderFilterRow current={genderFilter} onSelect={setGenderFilter} />
        ) : null}
      </View>

      {tab === "fighters" ? (
        <FightersList
          athletes={filteredAthletes}
          isRefreshing={isRefreshing}
          onRefresh={refresh}
        />
      ) : (
        <GymsList
          gyms={gyms ?? []}
          isRefreshing={isRefreshing}
          onRefresh={refresh}
        />
      )}
    </SafeAreaView>
  );
}

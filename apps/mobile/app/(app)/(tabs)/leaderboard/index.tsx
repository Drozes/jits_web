import * as React from "react";
import { ActivityIndicator, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar32, Chip, MetaTag, Wordmark } from "@/components/ui/elo-system";
import { useRequireAthlete } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { useLeaderboardData } from "@/lib/leaderboard/use-leaderboard-data";
import {
  GenderFilterRow,
  type GenderFilter,
} from "@/components/leaderboard/gender-filter-row";
import { FightersList } from "@/components/leaderboard/fighters-list";
import { GymsList } from "@/components/leaderboard/gyms-list";

type TabValue = "fighters" | "gyms";

export default function LeaderboardScreen() {
  const insets = useSafeAreaInsets();
  const { athlete, isLoading: authLoading } = useRequireAthlete();
  const tokens = useThemedTokens();
  const { athletes, gyms, isLoading, isRefreshing, refresh } = useLeaderboardData(
    athlete?.id,
  );
  const [tab, setTab] = React.useState<TabValue>("fighters");
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

  const currentUserAthlete = React.useMemo(() => {
    if (!athletes) return null;
    return athletes.find((a) => a.isCurrentUser) ?? null;
  }, [athletes]);

  if (authLoading || !athlete || isLoading) {
    return (
      <View className="flex-1 bg-surface items-center justify-center">
        <ActivityIndicator color={tokens.accentCta} />
      </View>
    );
  }

  const countLabel =
    tab === "fighters"
      ? `${filteredAthletes.length} Athletes · Live`
      : `${(gyms ?? []).length} Gyms · Live`;

  return (
    <View className="flex-1 bg-surface">
      <View
        className="bg-surface-2 border-b border-hairline flex-row items-center justify-between px-4"
        style={{ paddingTop: insets.top, height: 56 + insets.top }}
      >
        <Wordmark size="md" />
        <Avatar32
          name={athlete.display_name}
          photoUrl={athlete.profile_photo_url}
        />
      </View>

      <View className="px-4 py-3 border-b border-hairline-faint" style={{ gap: 8 }}>
        <View className="flex-row flex-wrap" style={{ gap: 8 }}>
          <Chip active={tab === "fighters"} onPress={() => setTab("fighters")}>
            Fighters
          </Chip>
          <Chip active={tab === "gyms"} onPress={() => setTab("gyms")}>
            Gyms
          </Chip>
        </View>
        {tab === "fighters" ? (
          <GenderFilterRow current={genderFilter} onSelect={setGenderFilter} />
        ) : null}
      </View>

      <View className="px-4 pt-3 pb-2">
        <MetaTag>{countLabel}</MetaTag>
      </View>

      {tab === "fighters" ? (
        <FightersList
          athletes={filteredAthletes}
          isRefreshing={isRefreshing}
          onRefresh={refresh}
          currentUser={currentUserAthlete}
        />
      ) : (
        <GymsList
          gyms={gyms ?? []}
          isRefreshing={isRefreshing}
          onRefresh={refresh}
        />
      )}
    </View>
  );
}

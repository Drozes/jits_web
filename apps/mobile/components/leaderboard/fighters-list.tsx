import { FlatList, RefreshControl, Text, View } from "react-native";
import { AthleteCard } from "@/components/athlete-card";
import { useThemedTokens } from "@/lib/theme/use-theme";
import type { RankedAthlete } from "@/lib/leaderboard/use-leaderboard-data";

interface FightersListProps {
  athletes: RankedAthlete[];
  isRefreshing: boolean;
  onRefresh: () => void;
}

export function FightersList({ athletes, isRefreshing, onRefresh }: FightersListProps) {
  const tokens = useThemedTokens();
  return (
    <FlatList
      data={athletes}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 10 }}
      renderItem={({ item, index }) => (
        <AthleteCard
          id={item.id}
          rank={index + 1}
          displayName={item.displayName}
          currentElo={item.currentElo}
          eloTrend={item.eloTrend}
          wins={item.wins}
          losses={item.losses}
          gymName={item.gymName}
          profilePhotoUrl={item.profilePhotoUrl}
          isCurrentUser={item.isCurrentUser}
        />
      )}
      ListEmptyComponent={
        <View className="rounded-md border border-dashed border-border p-8 items-center">
          <Text className="text-sm text-muted-foreground">No athletes found</Text>
        </View>
      }
      ListFooterComponent={
        <Text className="text-center text-xs text-muted-foreground py-3">
          Rankings based on current ELO
        </Text>
      }
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          tintColor={tokens.primary}
        />
      }
    />
  );
}

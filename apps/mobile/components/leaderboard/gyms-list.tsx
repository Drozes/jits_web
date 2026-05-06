import { FlatList, RefreshControl, Text, View } from "react-native";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { GymRow } from "./gym-row";
import type { RankedGym } from "@/lib/leaderboard/use-leaderboard-data";

interface GymsListProps {
  gyms: RankedGym[];
  isRefreshing: boolean;
  onRefresh: () => void;
}

export function GymsList({ gyms, isRefreshing, onRefresh }: GymsListProps) {
  const tokens = useThemedTokens();
  return (
    <FlatList
      data={gyms}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 10 }}
      renderItem={({ item }) => <GymRow gym={item} />}
      ListEmptyComponent={
        <View className="rounded-md border border-dashed border-border p-8 items-center">
          <Text className="text-sm text-muted-foreground">No gyms found</Text>
        </View>
      }
      ListFooterComponent={
        <Text className="text-center text-xs text-muted-foreground py-3">
          Gym rankings based on total member ELO
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

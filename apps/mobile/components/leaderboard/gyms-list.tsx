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
      contentContainerStyle={{
        paddingHorizontal: 12,
        paddingTop: 4,
        paddingBottom: 16,
        gap: 1,
      }}
      renderItem={({ item }) => <GymRow gym={item} />}
      ListEmptyComponent={
        <View className="rounded-md border border-dashed border-hairline p-8 items-center mx-1">
          <Text className="font-body text-[13px] text-ink-3">No gyms found</Text>
        </View>
      }
      ListFooterComponent={
        <Text className="text-center font-mono text-[10px] text-ink-3 uppercase tracking-caps-l pt-3">
          Gym rankings based on total member ELO
        </Text>
      }
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          tintColor={tokens.accentCta}
        />
      }
    />
  );
}

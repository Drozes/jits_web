import { Text, View } from "react-native";
import { Trophy, Users } from "lucide-react-native";
import { Card } from "@/components/ui/card";
import { useThemedTokens } from "@/lib/theme/use-theme";
import type { RankedGym } from "@/lib/leaderboard/use-leaderboard-data";

export function GymRow({ gym }: { gym: RankedGym }) {
  const tokens = useThemedTokens();
  return (
    <Card className="p-4">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-3 flex-1 min-w-0">
          <View className="w-8 items-center">
            {gym.rank <= 3 ? (
              <Trophy
                size={20}
                color={
                  gym.rank === 1
                    ? tokens.gold
                    : gym.rank === 2
                      ? tokens.mutedForeground
                      : tokens.brandOrange
                }
              />
            ) : (
              <Text className="text-sm font-mono text-muted-foreground">
                #{gym.rank}
              </Text>
            )}
          </View>
          <View className="h-11 w-11 items-center justify-center rounded-xl bg-primary">
            <Users size={20} color={tokens.primaryForeground} />
          </View>
          <View className="flex-1 min-w-0">
            <Text
              className="text-[15px] font-heading text-foreground"
              numberOfLines={1}
            >
              {gym.name}
            </Text>
            <Text className="text-xs text-muted-foreground">
              {gym.memberCount} {gym.memberCount === 1 ? "athlete" : "athletes"} · Avg{" "}
              {gym.averageElo}
            </Text>
          </View>
        </View>
        <Text className="text-lg font-mono tabular-nums text-foreground">
          {gym.totalElo}
        </Text>
      </View>
    </Card>
  );
}

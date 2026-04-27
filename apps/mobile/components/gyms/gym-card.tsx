import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Users } from "lucide-react-native";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { useThemedTokens } from "../../lib/theme/use-theme";
import type { GymListItem } from "@jits/shared/types/session";

interface GymCardProps {
  gym: GymListItem;
  isMyGym: boolean;
  /** Optional formatted distance ("1.2 km"); shown when location is available. */
  distanceLabel?: string | null;
}

export function GymCard({ gym, isMyGym, distanceLabel }: GymCardProps) {
  const router = useRouter();
  const tokens = useThemedTokens();

  return (
    <Pressable
      onPress={() => router.push(`/gyms/${gym.id}`)}
      className="active:opacity-80"
    >
      <Card className="p-4">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 min-w-0">
            <View className="flex-row items-center gap-2 flex-wrap">
              <Text
                className="text-[15px] font-semibold text-foreground"
                numberOfLines={1}
              >
                {gym.name}
              </Text>
              {isMyGym && (
                <Badge variant="outline">
                  <Text className="text-[10px] font-semibold text-foreground">My Gym</Text>
                </Badge>
              )}
              {gym.hasActiveSession && (
                <Badge variant="success">
                  <Text className="text-[10px] font-semibold text-success-foreground">Live</Text>
                </Badge>
              )}
            </View>
            {gym.city ? (
              <Text className="mt-0.5 text-xs text-muted-foreground">
                {gym.city}
              </Text>
            ) : null}
          </View>
          {distanceLabel ? (
            <Text className="text-xs text-muted-foreground tabular-nums">
              {distanceLabel}
            </Text>
          ) : null}
        </View>

        <View className="mt-2 flex-row items-center gap-4">
          <View className="flex-row items-center gap-1">
            <Users size={12} color={tokens.mutedForeground} />
            <Text className="text-xs text-muted-foreground">
              {gym.memberCount} {gym.memberCount === 1 ? "member" : "members"}
            </Text>
          </View>
          {gym.activeSessions > 0 ? (
            <Text className="text-xs font-medium text-success">
              {gym.activeSessions} active
            </Text>
          ) : null}
          {gym.upcomingSessions > 0 ? (
            <Text className="text-xs text-muted-foreground">
              {gym.upcomingSessions} upcoming
            </Text>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}

import { Text, View } from "react-native";
import { Image } from "expo-image";
import { Card } from "@/components/ui/card";
import { buildPhotoUrl } from "@/lib/photo-url";
import { getInitials } from "@jits/shared/utils";
import type { Athlete } from "@jits/shared/types/athlete";
import type { AthleteStatsRpc } from "@jits/shared/api/queries";

export function CompetitorHeader({
  athlete,
  gymName,
  stats,
}: {
  athlete: Athlete;
  gymName: string | null;
  stats: AthleteStatsRpc;
}) {
  const photoUri = buildPhotoUrl(athlete.profile_photo_url);
  return (
    <Card className="p-5 items-center gap-3">
      <View className="h-24 w-24 rounded-full bg-primary items-center justify-center overflow-hidden">
        {photoUri ? (
          <Image
            source={{ uri: photoUri }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
          />
        ) : (
          <Text className="text-2xl font-bold text-primary-foreground">
            {getInitials(athlete.display_name)}
          </Text>
        )}
      </View>
      <View className="items-center">
        <Text className="text-xl font-heading text-foreground">
          {athlete.display_name}
        </Text>
        {gymName ? (
          <Text className="text-sm text-muted-foreground">{gymName}</Text>
        ) : null}
      </View>
      <View className="flex-row items-center gap-6 mt-2">
        <View className="items-center">
          <Text className="text-2xl font-mono tabular-nums text-foreground">
            {athlete.current_elo}
          </Text>
          <Text className="text-xs text-muted-foreground">ELO</Text>
        </View>
        <View className="items-center">
          <Text className="text-2xl font-mono tabular-nums text-success">
            {stats.wins}
          </Text>
          <Text className="text-xs text-muted-foreground">Wins</Text>
        </View>
        <View className="items-center">
          <Text className="text-2xl font-mono tabular-nums text-destructive">
            {stats.losses}
          </Text>
          <Text className="text-xs text-muted-foreground">Losses</Text>
        </View>
        <View className="items-center">
          <Text className="text-2xl font-mono tabular-nums text-amber-500">
            {stats.draws}
          </Text>
          <Text className="text-xs text-muted-foreground">Draws</Text>
        </View>
      </View>
    </Card>
  );
}

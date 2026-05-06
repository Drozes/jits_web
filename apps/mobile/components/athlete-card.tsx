import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { RankIcon, EloTrendIcon } from "./athlete-card-parts";
import { buildPhotoUrl } from "../lib/photo-url";
import { getInitials } from "@jits/shared/utils";

interface AthleteCardProps {
  id?: string;
  rank: number;
  displayName: string;
  currentElo: number;
  eloTrend?: "up" | "down" | "neutral";
  wins: number;
  losses: number;
  gymName?: string;
  profilePhotoUrl?: string | null;
  isCurrentUser?: boolean;
}

export function AthleteCard({
  id,
  rank,
  displayName,
  currentElo,
  eloTrend,
  wins,
  losses,
  gymName,
  profilePhotoUrl,
  isCurrentUser,
}: AthleteCardProps) {
  const router = useRouter();
  const photoUri = buildPhotoUrl(profilePhotoUrl);
  const interactive = id && !isCurrentUser;

  const body = (
    <Card
      className={`p-4 ${isCurrentUser ? "border-primary/40 bg-primary/5" : ""}`}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-3 flex-1 min-w-0">
          <View className="w-8 items-center justify-center">
            <RankIcon rank={rank} />
          </View>
          <View className="h-11 w-11 items-center justify-center rounded-full bg-primary overflow-hidden">
            {photoUri ? (
              <Image
                source={{ uri: photoUri }}
                style={{ width: "100%", height: "100%" }}
                contentFit="cover"
              />
            ) : (
              <Text className="font-bold text-primary-foreground text-sm">
                {getInitials(displayName)}
              </Text>
            )}
          </View>
          <View className="flex-1 min-w-0">
            <View className="flex-row items-center gap-2">
              <Text
                className="text-[15px] font-heading text-foreground"
                numberOfLines={1}
              >
                {displayName}
              </Text>
              {isCurrentUser ? (
                <Badge variant="outline">
                  <Text className="text-[10px] font-heading text-primary">You</Text>
                </Badge>
              ) : null}
            </View>
            {gymName ? (
              <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                {gymName}
              </Text>
            ) : null}
          </View>
        </View>
        <View className="items-end">
          <View className="flex-row items-center gap-1">
            {eloTrend ? <EloTrendIcon trend={eloTrend} /> : null}
            <Text className="text-lg font-mono tabular-nums text-foreground">
              {currentElo}
            </Text>
          </View>
          <View className="flex-row items-center gap-1">
            <Text className="text-xs text-success tabular-nums">{wins}W</Text>
            <Text className="text-xs text-muted-foreground">·</Text>
            <Text className="text-xs text-destructive tabular-nums">{losses}L</Text>
          </View>
        </View>
      </View>
    </Card>
  );

  if (interactive) {
    return (
      <Pressable
        onPress={() => router.push(`/athlete/${id}`)}
        className="active:opacity-80"
      >
        {body}
      </Pressable>
    );
  }
  return body;
}

import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import {
  Award,
  Crown,
  Medal,
  Minus,
  TrendingDown,
  TrendingUp,
} from "lucide-react-native";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { useThemedTokens } from "../lib/theme/use-theme";
import { getInitials } from "@jits/shared/utils";
import { env } from "../lib/env";

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

function buildPhotoUrl(profilePhotoUrl: string | null | undefined): string | null {
  if (!profilePhotoUrl) return null;
  if (profilePhotoUrl.startsWith("http")) return profilePhotoUrl;
  try {
    return `${env.supabaseUrl}/storage/v1/object/public/athlete-photos/${profilePhotoUrl}`;
  } catch {
    return null;
  }
}

function RankIcon({ rank }: { rank: number }) {
  const tokens = useThemedTokens();
  if (rank === 1) return <Crown size={20} color={tokens.gold} />;
  if (rank === 2) return <Medal size={20} color={tokens.mutedForeground} />;
  if (rank === 3) return <Award size={20} color={tokens.brandOrange} />;
  return (
    <Text className="text-sm font-semibold text-muted-foreground">#{rank}</Text>
  );
}

function EloTrendIcon({ trend }: { trend: "up" | "down" | "neutral" }) {
  const tokens = useThemedTokens();
  if (trend === "up") return <TrendingUp size={14} color={tokens.success} />;
  if (trend === "down") return <TrendingDown size={14} color={tokens.destructive} />;
  return <Minus size={14} color={tokens.mutedForeground} />;
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
                className="text-[15px] font-semibold text-foreground"
                numberOfLines={1}
              >
                {displayName}
              </Text>
              {isCurrentUser ? (
                <Badge variant="outline">
                  <Text className="text-[10px] font-semibold text-primary">You</Text>
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
            <Text className="text-lg font-bold tabular-nums text-foreground">
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

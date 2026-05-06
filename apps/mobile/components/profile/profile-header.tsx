import * as React from "react";
import { Text, View } from "react-native";
import { Image } from "expo-image";
import { Card, CardContent } from "../ui/card";
import { EloBadge, getEloTierBorderClass } from "../elo-badge";
import { cn } from "../../lib/cn";
import { env } from "../../lib/env";
import { getInitials } from "@jits/shared/utils";
import type { AthleteGuardRow } from "@jits/shared/api/queries";

interface ProfileHeaderProps {
  athlete: Pick<AthleteGuardRow, "display_name" | "current_elo" | "highest_elo" | "current_weight" | "profile_photo_url">;
  gymName: string | null;
  stats: { wins: number; losses: number; winRate: number };
}

function profilePhotoSource(profilePhotoUrl: string | null | undefined) {
  if (!profilePhotoUrl) return null;
  if (profilePhotoUrl.startsWith("http")) return profilePhotoUrl;
  try {
    return `${env.supabaseUrl}/storage/v1/object/public/athlete-photos/${profilePhotoUrl}`;
  } catch {
    return null;
  }
}

export function ProfileHeader({ athlete, gymName, stats }: ProfileHeaderProps) {
  const photoSrc = profilePhotoSource(athlete.profile_photo_url);
  const tierBorder = getEloTierBorderClass(athlete.current_elo);

  return (
    <Card>
      <CardContent className="pt-6 pb-5 items-center gap-3">
        <View
          className={cn(
            "h-24 w-24 rounded-full overflow-hidden bg-muted items-center justify-center border-2",
            tierBorder,
          )}
        >
          {photoSrc ? (
            <Image
              source={photoSrc}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
              transition={150}
            />
          ) : (
            <Text className="text-2xl font-heading text-muted-foreground">
              {getInitials(athlete.display_name ?? "")}
            </Text>
          )}
        </View>

        <View className="items-center gap-1">
          <Text className="text-xl font-heading text-foreground" numberOfLines={1}>
            {athlete.display_name}
          </Text>
          {gymName ? (
            <Text className="text-sm text-muted-foreground" numberOfLines={1}>{gymName}</Text>
          ) : null}
        </View>

        <View className="flex-row items-center gap-4 pt-1">
          <View className="items-center">
            <Text className="text-xs text-muted-foreground mb-0.5">ELO</Text>
            <EloBadge elo={athlete.current_elo} peak={athlete.highest_elo ?? undefined} variant="display" />
          </View>
          <View className="h-10 w-px bg-border" />
          <View className="items-center">
            <Text className="text-xs text-muted-foreground mb-0.5">Record</Text>
            <Text className="text-2xl font-mono tabular-nums">
              <Text className="text-success">{stats.wins}</Text>
              <Text className="text-muted-foreground"> - </Text>
              <Text className="text-destructive">{stats.losses}</Text>
            </Text>
          </View>
          <View className="h-10 w-px bg-border" />
          <View className="items-center">
            <Text className="text-xs text-muted-foreground mb-0.5">Win Rate</Text>
            <Text className="text-2xl font-mono tabular-nums text-success">{stats.winRate}%</Text>
          </View>
        </View>
      </CardContent>
    </Card>
  );
}

import { Text, View } from "react-native";
import { Image } from "expo-image";
import { buildPhotoUrl } from "@/lib/photo-url";
import { getInitials } from "@jits/shared/utils";
import type { Athlete } from "@jits/shared/types/athlete";
import type { AthleteStatsRpc } from "@jits/shared/api/queries";

interface CompetitorHeaderProps {
  athlete: Athlete;
  gymName: string | null;
  stats: AthleteStatsRpc;
  /** Optional global rank for accent caption (e.g. "#01 GLOBAL"). */
  rank?: number;
}

/**
 * Centered hero for a viewed athlete profile, matching PROFILE_VIEW wireframe.
 * Mirrors ProfileHeader (G1) styling, but pulls athlete from the canonical
 * Athlete type and shows rank when supplied.
 */
export function CompetitorHeader({ athlete, gymName, stats, rank }: CompetitorHeaderProps) {
  const photoUri = buildPhotoUrl(athlete.profile_photo_url);
  const metaParts = [
    gymName ?? null,
    athlete.current_weight != null ? `${athlete.current_weight} lbs` : null,
    athlete.gender ? athlete.gender : null,
  ].filter(Boolean) as string[];

  const wins = stats.wins ?? 0;
  const losses = stats.losses ?? 0;
  const total = wins + losses + (stats.draws ?? 0);
  const winRate = total > 0 && stats.winRate != null ? `${stats.winRate}%` : "0%";
  const record = total > 0 ? `${wins}W · ${losses}L` : "0W · 0L";

  return (
    <View className="items-center gap-3">
      <View className="h-20 w-20 rounded-md bg-surface-3 border border-hairline items-center justify-center overflow-hidden">
        {photoUri ? (
          <Image
            source={{ uri: photoUri }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
          />
        ) : (
          <Text className="font-mono-bold text-[24px] text-ink tracking-caps">
            {getInitials(athlete.display_name ?? "")}
          </Text>
        )}
      </View>

      <View className="items-center gap-1">
        <Text className="font-heading text-[24px] text-ink" numberOfLines={1}>
          {athlete.display_name}
        </Text>
        {metaParts.length > 0 ? (
          <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-xl text-center">
            {metaParts.join("  ·  ")}
          </Text>
        ) : null}
      </View>

      <View className="bg-surface-3 border border-hairline rounded-md px-6 py-5 items-center w-full">
        <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl">
          ELO Rating
        </Text>
        <Text
          className="font-mono-bold text-ink mt-2"
          style={{ fontSize: 72, lineHeight: 72, letterSpacing: -2.8 }}
        >
          {athlete.current_elo}
        </Text>
        {rank != null ? (
          <Text className="font-mono-bold text-cta text-[12px] uppercase tracking-caps-l mt-2">
            #{rank}  ·  Global
          </Text>
        ) : null}
      </View>

      <View className="flex-row gap-3 w-full">
        <View className="flex-1 bg-surface-3 border border-hairline rounded-md px-4 py-4 items-center">
          <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl">
            Record
          </Text>
          <Text className="font-mono-bold text-ink mt-2" style={{ fontSize: 22, lineHeight: 24 }}>
            {record}
          </Text>
        </View>
        <View className="flex-1 bg-surface-3 border border-hairline rounded-md px-4 py-4 items-center">
          <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl">
            Win Rate
          </Text>
          <Text className="font-mono-bold text-ink mt-2" style={{ fontSize: 28, lineHeight: 30 }}>
            {winRate}
          </Text>
        </View>
      </View>
    </View>
  );
}

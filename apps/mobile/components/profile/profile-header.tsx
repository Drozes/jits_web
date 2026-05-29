import { Text, View } from "react-native";
import { Image } from "expo-image";
import { MetaTag } from "@/components/ui/elo-system";
import { cn } from "../../lib/cn";
import { env } from "../../lib/env";
import { getInitials } from "@jits/shared/utils";
import type { AthleteGuardRow } from "@jits/shared/api/queries";

interface ProfileHeaderProps {
  athlete: Pick<
    AthleteGuardRow,
    "display_name" | "current_elo" | "highest_elo" | "current_weight" | "profile_photo_url" | "gender"
  >;
  gymName: string | null;
  /** Optional global rank for accent caption (e.g. "#847 GLOBAL"). */
  rank?: number;
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

/**
 * Centered hero for the My Profile screen, matching G1 wireframe:
 * 80x80 plate avatar with large initials, name in font-heading, meta line
 * (gym, weight, gender), then a single hero ELO tile with rank caption below.
 */
export function ProfileHeader({ athlete, gymName, rank }: ProfileHeaderProps) {
  const photoSrc = profilePhotoSource(athlete.profile_photo_url);
  const initials = getInitials(athlete.display_name ?? "");
  const metaParts = [
    gymName ?? null,
    athlete.current_weight != null ? `${athlete.current_weight} lbs` : null,
    athlete.gender ? athlete.gender : null,
  ].filter(Boolean) as string[];

  return (
    <View className="items-center gap-3">
      <View
        className={cn(
          "h-20 w-20 rounded-md bg-surface-3 border border-hairline items-center justify-center overflow-hidden",
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
          <Text className="font-mono-bold text-[24px] text-ink tracking-caps">
            {initials}
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

      <View className="items-center gap-2 w-full">
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
          ) : athlete.highest_elo && athlete.highest_elo > athlete.current_elo ? (
            <Text className="font-mono text-ink-3 text-[10px] uppercase tracking-caps-l mt-2">
              Peak {athlete.highest_elo}
            </Text>
          ) : null}
        </View>
        {metaParts.length === 0 ? (
          <View className="flex-row gap-2">
            <MetaTag>No-Gi</MetaTag>
            <MetaTag>Sub-Only</MetaTag>
          </View>
        ) : null}
      </View>
    </View>
  );
}

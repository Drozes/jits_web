import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { LivePill, MetaTag, Plate } from "@/components/ui/elo-system";
import type { GymListItem } from "@jits/shared/types/session";

interface GymCardProps {
  gym: GymListItem;
  isMyGym: boolean;
  /** Optional formatted distance ("1.2 km"); shown when location is available. */
  distanceLabel?: string | null;
  /**
   * Optional schedule hint (e.g. "Sun 11AM"). Replaces the right side of the
   * header on non-live gyms when supplied.
   */
  scheduleLabel?: string | null;
}

/**
 * E1 GYM FINDER row.
 *
 * Live gyms get a Plate `variant="live"` with the LivePill on the right and a
 * subtitle reading "{city} · {n} in lobby". Non-live gyms get a default Plate
 * with either a schedule MetaTag (e.g. "Sun 11AM"), an upcoming-count tag, or
 * a "No Sessions" placeholder, and a subtitle showing the city.
 */
export function GymCard({ gym, isMyGym, distanceLabel, scheduleLabel }: GymCardProps) {
  const router = useRouter();
  const live = gym.hasActiveSession;

  // Subtitle: city, then "(n) in lobby" when live.
  const subtitleParts: string[] = [];
  if (gym.city) subtitleParts.push(gym.city);
  if (live) {
    subtitleParts.push(
      `${gym.memberCount} in lobby`,
    );
  }
  if (distanceLabel) subtitleParts.push(distanceLabel);
  const subtitle = subtitleParts.join(" · ");

  // Right-side tag for non-live rows: prefer caller-provided schedule, then
  // fall back to upcoming-session count, then "No Sessions".
  const fallbackSchedule = !live
    ? scheduleLabel ??
      (gym.upcomingSessions > 0
        ? `${gym.upcomingSessions} Upcoming`
        : "No Sessions")
    : null;

  return (
    <Pressable
      onPress={() => router.push(`/gyms/${gym.id}`)}
      accessibilityRole="button"
      className="active:opacity-80"
    >
      <Plate variant={live ? "live" : "default"}>
        <View className="flex-row items-center justify-between gap-3 mb-2">
          <View className="flex-1 min-w-0 flex-row items-center flex-wrap gap-x-2">
            <Text
              numberOfLines={1}
              className="font-heading text-[18px] text-ink"
            >
              {gym.name}
            </Text>
            {isMyGym ? (
              <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-l">
                · My Gym
              </Text>
            ) : null}
          </View>
          {live ? (
            <LivePill label="Live" />
          ) : fallbackSchedule ? (
            <MetaTag>{fallbackSchedule}</MetaTag>
          ) : null}
        </View>
        {subtitle ? (
          <Text className="font-body text-[12px] text-ink-3">{subtitle}</Text>
        ) : null}
      </Plate>
    </Pressable>
  );
}

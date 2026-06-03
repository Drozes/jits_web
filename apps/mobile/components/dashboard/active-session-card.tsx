import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { LivePill, MetaTag, Plate } from "@/components/ui/elo-system";
import { formatTimeUntil } from "@jits/shared/utils";
import type { ActiveSessionInfo } from "@jits/shared/types/session";

interface ActiveSessionCardProps {
  session: ActiveSessionInfo | null;
}

function formatNextLabel(scheduledStart: string): string {
  return new Date(scheduledStart).toLocaleString(undefined, {
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
  });
}

function minutesSince(scheduledStart: string): number {
  const startMs = new Date(scheduledStart).getTime();
  return Math.max(0, Math.floor((Date.now() - startMs) / 60_000));
}

export function ActiveSessionCard({ session }: ActiveSessionCardProps) {
  const router = useRouter();

  if (!session) {
    return (
      <Plate>
        <View className="flex-row items-center justify-between mb-2">
          <Text className="font-heading text-[18px] text-ink flex-1" numberOfLines={1}>
            No upcoming session
          </Text>
          <MetaTag>Find a gym</MetaTag>
        </View>
        <Text className="font-body text-[13px] text-ink-2 mb-2">
          Browse gyms in your city to see scheduled open mats.
        </Text>
        <Pressable
          onPress={() => router.push("/(app)/gyms")}
          accessibilityRole="button"
          hitSlop={{ top: 14, bottom: 14, left: 8, right: 8 }}
          className="active:opacity-70"
        >
          <Text className="font-mono-bold text-[10px] text-cta uppercase tracking-caps-l">
            Browse gyms →
          </Text>
        </Pressable>
      </Plate>
    );
  }

  if (session.status === "active") {
    const target = session.isCheckedIn
      ? `/(app)/session/${session.sessionId}/lobby`
      : `/(app)/session/${session.sessionId}/join`;
    const mins = minutesSince(session.scheduledStart);
    return (
      <Plate variant="live">
        <View className="flex-row items-center justify-between mb-2">
          <Text
            className="font-heading text-[18px] text-ink flex-1"
            numberOfLines={1}
          >
            {session.gymName}
          </Text>
          <LivePill />
        </View>
        <Text className="font-mono text-[10px] text-ink-2 uppercase tracking-caps-l mb-3">
          {session.participantCount} athletes in lobby · Session started{" "}
          {mins} min ago
        </Text>
        <Pressable
          onPress={() => router.push(target)}
          accessibilityRole="button"
          className="bg-cta rounded-sm py-3 px-5 items-center justify-center active:bg-cta-hover"
        >
          <Text className="font-heading text-[13px] text-ink-on-cta uppercase tracking-caps">
            {session.isCheckedIn ? "Enter Lobby" : "Check In"} →
          </Text>
        </Pressable>
      </Plate>
    );
  }

  const startsHint = formatTimeUntil(session.scheduledStart);
  return (
    <Plate>
      <View className="flex-row items-center justify-between mb-2">
        <Text className="font-heading text-[18px] text-ink flex-1" numberOfLines={1}>
          {session.gymName}
        </Text>
        <MetaTag>{startsHint ?? "Upcoming"}</MetaTag>
      </View>
      <Text className="font-body text-[13px] text-ink-2 mb-2">
        Next session: {formatNextLabel(session.scheduledStart)}
      </Text>
      <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l">
        {session.participantCount} athletes RSVP{"’"}d
      </Text>
    </Plate>
  );
}

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
    // Says only that the athlete is not checked in, the one thing a null here
    // reliably means. It must NOT also claim they have not RSVP'd:
    // getActiveSession's RSVP branch matches only sessions still `scheduled`
    // with a start in the future, so an athlete who RSVP'd to tonight's open
    // mat and opens the app after it goes active (or after its start time
    // passes) lands in this branch having very much RSVP'd. Nor may it say
    // there is nothing on: the gym's sessions are listed by the discovery
    // section directly below, which also owns the browse action. A second one
    // here read as a contradiction when that list showed the very session this
    // card called missing.
    return (
      <Plate>
        <View className="flex-row items-center justify-between mb-2">
          <Text className="font-heading text-[18px] text-ink flex-1" numberOfLines={1}>
            Not checked in
          </Text>
          <MetaTag>Not in a session</MetaTag>
        </View>
        <Text className="font-body text-[13px] text-ink-2">
          You{"’"}re not checked in to a session yet. Pick one from Find a
          Session below.
        </Text>
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

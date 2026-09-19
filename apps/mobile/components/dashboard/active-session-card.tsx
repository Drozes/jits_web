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
    // A null here reliably means ONE thing: the athlete is not in a live
    // session. Every string in this branch says that and nothing more, because
    // the two richer-sounding claims are both reachable-false:
    //
    //   "you haven't RSVP'd" -- getActiveSession's RSVP branch matches only
    //   sessions still `scheduled` with a future start, so an athlete who
    //   RSVP'd to tonight's open mat and opens the app after it goes active
    //   lands here having very much RSVP'd.
    //
    //   "you're not checked in" -- joinSessionLobby checks a participant in
    //   unconditionally and writes no RSVP row (mutations.ts:234-261), and the
    //   discovery section's Attend row opens that wizard for SCHEDULED sessions
    //   too, so one tap on Home checks an athlete into a session that is still
    //   scheduled. Priority 1 finds no active session, priority 2 finds no
    //   RSVP, this branch renders, and they checked in a moment ago from this
    //   very screen. (The fix belongs in packages/shared; see jits-icei.5.)
    //
    // Nor may it say there is nothing on: the gym's sessions are listed
    // directly below, which also owns the browse action. A second one here read
    // as a contradiction when that list showed the session this card missed.
    return (
      <Plate>
        <View className="flex-row items-center justify-between mb-2">
          <Text className="font-heading text-[18px] text-ink flex-1" numberOfLines={1}>
            No live session
          </Text>
          {/* Kept short on purpose: this sits in a justify-between row against
              a flex-1 numberOfLines={1} heading, and at 320pt a 16-character
              tag leaves the heading about 113pt for about 106pt of text, i.e.
              truncation on the next copy change or at a larger text size. */}
          <MetaTag>Not live</MetaTag>
        </View>
        <Text className="font-body text-[13px] text-ink-2">
          You{"’"}re not in a live session right now. Pick one from Find a
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

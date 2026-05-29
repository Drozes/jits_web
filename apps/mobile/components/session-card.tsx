import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { LivePill, MetaTag, Plate } from "./ui/elo-system";
import { SessionActions } from "./session/session-actions";
import { formatTimeUntil } from "@jits/shared/utils";
import type { SessionListItem } from "@jits/shared/types/session";

interface SessionCardProps {
  session: SessionListItem;
  /** Optional: if provided, shows whether the current athlete has RSVP'd. */
  isRsvpd?: boolean;
  /** Optional: if true, routes directly to the lobby instead of the join wizard. */
  isParticipant?: boolean;
  /** Optional: if true, shows session management actions (activate, cancel, end). */
  canManage?: boolean;
  /** Called after a management action completes (e.g. activate, cancel). */
  onActionComplete?: () => void;
}

function formatSessionTime(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  const dateStr = s.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const startTime = s.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const endTime = e.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${dateStr}, ${startTime} - ${endTime}`;
}

export function SessionCard({
  session,
  isRsvpd,
  isParticipant,
  canManage,
  onActionComplete,
}: SessionCardProps) {
  const router = useRouter();
  const title = session.title ?? "Open Mat";
  const isActive = session.status === "active";
  const startsIn = !isActive ? formatTimeUntil(session.scheduledStart) : null;
  const capacityText = session.maxParticipants
    ? `${session.participantCount}/${session.maxParticipants}`
    : `${session.participantCount}`;

  // Already checked in: skip the join wizard and go straight to the lobby.
  const target = isParticipant
    ? (`/session/${session.id}/lobby` as const)
    : (`/session/${session.id}/join` as const);

  // Build metadata strip lines kept short and uppercase/mono for ELO style.
  const timeLine = formatSessionTime(session.scheduledStart, session.scheduledEnd);
  const checkedInLine = `${capacityText} checked in${
    session.rsvpCount > 0 ? ` · ${session.rsvpCount} RSVP` : ""
  }`;

  return (
    <Pressable
      onPress={() => router.push(target)}
      accessibilityRole="button"
      className="active:opacity-80"
    >
      <Plate variant={isActive ? "live" : "default"} className="gap-2">
        <View className="flex-row items-center justify-between gap-2">
          <Text
            className="font-heading text-[16px] text-ink flex-1"
            numberOfLines={1}
          >
            {title}
          </Text>
          <View className="flex-row items-center gap-2">
            {isActive ? (
              <LivePill label="Live" />
            ) : (
              <MetaTag>Scheduled</MetaTag>
            )}
            {canManage && onActionComplete ? (
              <SessionActions
                sessionId={session.id}
                status={session.status}
                onActionComplete={onActionComplete}
              />
            ) : null}
          </View>
        </View>

        <Text className="font-mono text-[11px] text-ink-3 uppercase tracking-caps-l">
          {timeLine}
          {startsIn ? ` · ${startsIn}` : ""}
        </Text>

        <Text className="font-mono text-[11px] text-ink-3 uppercase tracking-caps-l">
          {checkedInLine}
          {isRsvpd ? " · You RSVP’d" : ""}
        </Text>

        <Text className="font-body text-[12px] text-ink-3 mt-1">
          Hosted by {session.createdByName}
        </Text>
      </Plate>
    </Pressable>
  );
}

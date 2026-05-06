import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Clock, Users } from "lucide-react-native";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { SessionActions } from "./session/session-actions";
import { useThemedTokens } from "../lib/theme/use-theme";
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

export function SessionCard({ session, isRsvpd, isParticipant, canManage, onActionComplete }: SessionCardProps) {
  const router = useRouter();
  const tokens = useThemedTokens();
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

  return (
    <Pressable
      onPress={() => router.push(target)}
      className="active:opacity-80"
    >
      <Card className="p-4 gap-2">
        <View className="flex-row items-center justify-between">
          <Text className="text-[15px] font-semibold text-foreground">
            {title}
          </Text>
          <View className="flex-row items-center gap-1.5">
            {isActive ? (
              <Badge variant="success">
                <Text className="text-[10px] font-semibold text-success-foreground">Live</Text>
              </Badge>
            ) : (
              <Badge variant="secondary">
                <Text className="text-[10px] font-semibold text-secondary-foreground">Scheduled</Text>
              </Badge>
            )}
            {canManage && onActionComplete ? (
              <SessionActions sessionId={session.id} status={session.status} onActionComplete={onActionComplete} />
            ) : null}
          </View>
        </View>

        <View className="flex-row items-center gap-1.5">
          <Clock size={12} color={tokens.mutedForeground} />
          <Text className="text-xs text-muted-foreground">
            {formatSessionTime(session.scheduledStart, session.scheduledEnd)}
          </Text>
          {startsIn ? (
            <Text className="text-xs font-medium text-amber-500">{startsIn}</Text>
          ) : null}
        </View>

        <View className="flex-row items-center gap-3">
          <View className="flex-row items-center gap-1">
            <Users size={12} color={tokens.mutedForeground} />
            <Text className="text-xs text-muted-foreground">
              {capacityText} checked in
            </Text>
          </View>
          {session.rsvpCount > 0 ? (
            <Text className="text-xs text-muted-foreground">
              {session.rsvpCount} RSVP
            </Text>
          ) : null}
          {isRsvpd ? (
            <Text className="text-xs font-medium text-primary">You RSVP'd</Text>
          ) : null}
        </View>

        <Text className="text-xs text-muted-foreground">
          Hosted by {session.createdByName}
        </Text>
      </Card>
    </Pressable>
  );
}

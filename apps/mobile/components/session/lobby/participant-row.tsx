import { Pressable, Text, View } from "react-native";
import { Swords } from "lucide-react-native";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { getInitials } from "@jits/shared/utils";
import type { LobbyParticipant } from "@jits/shared/types/session";

interface ParticipantRowProps {
  participant: LobbyParticipant;
  onChallenge: (participant: LobbyParticipant) => void;
  isBusy: boolean;
}

/**
 * Single row in the lobby's participant list. Shows display name, ELO,
 * weight, and a "Challenge" pill that opens the challenge action sheet.
 *
 * Disabled when the athlete is in a match or marked busy
 * (e.g. mid-handshake on a sent challenge).
 */
export function ParticipantRow({ participant, onChallenge, isBusy }: ParticipantRowProps) {
  const tokens = useThemedTokens();
  const inMatch = participant.status === "in_match";
  const disabled = isBusy || inMatch;

  return (
    <Card className="p-3">
      <View className="flex-row items-center gap-3">
        <Avatar>
          {participant.profilePhotoUrl ? (
            <AvatarImage source={{ uri: participant.profilePhotoUrl }} />
          ) : null}
          <AvatarFallback>{getInitials(participant.displayName)}</AvatarFallback>
        </Avatar>

        <View className="flex-1 gap-0.5">
          <Text
            className="text-sm font-medium text-foreground"
            numberOfLines={1}
          >
            {participant.displayName}
          </Text>
          <View className="flex-row items-center gap-2">
            <Text className="text-xs tabular-nums text-foreground">
              {participant.currentElo}
            </Text>
            {participant.currentWeight ? (
              <Text className="text-xs text-muted-foreground">
                · {participant.currentWeight} lbs
              </Text>
            ) : null}
          </View>
        </View>

        {inMatch ? (
          <Badge variant="secondary">
            <Text className="text-[10px] font-heading text-secondary-foreground">
              In Match
            </Text>
          </Badge>
        ) : (
          <Pressable
            onPress={() => onChallenge(participant)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={`Challenge ${participant.displayName}`}
            className={`flex-row items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 ${
              disabled ? "opacity-50" : ""
            }`}
          >
            <Swords size={14} color={tokens.primaryForeground} />
            <Text className="text-xs font-medium text-primary-foreground">
              {isBusy ? "..." : "Challenge"}
            </Text>
          </Pressable>
        )}
      </View>
    </Card>
  );
}

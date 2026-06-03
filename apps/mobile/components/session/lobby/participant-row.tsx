import { Pressable, Text } from "react-native";
import { Swords } from "lucide-react-native";
import { ParticipantRow as ParticipantRowPrimitive } from "@/components/ui/elo-system";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { cn } from "@/lib/cn";
import type { LobbyParticipant } from "@jits/shared/types/session";

interface ParticipantRowProps {
  participant: LobbyParticipant;
  onChallenge: (participant: LobbyParticipant) => void;
  isBusy: boolean;
}

/**
 * Single row in the lobby's participant list. Wraps the shared ELO
 * `ParticipantRow` primitive and feeds it the lobby-specific challenge
 * action and busy-state logic.
 *
 * Per C4 wireframe (lines 1031-1062): name + "ELO · weight" subtitle, a
 * status badge (Available / In Match), and a small "Challenge" cta. Disabled
 * when the athlete is in a match or marked busy (mid-handshake on a sent
 * challenge).
 */
export function ParticipantRow({ participant, onChallenge, isBusy }: ParticipantRowProps) {
  const tokens = useThemedTokens();
  const inMatch = participant.status === "in_match";
  const disabled = isBusy || inMatch;

  const subtitle = participant.currentWeight
    ? `${participant.currentElo} · ${participant.currentWeight} lbs`
    : `${participant.currentElo}`;

  const action = inMatch ? null : (
    <Pressable
      onPress={() => onChallenge(participant)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Challenge ${participant.displayName}`}
      className={cn(
        "flex-row items-center gap-1.5 rounded-sm bg-cta px-3 py-1.5",
        disabled && "opacity-50",
        "active:bg-cta-hover",
      )}
      hitSlop={{ top: 11, bottom: 11, left: 6, right: 6 }}
    >
      <Swords size={12} color={tokens.textOnAccent} />
      <Text className="font-heading text-[10px] text-ink-on-cta uppercase tracking-caps">
        {isBusy ? "..." : "Challenge"}
      </Text>
    </Pressable>
  );

  return (
    <ParticipantRowPrimitive
      name={participant.displayName}
      subtitle={subtitle}
      status={inMatch ? "busy" : "available"}
      action={action}
    />
  );
}

import { Alert } from "react-native";
import type { LobbyParticipant } from "@jits/shared/types/session";

/**
 * Confirmation alert before sending a challenge. All matches are ranked.
 */
export function showChallengeActionSheet(
  opponent: LobbyParticipant,
  onConfirm: () => void,
) {
  Alert.alert(
    `Challenge ${opponent.displayName}?`,
    `ELO ${opponent.currentElo}${
      opponent.currentWeight ? ` · ${opponent.currentWeight} lbs` : ""
    }`,
    [
      { text: "Cancel", style: "cancel" },
      { text: "Challenge", onPress: onConfirm },
    ],
  );
}

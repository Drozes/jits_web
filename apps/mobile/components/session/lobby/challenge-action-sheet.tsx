import { Alert, type AlertButton } from "react-native";
import type { LobbyParticipant } from "@jits/shared/types/session";

/**
 * Lightweight "action sheet" for choosing a challenge match type.
 * RN's `Alert.alert` renders as a native action sheet on iOS and a
 * bottom-anchored dialog on Android, which is plenty for this v1.
 *
 * If we later need richer UX (ELO preview, etc.) we'd swap to the
 * `@gorhom/bottom-sheet`-backed `Sheet` primitive.
 */
export function showChallengeActionSheet(
  opponent: LobbyParticipant,
  onChallenge: (matchType: "casual" | "ranked") => void,
) {
  const buttons: AlertButton[] = [
    { text: "Cancel", style: "cancel" },
    { text: "Casual", onPress: () => onChallenge("casual") },
    { text: "Ranked", onPress: () => onChallenge("ranked") },
  ];

  Alert.alert(
    `Challenge ${opponent.displayName}?`,
    `ELO ${opponent.currentElo}${
      opponent.currentWeight ? ` · ${opponent.currentWeight} lbs` : ""
    }`,
    buttons,
  );
}

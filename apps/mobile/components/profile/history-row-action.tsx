import { View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { DeltaNumber } from "@/components/ui/elo-system";
import { recordedEloDelta } from "@jits/shared/utils";

/**
 * Trailing action of a pressable match history row: the ELO delta (every
 * match is ranked; a legacy row with no recorded rating, elo_after NULL, shows none) then a
 * chevron that signals the row opens the match detail screen.
 */
export function HistoryRowAction({
  eloDelta,
  eloAfter,
}: {
  eloDelta: number | null;
  eloAfter: number | null;
}) {
  const tokens = useThemedTokens();
  const delta = recordedEloDelta({ elo_delta: eloDelta, elo_after: eloAfter });
  return (
    <View className="flex-row items-center gap-2">
      {delta != null ? (
        <DeltaNumber value={delta} size="m" showSign />
      ) : null}
      <ChevronRight size={16} color={tokens.textSecondary} />
    </View>
  );
}

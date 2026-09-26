import { View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { DeltaNumber } from "@/components/ui/elo-system";

/**
 * Trailing action of a pressable match history row: the ELO delta (ranked
 * only) then a chevron that signals the row opens the match detail screen.
 */
export function HistoryRowAction({
  matchType,
  eloDelta,
}: {
  matchType: string | null;
  eloDelta: number | null;
}) {
  const tokens = useThemedTokens();
  return (
    <View className="flex-row items-center gap-2">
      {matchType === "ranked" && eloDelta != null ? (
        <DeltaNumber value={eloDelta} size="m" showSign />
      ) : null}
      <ChevronRight size={16} color={tokens.textSecondary} />
    </View>
  );
}

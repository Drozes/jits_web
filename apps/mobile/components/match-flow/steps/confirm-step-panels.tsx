import { ActivityIndicator, Text, View } from "react-native";
import { Check } from "lucide-react-native";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { Plate } from "@/components/ui/elo-system";
import { cn } from "@/lib/cn";
import type { BroadcastResult } from "@jits/shared/hooks/use-session-match-sync";

/**
 * Hero verdict banner for the confirm step. Mirrors D9's outcome-banner
 * (wireframe lines 1283-1286): win = positive plate, loss = negative
 * plate, draw = hairline plate. Display-typography verdict.
 */
export function ResultBanner({
  resultData,
  currentAthleteId,
  matchType,
}: {
  resultData: BroadcastResult | null;
  currentAthleteId: string;
  matchType: "ranked" | "casual";
}) {
  const isWinner =
    resultData?.result === "submission" && resultData.winnerId === currentAthleteId;
  const isLoser =
    resultData?.result === "submission" && resultData.winnerId !== currentAthleteId;
  const isDraw = resultData?.result === "draw";

  const variant = isWinner ? "win" : isLoser ? "loss" : "default";
  const verdictColor = isWinner
    ? "text-positive"
    : isLoser
      ? "text-negative"
      : "text-ink";
  const verdictText = isWinner
    ? "YOU WON"
    : isLoser
      ? "YOU LOST"
      : isDraw
        ? "DRAW"
        : "MATCH COMPLETE";

  return (
    <Plate variant={variant} className="items-center gap-2">
      <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl">
        Match Recorded
      </Text>
      <Text
        className={cn("font-display text-[36px] tracking-mark", verdictColor)}
      >
        {verdictText}
      </Text>
      {matchType === "ranked" ? (
        <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l">
          Ranked. ELO updates on confirmation.
        </Text>
      ) : null}
    </Plate>
  );
}

/**
 * Single athlete confirm-state panel used in the confirm step.
 *
 * ELO design system: hairline-bordered plate, swaps to positive border
 * + check glyph once the athlete has confirmed.
 */
export function ConfirmPanel({
  label,
  confirmed,
}: {
  label: string;
  confirmed: boolean;
}) {
  const tokens = useThemedTokens();
  return (
    <View
      className={cn(
        "flex-1 items-center gap-2 rounded-md bg-surface-3 border px-3 py-4",
        confirmed ? "border-positive" : "border-hairline-strong",
      )}
    >
      {confirmed ? (
        <View className="h-8 w-8 items-center justify-center rounded-full border border-positive">
          <Check size={16} color={tokens.statePositive} />
        </View>
      ) : (
        <ActivityIndicator color={tokens.textSecondary} />
      )}
      <Text
        className={cn(
          "w-full text-center font-heading text-[11px] uppercase tracking-caps",
          confirmed ? "text-positive" : "text-ink-2",
        )}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

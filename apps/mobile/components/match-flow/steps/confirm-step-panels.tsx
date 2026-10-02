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
  subtitle,
  kicker = "Match Recorded",
}: {
  resultData: BroadcastResult | null;
  currentAthleteId: string;
  /** Overrides the default line under the verdict (practice has no dispute). */
  subtitle?: string;
  /** Overrides the small line above the verdict. */
  kicker?: string;
}) {
  const isWinner =
    resultData?.result === "submission" && resultData.winnerId === currentAthleteId;
  const isLoser =
    resultData?.result === "submission" && resultData.winnerId !== currentAthleteId;
  const isDraw = resultData?.result === "draw";

  const variant = isWinner ? "win" : isLoser ? "loss" : "default";
  // A draw headline is amber (`attention`), like the verdict step's DRAW.
  const verdictColor = isWinner
    ? "text-positive"
    : isLoser
      ? "text-negative"
      : isDraw
        ? "text-attention"
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
      <Text className="font-mono-bold tabular-nums text-micro text-ink-3 uppercase tracking-caps-xl">
        {kicker}
      </Text>
      <Text
        testID="confirm-verdict"
        className={cn("font-display text-display-36 tracking-mark", verdictColor)}
      >
        {verdictText}
      </Text>
      <Text className="text-center font-body text-small text-ink-2">
        {subtitle ??
          "Your rating is already updated. Confirm if this is right, or dispute it and an admin will review."}
      </Text>
    </Plate>
  );
}

/**
 * Where one athlete stands on the confirm step:
 * - `your-call`: the viewer has not acted yet (their turn, not a wait),
 * - `confirming`: the opponent has not confirmed yet,
 * - `confirmed`: the confirmation is in.
 */
export type ConfirmPanelState = "your-call" | "confirming" | "confirmed";

const STATUS_COPY: Record<ConfirmPanelState, string> = {
  "your-call": "Your call",
  confirming: "Confirming...",
  confirmed: "Confirmed",
};

/**
 * Single athlete confirm-state panel used in the confirm step.
 *
 * ELO design system: hairline-bordered plate. The viewer's own pending
 * panel shows an empty hairline circle (a spinner there read as "waiting on
 * something" rather than "your turn"); the opponent's pending panel keeps
 * the spinner; either swaps to a positive border + check once confirmed.
 */
export function ConfirmPanel({
  label,
  side,
  state,
}: {
  label: string;
  /** Which athlete this panel is for; keeps the testIDs unique per side. */
  side: "you" | "opponent";
  state: ConfirmPanelState;
}) {
  const tokens = useThemedTokens();
  const confirmed = state === "confirmed";
  return (
    <View
      testID={`confirm-panel-${side}-${state}`}
      className={cn(
        "flex-1 items-center gap-2 rounded-md border border-hairline-strong px-3 py-4",
        // Confirmed is a surface step plus an ink check, never Gain Green (WP2).
        confirmed ? "bg-surface-4" : "bg-surface-3",
      )}
    >
      {confirmed ? (
        <View className="h-8 w-8 items-center justify-center rounded-full border border-ink">
          <Check size={16} color={tokens.textPrimary} />
        </View>
      ) : state === "your-call" ? (
        <View className="h-8 w-8 rounded-full border border-hairline-strong" />
      ) : (
        <View className="h-8 w-8 items-center justify-center">
          <ActivityIndicator color={tokens.textSecondary} />
        </View>
      )}
      <Text
        className={cn(
          "w-full text-center font-heading text-caption uppercase tracking-caps",
          confirmed ? "text-ink" : "text-ink-2",
        )}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text className="font-body text-small text-ink-3" numberOfLines={1}>
        {STATUS_COPY[state]}
      </Text>
    </View>
  );
}

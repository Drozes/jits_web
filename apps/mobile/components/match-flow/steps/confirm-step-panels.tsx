import * as React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Check } from "lucide-react-native";
import { useThemedTokens } from "@/lib/theme/use-theme";
import type { BroadcastResult } from "@jits/shared/hooks/use-session-match-sync";

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
  return (
    <View className="items-center gap-1">
      {isWinner ? <Text className="text-3xl font-bold text-success">Victory!</Text> : null}
      {isLoser ? <Text className="text-3xl font-bold text-destructive">Defeat</Text> : null}
      {resultData?.result === "draw" ? (
        <Text className="text-3xl font-bold text-amber-500">Draw</Text>
      ) : null}
      {!resultData ? (
        <Text className="text-xl font-semibold text-foreground">Match Complete</Text>
      ) : null}
      {matchType === "ranked" ? (
        <Text className="text-xs text-muted-foreground">
          Ranked match. ELO will update on confirmation.
        </Text>
      ) : null}
    </View>
  );
}

export function ConfirmPanel({
  label,
  confirmed,
}: {
  label: string;
  confirmed: boolean;
}) {
  const tokens = useThemedTokens();
  return (
    <View className="flex-1 items-center gap-2 rounded-xl border border-border p-4">
      {confirmed ? (
        <View className="h-8 w-8 items-center justify-center rounded-full bg-success/10">
          <Check size={18} color={tokens.success} />
        </View>
      ) : (
        <ActivityIndicator color={tokens.mutedForeground} />
      )}
      <Text className="w-full text-center text-xs font-medium text-foreground" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

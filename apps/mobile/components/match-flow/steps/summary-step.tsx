import * as React from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { CheckCircle2 } from "lucide-react-native";
import { Button } from "@/components/ui/button";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { cn } from "@/lib/cn";

interface SummaryStepProps {
  sessionId: string;
  matchType: "ranked" | "casual";
  matchStatus: string;
  /** "win" | "loss" | "draw" — null when no result was recorded yet. */
  outcome: "win" | "loss" | "draw" | null;
  /** Own ELO delta (signed). 0 / undefined for casual matches. */
  eloDelta: number | null;
}

/**
 * Step 8 -- terminal summary screen. Shows W/L/D banner + ELO delta and
 * navigates back to the lobby (or out to /). Mirrors the web's
 * `match-recorded-step` plus a result banner.
 */
export function SummaryStep(props: SummaryStepProps) {
  const tokens = useThemedTokens();
  const router = useRouter();
  const { sessionId, matchType, matchStatus, outcome, eloDelta } = props;
  const disputed = matchStatus === "disputed";

  return (
    <View className="items-center gap-5 px-1 py-8">
      <CheckCircle2 size={64} color={tokens.success} />
      <View className="items-center gap-1">
        {disputed ? (
          <Text className="text-2xl font-display text-amber-500">Disputed</Text>
        ) : outcome === "win" ? (
          <Text className="text-3xl font-display text-success">Victory!</Text>
        ) : outcome === "loss" ? (
          <Text className="text-3xl font-display text-destructive">Defeat</Text>
        ) : outcome === "draw" ? (
          <Text className="text-3xl font-display text-amber-500">Draw</Text>
        ) : (
          <Text className="text-2xl font-heading text-foreground">Match Recorded</Text>
        )}
        {eloDelta != null && eloDelta !== 0 ? (
          <Text
            className={cn(
              "text-base font-mono tabular-nums",
              eloDelta > 0 ? "text-success" : "text-destructive",
            )}
          >
            {eloDelta > 0 ? "+" : ""}
            {eloDelta} ELO
          </Text>
        ) : null}
      </View>
      <View className="w-full gap-3 pt-2">
        <Button size="lg" onPress={() => router.replace(`/(app)/session/${sessionId}/lobby`)}>
          Back to Lobby
        </Button>
        <Button
          variant="outline"
          size="lg"
          onPress={() => router.replace("/")}
        >
          Done
        </Button>
      </View>
    </View>
  );
}

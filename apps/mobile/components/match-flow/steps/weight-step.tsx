import * as React from "react";
import { Text, View } from "react-native";
import { AlertTriangle, Scale } from "lucide-react-native";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useThemedTokens } from "@/lib/theme/use-theme";

interface WeightStepProps {
  currentDisplayName: string;
  currentWeight: number | null;
  opponentDisplayName: string;
  opponentWeight: number | null;
  matchType: "ranked" | "casual";
  onConfirm: () => void;
}

const DIVISION_SIZE_LBS = 11; // ~5 kg IBJJF division gap, mirrors web

function divisionGap(a: number, b: number): number {
  return Math.floor(Math.abs(a - b) / DIVISION_SIZE_LBS);
}

/**
 * Step 2 -- both athletes confirm scale weights before the ready check.
 * Mirrors `apps/web/.../steps/weight-verify-step.tsx`, including the
 * weight-division-gap warning for ranked matches.
 */
export function WeightStep(props: WeightStepProps) {
  const tokens = useThemedTokens();
  const { currentDisplayName, currentWeight, opponentDisplayName, opponentWeight, matchType, onConfirm } = props;
  const both = currentWeight != null && opponentWeight != null;
  const diff = both ? Math.abs(currentWeight! - opponentWeight!) : 0;
  const gap = both ? divisionGap(currentWeight!, opponentWeight!) : 0;

  return (
    <View className="gap-5 px-1 py-4">
      <View className="items-center gap-2">
        <Scale size={28} color={tokens.destructive} />
        <Text className="text-lg font-semibold text-foreground">Verify Weights</Text>
      </View>

      <View className="flex-row gap-3">
        <WeightCard name={currentDisplayName} weight={currentWeight} />
        <WeightCard name={opponentDisplayName} weight={opponentWeight} />
      </View>

      {both && matchType === "ranked" && diff > 0 ? (
        <Text className="text-center text-xs tabular-nums text-muted-foreground">
          Weight difference: {diff} lbs
        </Text>
      ) : null}

      {matchType === "ranked" && gap > 0 ? (
        <View className="flex-row items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
          <AlertTriangle size={14} color="#f59e0b" />
          <Text className="flex-1 text-xs text-amber-500">
            Weight division gap detected. Heavier athlete{"’"}s ELO will be adjusted.
          </Text>
        </View>
      ) : null}

      <Button size="lg" onPress={onConfirm}>
        Confirm Weights
      </Button>
    </View>
  );
}

function WeightCard({ name, weight }: { name: string; weight: number | null }) {
  return (
    <Card className="flex-1">
      <CardContent className="items-center gap-1 px-3 py-4">
        <Text className="w-full text-center text-sm font-medium text-foreground" numberOfLines={1}>
          {name}
        </Text>
        <Text className="text-3xl font-bold tabular-nums text-foreground">
          {weight != null ? `${weight}` : "N/A"}
        </Text>
        {weight != null ? <Text className="text-xs text-muted-foreground">lbs</Text> : null}
      </CardContent>
    </Card>
  );
}

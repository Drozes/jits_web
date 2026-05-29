import { Pressable, Text, View } from "react-native";
import { AlertTriangle } from "lucide-react-native";
import { EloTile, Plate } from "@/components/ui/elo-system";
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
 * Step 2: both athletes confirm scale weights before the ready check.
 * Mirrors `apps/web/.../steps/weight-verify-step.tsx`, including the
 * weight-division-gap warning for ranked matches.
 *
 * ELO design system: hero meta + h2-ish heading, two EloTile values for
 * each athlete's weight, hairline warning plate when divisions differ,
 * and a Signal Red confirm cta.
 */
export function WeightStep(props: WeightStepProps) {
  const tokens = useThemedTokens();
  const {
    currentDisplayName,
    currentWeight,
    opponentDisplayName,
    opponentWeight,
    matchType,
    onConfirm,
  } = props;
  const both = currentWeight != null && opponentWeight != null;
  const diff = both ? Math.abs(currentWeight! - opponentWeight!) : 0;
  const gap = both ? divisionGap(currentWeight!, opponentWeight!) : 0;

  return (
    <View className="gap-5 px-1 py-4">
      <View className="items-center gap-2">
        <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl">
          Verify Weights
        </Text>
        <Text className="font-display text-[28px] text-ink text-center tracking-mark">
          ON THE SCALE
        </Text>
      </View>

      <View className="flex-row gap-3 justify-center">
        <WeightTile name={currentDisplayName} weight={currentWeight} />
        <WeightTile name={opponentDisplayName} weight={opponentWeight} />
      </View>

      {both && matchType === "ranked" && diff > 0 ? (
        <Text className="text-center font-mono text-[12px] text-ink-3 tracking-caps-l uppercase">
          Weight difference: {diff} lbs
        </Text>
      ) : null}

      {matchType === "ranked" && gap > 0 ? (
        <Plate variant="loss" className="flex-row items-center gap-2">
          <AlertTriangle size={16} color={tokens.stateNegative} />
          <Text className="flex-1 font-body text-[12px] text-ink-2">
            Weight division gap detected. Heavier athlete{"’"}s ELO will be adjusted.
          </Text>
        </Plate>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={onConfirm}
        className="bg-cta items-center justify-center py-3 rounded-sm active:bg-cta-hover"
      >
        <Text className="font-heading text-[13px] text-ink-on-cta uppercase tracking-caps">
          Confirm Weights
        </Text>
      </Pressable>
    </View>
  );
}

function WeightTile({ name, weight }: { name: string; weight: number | null }) {
  return (
    <View className="flex-1 items-center gap-2">
      <Text
        className="font-heading text-[11px] text-ink-2 uppercase tracking-caps text-center"
        numberOfLines={1}
      >
        {name}
      </Text>
      <EloTile
        label="lbs"
        value={weight != null ? weight : "N/A"}
        size="medium"
      />
    </View>
  );
}

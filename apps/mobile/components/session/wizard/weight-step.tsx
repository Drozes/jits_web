import * as React from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { cn } from "@/lib/cn";
import {
  isValidWeight,
  parseWeight,
  MIN_WEIGHT_LBS,
  MAX_WEIGHT_LBS,
} from "@/lib/session/validate-weight";

interface WeightStepProps {
  athleteWeight: number | null;
  onNext: (confirmedWeight: number) => void;
}

/**
 * Native port of `apps/web/app/(app)/session/[id]/join/steps/weight-confirm-step.tsx`.
 *
 * ELO design system: wireframe C3 (lines 990-1009). Centered hero numeric
 * field (a large mono input plus the "lbs" unit beside it) wrapped in an
 * EloTile-style plate with a small caps "Weight Today" label. Primary
 * "Confirm Weight" cta below.
 *
 * Pre-fills with the athlete's stored `current_weight` if present and
 * validates the input is a positive number within 50-400 lbs (matching the
 * profile-setup wizard's range).
 */
export function WeightStep({ athleteWeight, onNext }: WeightStepProps) {
  const tokens = useThemedTokens();
  const [weight, setWeight] = React.useState(athleteWeight?.toString() ?? "");
  const attempted = weight.length > 0;
  const valid = !attempted || isValidWeight(weight);
  const canSubmit = isValidWeight(weight);

  function handleSubmit() {
    const parsed = parseWeight(weight);
    if (parsed != null && isValidWeight(weight)) {
      onNext(parsed);
    }
  }

  return (
    <View className="gap-6 items-center">
      <Text className="font-body text-[14px] text-ink-2 text-center leading-[22px] px-4">
        Confirm your weight for today{"’"}s session.
      </Text>

      <View className="bg-surface-3 border border-hairline rounded-md w-full px-5 py-6 items-center">
        <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl">
          Weight Today
        </Text>
        <View className="flex-row items-baseline justify-center gap-2 mt-2">
          <TextInput
            value={weight}
            onChangeText={setWeight}
            placeholder="-"
            placeholderTextColor={tokens.textTertiary}
            keyboardType="decimal-pad"
            maxLength={5}
            autoFocus
            accessibilityLabel="Weight in pounds"
            className="font-mono-bold text-ink"
            style={{
              fontSize: 64,
              lineHeight: 77,
              letterSpacing: -2.5,
              width: 160,
              textAlign: "center",
              padding: 0,
            }}
          />
          <Text className="font-mono text-[20px] text-ink-3">lbs</Text>
        </View>
      </View>

      {!valid && (
        <Text className="font-mono text-[11px] text-negative uppercase tracking-caps-l text-center">
          Enter a weight between {MIN_WEIGHT_LBS} and {MAX_WEIGHT_LBS} lbs.
        </Text>
      )}

      <Pressable
        accessibilityRole="button"
        onPress={handleSubmit}
        disabled={!canSubmit}
        className={cn(
          "bg-cta items-center justify-center py-3 rounded-sm self-stretch",
          !canSubmit && "opacity-50",
          "active:bg-cta-hover",
        )}
      >
        <Text className="font-heading text-[13px] text-ink-on-cta uppercase tracking-caps">
          Confirm Weight
        </Text>
      </Pressable>
    </View>
  );
}

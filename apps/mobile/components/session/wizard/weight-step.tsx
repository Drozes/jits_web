import * as React from "react";
import { Text, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
 * Pre-fills with the athlete's stored `current_weight` if present and
 * validates the input is a positive number within 50-400 lbs (matching
 * the profile-setup wizard's range).
 */
export function WeightStep({ athleteWeight, onNext }: WeightStepProps) {
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
    <View className="gap-4 py-2">
      <Text className="text-center text-base font-heading text-foreground">
        Confirm your weight (lbs)
      </Text>
      <Text className="text-center text-sm text-muted-foreground">
        Your weight is used for fair matchmaking.
      </Text>

      <View className="gap-2">
        <Label nativeID="weightLabel">Weight (lbs)</Label>
        <Input
          accessibilityLabelledBy="weightLabel"
          placeholder="e.g. 155"
          value={weight}
          onChangeText={setWeight}
          keyboardType="decimal-pad"
          maxLength={5}
          autoFocus
        />
        {!valid && (
          <Text className="text-xs text-destructive">
            Enter a weight between {MIN_WEIGHT_LBS} and {MAX_WEIGHT_LBS} lbs.
          </Text>
        )}
      </View>

      <Button onPress={handleSubmit} disabled={!canSubmit}>
        Confirm
      </Button>
    </View>
  );
}

import * as React from "react";
import { Text, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { GymOption } from "@/lib/profile-setup/use-setup-data";
import { isTrainingComplete, isValidWeight } from "@/lib/profile-setup/validation";
import type { WizardValues } from "./types";

interface TrainingStepProps {
  values: WizardValues;
  onChange: (patch: Partial<WizardValues>) => void;
  onNext: () => void;
  gyms: GymOption[];
}

/**
 * Native port of `apps/web/app/profile/setup/steps/training-step.tsx`,
 * extended with a free-agent toggle (per A3 spec). When `freeAgent` is on
 * the gym picker is hidden and `gymId` is cleared so the submit payload
 * sends `primary_gym_id: null` + `free_agent: true`.
 */
export function TrainingStep({ values, onChange, onNext, gyms }: TrainingStepProps) {
  const weightAttempted = values.weight.length > 0;
  const weightValid = !weightAttempted || isValidWeight(values.weight);
  const canContinue = isTrainingComplete(values);

  return (
    <View className="gap-4">
      <View className="gap-2">
        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <Label>Free agent</Label>
            <Text className="text-xs text-muted-foreground">
              Don't have a primary gym yet? You can update this later.
            </Text>
          </View>
          <Switch
            value={values.freeAgent}
            onValueChange={(next) =>
              onChange({ freeAgent: next, gymId: next ? "" : values.gymId })
            }
          />
        </View>
      </View>

      {!values.freeAgent && (
        <View className="gap-2">
          <Label>Gym</Label>
          <Select
            value={values.gymId || undefined}
            onValueChange={(v) => onChange({ gymId: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select your gym" />
            </SelectTrigger>
            <SelectContent>
              {gyms.map((gym) => (
                <SelectItem key={gym.id} value={gym.id}>
                  {gym.city ? `${gym.name} (${gym.city})` : gym.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Text className="text-xs text-muted-foreground">
            Required to activate your profile and appear to other athletes.
          </Text>
        </View>
      )}

      <View className="gap-2">
        <Label nativeID="weightLabel">Weight (lbs)</Label>
        <Input
          accessibilityLabelledBy="weightLabel"
          placeholder="e.g. 155"
          value={values.weight}
          onChangeText={(text) => onChange({ weight: text })}
          keyboardType="decimal-pad"
          maxLength={5}
        />
        {!weightValid && (
          <Text className="text-xs text-destructive">
            Enter a weight between 50 and 400 lbs.
          </Text>
        )}
        <Text className="text-xs text-muted-foreground">
          Used for weight class matching.
        </Text>
      </View>

      <Button onPress={onNext} disabled={!canContinue}>
        Continue
      </Button>
    </View>
  );
}

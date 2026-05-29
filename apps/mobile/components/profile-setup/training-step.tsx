import { Text, View } from "react-native";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plate } from "@/components/ui/elo-system";
import { CtaButton } from "@/components/auth/auth-buttons";
import type { GymOption } from "@/lib/profile-setup/use-setup-data";
import { isTrainingComplete, isValidWeight } from "@/lib/profile-setup/validation";
import type { WizardValues } from "./types";
import { EloField, EloTextInput } from "./elo-form-field";

interface TrainingStepProps {
  values: WizardValues;
  onChange: (patch: Partial<WizardValues>) => void;
  onNext: () => void;
  gyms: GymOption[];
}

/**
 * ELO-styled training step. Extends web's training step with a free-agent
 * toggle (per A3 spec). When `freeAgent` is on the gym picker is hidden and
 * `gymId` is cleared so the submit payload sends `primary_gym_id: null`.
 */
export function TrainingStep({ values, onChange, onNext, gyms }: TrainingStepProps) {
  const weightAttempted = values.weight.length > 0;
  const weightValid = !weightAttempted || isValidWeight(values.weight);
  const canContinue = isTrainingComplete(values);

  return (
    <Plate className="gap-5">
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1">
          <Text className="font-heading text-[10px] text-ink-3 uppercase tracking-caps-xl">
            Free Agent
          </Text>
          <Text className="font-body text-[12px] text-ink-3 mt-1">
            No primary gym yet? You can update this later.
          </Text>
        </View>
        <Switch
          value={values.freeAgent}
          onValueChange={(next) =>
            onChange({ freeAgent: next, gymId: next ? "" : values.gymId })
          }
        />
      </View>

      {!values.freeAgent && (
        <EloField
          label="Home Gym"
          helper="Required to activate your profile and appear to other athletes."
        >
          <Select
            value={values.gymId || undefined}
            onValueChange={(v) => {
              const gym = gyms.find((g) => g.id === v);
              const patch: Partial<WizardValues> = { gymId: v };
              if (gym?.city && !values.city) patch.city = gym.city;
              onChange(patch);
            }}
          >
            <SelectTrigger className="bg-surface-3 border-hairline-strong rounded-xs h-12 px-4">
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
        </EloField>
      )}

      <EloField
        label="Weight (lbs)"
        helper="Used for weight class matching."
        error={!weightValid ? "Enter a weight between 50 and 400 lbs." : null}
      >
        <EloTextInput
          placeholder="e.g. 155"
          value={values.weight}
          onChangeText={(text) => onChange({ weight: text })}
          keyboardType="decimal-pad"
          maxLength={5}
          hasError={!weightValid}
        />
      </EloField>

      <CtaButton label="Continue" onPress={onNext} disabled={!canContinue} />
    </Plate>
  );
}

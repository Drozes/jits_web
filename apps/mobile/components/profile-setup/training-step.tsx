import * as React from "react";
import { NativeSelect } from "@/components/ui/native-select";
import { Plate } from "@/components/ui/elo-system";
import { CtaButton } from "@/components/auth/auth-buttons";
import type { GymOption } from "@/lib/profile-setup/use-setup-data";
import { isTrainingComplete, isValidWeight } from "@/lib/profile-setup/validation";
import { FREE_AGENT_OPTION, type WizardValues } from "./types";
import { EloField, EloTextInput } from "./elo-form-field";
import { CityAutocomplete } from "./city-autocomplete";

interface TrainingStepProps {
  values: WizardValues;
  onChange: (patch: Partial<WizardValues>) => void;
  onSubmit: (values: WizardValues) => void;
  loading: boolean;
  isEditing: boolean;
  gyms: GymOption[];
  cities: string[];
}

/**
 * ELO-styled training step, now the final submitting step of the wizard.
 * Collects weight, gym (with free-agent folded in as the first picker option),
 * and the required city. Free-agent status is derived from the gym picker:
 * selecting "Free agent (no gym)" sets `gymId` to the FREE_AGENT_OPTION
 * sentinel; selecting a real gym auto-fills city if empty.
 */
export function TrainingStep({
  values,
  onChange,
  onSubmit,
  loading,
  isEditing,
  gyms,
  cities,
}: TrainingStepProps) {
  const weightAttempted = values.weight.length > 0;
  const weightValid = !weightAttempted || isValidWeight(values.weight);
  const canSubmit = isTrainingComplete(values) && !loading;

  const gymOptions = React.useMemo(
    () => [
      { label: "Free agent (no gym)", value: FREE_AGENT_OPTION },
      ...gyms.map((g) => ({
        label: g.city ? `${g.name} (${g.city})` : g.name,
        value: g.id,
      })),
    ],
    [gyms],
  );

  const onGymChange = (next: string) => {
    if (next === FREE_AGENT_OPTION) {
      onChange({ gymId: FREE_AGENT_OPTION });
      return;
    }
    const gym = gyms.find((g) => g.id === next);
    const patch: Partial<WizardValues> = { gymId: next };
    if (gym?.city && !values.city) patch.city = gym.city;
    onChange(patch);
  };

  return (
    <Plate className="gap-5">
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

      <EloField
        label="Home Gym"
        helper="Required to activate your profile and appear to other athletes."
      >
        <NativeSelect
          value={values.gymId}
          onValueChange={onGymChange}
          options={gymOptions}
          placeholder="Select your gym"
        />
      </EloField>

      <EloField
        label="City"
        helper="Required to activate your profile. Helps you find local sessions and gyms."
      >
        <CityAutocomplete
          value={values.city}
          onChange={(v) => onChange({ city: v })}
          suggestions={cities}
        />
      </EloField>

      <CtaButton
        label={loading ? "Saving..." : isEditing ? "Save Changes" : "Get Started"}
        onPress={() => onSubmit(values)}
        disabled={!canSubmit}
      />
    </Plate>
  );
}

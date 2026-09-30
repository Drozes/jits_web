import * as React from "react";
import { NativeSelect } from "@/components/ui/native-select";
import { Plate } from "@/components/ui/elo-system";
import { CtaButton } from "@/components/auth/auth-buttons";
import type { GymOption } from "@/lib/profile-setup/use-setup-data";
import { formatInstagramHandle } from "@jits/shared/utils";
import type { GymInstagramField } from "@/lib/profile-setup/gym-instagram";
import { isTrainingComplete } from "@/lib/profile-setup/validation";
import { FREE_AGENT_OPTION, type WizardValues } from "./types";
import { EloField } from "./elo-form-field";
import { InstagramField } from "./instagram-field";
import { CityAutocomplete } from "./city-autocomplete";

interface TrainingStepProps {
  values: WizardValues;
  onChange: (patch: Partial<WizardValues>) => void;
  onSubmit: (values: WizardValues) => void;
  loading: boolean;
  isEditing: boolean;
  gyms: GymOption[];
  cities: string[];
  gymInstagram: GymInstagramField;
}

/**
 * ELO-styled training step, the final submitting step of the wizard.
 * Collects gym (with free-agent folded in as the first picker option), the
 * optional gym Instagram (hidden for free agents; read-only when the gym
 * already has one and the athlete does not manage it), and the required city.
 * Weight moved to the identity step (jits-02vo.5). Free-agent status is derived from the gym picker:
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
  gymInstagram,
}: TrainingStepProps) {
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
      onChange({ gymId: FREE_AGENT_OPTION, gymInstagram: "" });
      return;
    }
    const gym = gyms.find((g) => g.id === next);
    // Each gym brings its own stored handle; a typed one never carries over.
    const patch: Partial<WizardValues> = {
      gymId: next,
      gymInstagram: formatInstagramHandle(gym?.instagram_handle),
    };
    if (gym?.city && !values.city) patch.city = gym.city;
    onChange(patch);
  };

  return (
    <Plate className="gap-5">
      <EloField
        label="Home Gym"
        helper="Required to activate your profile and appear to other athletes."
      >
        <NativeSelect
          value={values.gymId}
          onValueChange={onGymChange}
          options={gymOptions}
          placeholder="Select your gym"
          title="Home Gym"
          searchPlaceholder="Search gyms"
        />
      </EloField>

      {gymInstagram.visible ? (
        <InstagramField
          label="Gym Instagram"
          placeholder="@gymhandle"
          helper={
            gymInstagram.readOnly
              ? "Already set for your gym. Only a gym manager can change it."
              : "Optional. Tag your gym on shared highlights."
          }
          value={values.gymInstagram}
          onChange={(text) => onChange({ gymInstagram: text })}
          readOnly={gymInstagram.readOnly}
          testID="setup-gym-instagram"
        />
      ) : null}

      <EloField
        label="City"
        helper="Required to activate your profile. The city you train in."
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

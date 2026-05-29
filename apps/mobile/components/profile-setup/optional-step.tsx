import { Plate } from "@/components/ui/elo-system";
import { CtaButton, TertiaryButton } from "@/components/auth/auth-buttons";
import type { WizardValues } from "./types";
import { EloField, EloTextInput } from "./elo-form-field";

interface OptionalStepProps {
  values: WizardValues;
  onChange: (patch: Partial<WizardValues>) => void;
  onSubmit: (skipOptional: boolean) => void;
  loading: boolean;
  isEditing: boolean;
}

/**
 * ELO-styled optional details step. Web includes a theme picker; mobile does
 * not yet have a theme switcher (system-only via NativeWind), so this step
 * collects `city` only.
 */
export function OptionalStep({
  values,
  onChange,
  onSubmit,
  loading,
  isEditing,
}: OptionalStepProps) {
  return (
    <Plate className="gap-5">
      <EloField
        label="City"
        helper="Helps you find local sessions and gyms."
      >
        <EloTextInput
          placeholder="e.g. Austin, TX"
          value={values.city}
          onChangeText={(text) => onChange({ city: text })}
          maxLength={100}
        />
      </EloField>

      <CtaButton
        label={loading ? "Saving..." : isEditing ? "Save Changes" : "Get Started"}
        onPress={() => onSubmit(false)}
        disabled={loading}
      />
      <TertiaryButton
        label="Skip for now"
        onPress={() => onSubmit(true)}
        disabled={loading}
      />
    </Plate>
  );
}

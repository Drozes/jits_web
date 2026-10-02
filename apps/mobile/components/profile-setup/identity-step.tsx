import { Text, View } from "react-native";
import { StatePressable } from "@/components/ui/state-pressable";
import { Plate } from "@/components/ui/elo-system";
import { Button } from "@/components/ui/elo-system/button";
import { SelectCheck, selectionSurface } from "@/components/ui/elo-system/selection";
import { isIdentityComplete, isValidWeight } from "@/lib/profile-setup/validation";
import { cn } from "@/lib/cn";
import type { WizardValues } from "./types";
import { DateOfBirthPicker } from "./date-of-birth-picker";
import { EloField, EloTextInput } from "./elo-form-field";
import { InstagramField } from "./instagram-field";

interface IdentityStepProps {
  values: WizardValues;
  onChange: (patch: Partial<WizardValues>) => void;
  onNext: () => void;
}

export function IdentityStep({ values, onChange, onNext }: IdentityStepProps) {
  const canContinue = isIdentityComplete(values);
  const weightValid = values.weight.length === 0 || isValidWeight(values.weight);

  return (
    <Plate className="gap-5">
      <EloField
        label="First Name"
        helper="Your name as it will appear to other athletes."
      >
        <EloTextInput
          placeholder="First name"
          value={values.firstName}
          onChangeText={(text) => onChange({ firstName: text })}
          maxLength={50}
          autoFocus
        />
      </EloField>

      <EloField label="Last Name">
        <EloTextInput
          placeholder="Last name"
          value={values.lastName}
          onChangeText={(text) => onChange({ lastName: text })}
          maxLength={50}
        />
      </EloField>

      <EloField label="Gender" helper="Used for competition brackets.">
        <View className="flex-row gap-2">
          <GenderChip
            label="Male"
            active={values.gender === "M"}
            onPress={() => onChange({ gender: "M" })}
          />
          <GenderChip
            label="Female"
            active={values.gender === "F"}
            onPress={() => onChange({ gender: "F" })}
          />
        </View>
      </EloField>

      <DateOfBirthPicker
        value={values.dateOfBirth}
        onChange={(dateOfBirth) => onChange({ dateOfBirth })}
      />

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

      <InstagramField
        label="Instagram"
        placeholder="@yourhandle"
        helper="Optional."
        value={values.instagram}
        onChange={(instagram) => onChange({ instagram })}
        testID="setup-instagram"
      />

      <Button label="Continue" onPress={onNext} disabled={!canContinue} />
    </Plate>
  );
}

function GenderChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <StatePressable
      dim
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className={cn(
        "flex-1 flex-row items-center justify-center gap-1.5 rounded-xs border px-4 py-3",
        selectionSurface(active),
      )}
    >
      {active ? <SelectCheck size={12} /> : null}
      <Text
        className={cn(
          "font-heading text-[12px] uppercase tracking-caps-l",
          active ? "text-ink" : "text-ink-2",
        )}
      >
        {label}
      </Text>
    </StatePressable>
  );
}

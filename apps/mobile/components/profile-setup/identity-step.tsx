import { Pressable, Text, View } from "react-native";
import { Plate } from "@/components/ui/elo-system";
import { CtaButton } from "@/components/auth/auth-buttons";
import { isIdentityComplete } from "@/lib/profile-setup/validation";
import { cn } from "@/lib/cn";
import type { WizardValues } from "./types";
import { DateOfBirthPicker } from "./date-of-birth-picker";
import { EloField, EloTextInput } from "./elo-form-field";

interface IdentityStepProps {
  values: WizardValues;
  onChange: (patch: Partial<WizardValues>) => void;
  onNext: () => void;
}

export function IdentityStep({ values, onChange, onNext }: IdentityStepProps) {
  const canContinue = isIdentityComplete(values);

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

      <CtaButton label="Continue" onPress={onNext} disabled={!canContinue} />
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
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className={cn(
        "flex-1 items-center justify-center rounded-xs border px-4 py-3",
        active
          ? "bg-cta border-cta"
          : "bg-surface-3 border-hairline-strong",
      )}
    >
      <Text
        className={cn(
          "font-heading text-[12px] uppercase tracking-caps-l",
          active ? "text-ink-on-cta" : "text-ink",
        )}
      >
        {label}
      </Text>
    </Pressable>
  );
}

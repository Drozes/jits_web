/**
 * `dob_required` on the claim screen (jr_be spec 016, contract 7): an account
 * from before date of birth was required. Ask for it with the profile-setup
 * picker, then the runner saves it and claims again with the same invite.
 */
import * as React from "react";
import { Text } from "react-native";
import { checkDateOfBirth, DOB_INVALID_COPY, DOB_REQUIRED_TITLE } from "@jits/shared/utils";
import { CtaButton, SecondaryButton } from "@/components/auth/auth-buttons";
import { DateOfBirthPicker } from "@/components/profile-setup/date-of-birth-picker";
import { Plate } from "@/components/ui/elo-system";

interface ClaimDobStepProps {
  message: string;
  /** Inline error from the last save (null when none). */
  error: string | null;
  onSubmit: (dateOfBirth: string) => void;
  onNotNow: () => void;
}

export function ClaimDobStep({ message, error, onSubmit, onNotNow }: ClaimDobStepProps) {
  const [value, setValue] = React.useState("");
  const [localError, setLocalError] = React.useState<string | null>(null);
  const shown = localError ?? error;

  const submit = () => {
    if (checkDateOfBirth(value) === "invalid") {
      setLocalError(DOB_INVALID_COPY);
      return;
    }
    setLocalError(null);
    onSubmit(value);
  };

  return (
    <Plate className="gap-4" testID="claim-dob">
      <Text className="font-heading text-[18px] text-ink uppercase">{DOB_REQUIRED_TITLE}</Text>
      <Text className="font-body text-[14px] text-ink leading-6">{message}</Text>
      <DateOfBirthPicker
        value={value}
        onChange={(dob) => {
          setValue(dob);
          setLocalError(null);
        }}
      />
      {shown ? (
        <Text testID="claim-dob-error" accessibilityRole="alert" className="font-body text-[14px] text-cta">
          {shown}
        </Text>
      ) : null}
      <CtaButton label="Save and accept" testID="claim-dob-save" disabled={!value} onPress={submit} />
      <SecondaryButton label="Not now" onPress={onNotNow} />
    </Plate>
  );
}

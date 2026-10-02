/**
 * `dob_required` on the claim screen (jr_be spec 016, contract 7): an account
 * from before date of birth was required. Ask for it with the profile-setup
 * picker, then the runner saves it and claims again with the same invite.
 */
import * as React from "react";
import { Text } from "react-native";
import { checkDateOfBirth, DOB_INVALID_COPY, DOB_REQUIRED_TITLE, UNDERAGE_COPY } from "@jits/shared/utils";
import { DateOfBirthPicker } from "@/components/profile-setup/date-of-birth-picker";
import { Plate } from "@/components/ui/elo-system";
import { Button } from "@/components/ui/elo-system/button";

interface ClaimDobStepProps {
  message: string;
  /** Inline error from the last save (null when none). */
  error: string | null;
  /**
   * The save is in flight. The step stays mounted while it saves, so the
   * picked date survives a failed save and Save works again straight away.
   */
  busy?: boolean;
  onSubmit: (dateOfBirth: string) => void;
  onNotNow: () => void;
}

export function ClaimDobStep({ message, error, busy = false, onSubmit, onNotNow }: ClaimDobStepProps) {
  const [value, setValue] = React.useState("");
  const [localError, setLocalError] = React.useState<string | null>(null);
  const shown = localError ?? error;

  const submit = () => {
    if (busy) return;
    const check = checkDateOfBirth(value);
    if (check !== "ok") {
      // The picker cannot select under 16; this guards the UTC day edge.
      setLocalError(check === "underage" ? UNDERAGE_COPY : DOB_INVALID_COPY);
      return;
    }
    setLocalError(null);
    onSubmit(value);
  };

  return (
    <Plate className="gap-4" testID="claim-dob">
      <Text className="font-heading text-title text-ink uppercase tracking-caps">{DOB_REQUIRED_TITLE}</Text>
      <Text className="font-body text-callout text-ink leading-6">{message}</Text>
      <DateOfBirthPicker
        value={value}
        onChange={(dob) => {
          setValue(dob);
          setLocalError(null);
        }}
      />
      {shown && !busy ? (
        <Text testID="claim-dob-error" accessibilityRole="alert" className="font-body text-callout text-negative">
          {shown}
        </Text>
      ) : null}
      <Button
        label={busy ? "Saving..." : "Save and accept"}
        testID="claim-dob-save"
        disabled={!value || busy}
        onPress={submit}
      />
      <Button variant="secondary" label="Not now" disabled={busy} onPress={onNotNow} />
    </Plate>
  );
}

import { isValidInstagramInput } from "@jits/shared/utils";
import { INSTAGRAM_HANDLE_ERROR } from "@/lib/profile-setup/validation";
import { EloField, EloTextInput } from "./elo-form-field";

interface InstagramFieldProps {
  label: string;
  placeholder: string;
  helper: string;
  value: string;
  onChange: (text: string) => void;
  /** Shown but not editable (a gym handle only its managers can change). */
  readOnly?: boolean;
  testID?: string;
}

/**
 * Optional Instagram handle input for the setup wizard (athlete on "Who Are
 * You", gym on "Where You Train"). Blank is valid; anything else must pass the
 * server's normalize-then-CHECK rule, with the error shown inline.
 */
export function InstagramField({
  label,
  placeholder,
  helper,
  value,
  onChange,
  readOnly = false,
  testID,
}: InstagramFieldProps) {
  const valid = readOnly || isValidInstagramInput(value);
  return (
    <EloField label={label} helper={helper} error={valid ? null : INSTAGRAM_HANDLE_ERROR}>
      <EloTextInput
        testID={testID}
        accessibilityLabel={label}
        placeholder={placeholder}
        value={value}
        onChangeText={onChange}
        editable={!readOnly}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        keyboardType="default"
        maxLength={40}
        hasError={!valid}
        className={readOnly ? "text-ink-3" : undefined}
      />
    </EloField>
  );
}

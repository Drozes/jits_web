import * as React from "react";
import { Text, View, type TextInputProps } from "react-native";
import { Input, Label } from "@/components/ui";

type AuthFormFieldProps = TextInputProps & {
  label: string;
  error?: string | null;
  showError?: boolean;
};

/**
 * Labelled text input with inline validation message used by the auth
 * screens (login / signup / forgot-password). Keeps the screen files
 * focused on flow logic instead of boilerplate field markup.
 */
export function AuthFormField({
  label,
  error,
  showError,
  ...inputProps
}: AuthFormFieldProps) {
  const labelId = React.useId();
  return (
    <View className="gap-1.5">
      <Label nativeID={labelId}>{label}</Label>
      <Input accessibilityLabelledBy={labelId} className={showError && error ? "border-destructive" : undefined} {...inputProps} />
      {showError && error ? (
        <Text className="text-xs text-destructive">{error}</Text>
      ) : null}
    </View>
  );
}

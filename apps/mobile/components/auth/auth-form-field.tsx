import * as React from "react";
import { Pressable, Text, View, type TextInputProps } from "react-native";
import { Eye, EyeOff } from "lucide-react-native";
import { Input, Label } from "@/components/ui";
import { useThemedTokens } from "@/lib/theme/use-theme";

type AuthFormFieldProps = TextInputProps & {
  label: string;
  error?: string | null;
  showError?: boolean;
};

/**
 * Labelled text input with inline validation message used by the auth
 * screens (login / signup / forgot-password). Keeps the screen files
 * focused on flow logic instead of boilerplate field markup.
 *
 * When `secureTextEntry` is passed, renders a show/hide toggle button
 * inside the input row.
 */
export function AuthFormField({
  label,
  error,
  showError,
  secureTextEntry,
  ...inputProps
}: AuthFormFieldProps) {
  const labelId = React.useId();
  const tokens = useThemedTokens();
  const [hidden, setHidden] = React.useState(true);
  const isPassword = secureTextEntry !== undefined;

  return (
    <View className="gap-1.5">
      <Label nativeID={labelId}>{label}</Label>
      <View className="relative justify-center">
        <Input
          accessibilityLabelledBy={labelId}
          className={showError && error ? "border-destructive pr-10" : isPassword ? "pr-10" : undefined}
          secureTextEntry={isPassword ? hidden : undefined}
          {...inputProps}
        />
        {isPassword ? (
          <Pressable
            onPress={() => setHidden((h) => !h)}
            hitSlop={8}
            className="absolute right-3"
            accessibilityLabel={hidden ? "Show password" : "Hide password"}
            accessibilityRole="button"
          >
            {hidden ? (
              <Eye size={18} color={tokens.mutedForeground} />
            ) : (
              <EyeOff size={18} color={tokens.mutedForeground} />
            )}
          </Pressable>
        ) : null}
      </View>
      {showError && error ? (
        <Text className="text-xs text-destructive">{error}</Text>
      ) : null}
    </View>
  );
}

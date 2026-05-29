import * as React from "react";
import {
  Pressable,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { Eye, EyeOff } from "lucide-react-native";
import { cn } from "@/lib/cn";
import { useThemedTokens } from "@/lib/theme/use-theme";

type AuthFormFieldProps = TextInputProps & {
  label: string;
  error?: string | null;
  showError?: boolean;
};

/**
 * Labelled text input matching the ELO design system field pattern.
 * Used by the auth screens (login / signup / forgot-password).
 *
 * Visual targets (wireframe A2 .field/.field-label/.field-input):
 *   - Label: font-heading bold, uppercase, tracking-caps-xl, text-ink-3
 *   - Input: bg-surface-3, border-hairline-strong, rounded-xs, focus = border-cta
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
  const [focused, setFocused] = React.useState(false);
  const isPassword = secureTextEntry !== undefined;
  const hasError = !!showError && !!error;

  return (
    <View className="gap-2">
      <Text
        nativeID={labelId}
        className="font-heading text-[10px] text-ink-3 uppercase tracking-caps-xl"
      >
        {label}
      </Text>
      <View className="relative justify-center">
        <TextInput
          accessibilityLabelledBy={labelId}
          placeholderTextColor={tokens.textTertiary}
          {...inputProps}
          secureTextEntry={isPassword ? hidden : undefined}
          onFocus={(e) => {
            setFocused(true);
            inputProps.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            inputProps.onBlur?.(e);
          }}
          className={cn(
            "bg-surface-3 border rounded-xs px-4 py-3 text-[14px] font-body text-ink",
            hasError
              ? "border-negative"
              : focused
                ? "border-cta"
                : "border-hairline-strong",
            isPassword ? "pr-11" : undefined,
          )}
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
              <Eye size={18} color={tokens.textTertiary} />
            ) : (
              <EyeOff size={18} color={tokens.textTertiary} />
            )}
          </Pressable>
        ) : null}
      </View>
      {hasError ? (
        <Text className="font-body text-[12px] text-negative">{error}</Text>
      ) : null}
    </View>
  );
}

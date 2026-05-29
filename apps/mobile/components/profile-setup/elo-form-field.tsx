import * as React from "react";
import { Text, TextInput, View, type TextInputProps } from "react-native";
import { cn } from "@/lib/cn";
import { useThemedTokens } from "@/lib/theme/use-theme";

/**
 * Reusable ELO-styled form field used by the profile setup wizard.
 * Combines a heading-caps label, optional helper text, and a slot for
 * inputs / selects. Used to keep each step file lean and consistent
 * with the wireframe A2 form layout.
 */
interface EloFieldProps {
  label: string;
  helper?: string;
  error?: string | null;
  children: React.ReactNode;
}

export function EloField({ label, helper, error, children }: EloFieldProps) {
  return (
    <View className="gap-2">
      <Text className="font-heading text-[10px] text-ink-3 uppercase tracking-caps-xl">
        {label}
      </Text>
      {children}
      {error ? (
        <Text className="font-body text-[12px] text-negative">{error}</Text>
      ) : helper ? (
        <Text className="font-body text-[12px] text-ink-3">{helper}</Text>
      ) : null}
    </View>
  );
}

/**
 * ELO-styled text input. Mirrors the .field-input wireframe spec:
 * bg-surface-3, border hairline-strong, rounded-xs, focus = border-cta.
 */
type EloTextInputProps = TextInputProps & {
  hasError?: boolean;
};

export const EloTextInput = React.forwardRef<TextInput, EloTextInputProps>(
  ({ className, hasError, onFocus, onBlur, ...rest }, ref) => {
    const tokens = useThemedTokens();
    const [focused, setFocused] = React.useState(false);
    return (
      <TextInput
        ref={ref}
        placeholderTextColor={tokens.textTertiary}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        className={cn(
          "bg-surface-3 border rounded-xs px-4 py-3 text-[14px] font-body text-ink",
          hasError
            ? "border-negative"
            : focused
              ? "border-cta"
              : "border-hairline-strong",
          className,
        )}
        {...rest}
      />
    );
  },
);
EloTextInput.displayName = "EloTextInput";

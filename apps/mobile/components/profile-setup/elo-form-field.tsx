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
/**
 * The enclosing EloField's visible label. RN does not tie a sibling <Text> to
 * an input, so EloTextInput reads it as its default `accessibilityLabel` and
 * `claim()`s it, which hides the visible label from assistive tech (no double
 * read). Fields holding anything else (selects, pickers) keep the label
 * readable, since those controls do not take the name.
 */
const EloFieldLabelContext = React.createContext<
  { label: string; claim: () => () => void } | undefined
>(undefined);

interface EloFieldProps {
  label: string;
  helper?: string;
  error?: string | null;
  children: React.ReactNode;
}

export function EloField({ label, helper, error, children }: EloFieldProps) {
  const [claims, setClaims] = React.useState(0);
  const field = React.useMemo(
    () => ({
      label,
      claim: () => {
        setClaims((n) => n + 1);
        return () => setClaims((n) => n - 1);
      },
    }),
    [label],
  );
  const labelHidden = claims > 0;
  return (
    <View className="gap-2">
      {/* When an EloTextInput inside carries this label as its accessible
          name, the visible label is hidden from VoiceOver / TalkBack. */}
      <Text
        accessible={labelHidden ? false : undefined}
        importantForAccessibility={labelHidden ? "no-hide-descendants" : undefined}
        accessibilityElementsHidden={labelHidden ? true : undefined}
        className="font-heading text-[10px] text-ink-3 uppercase tracking-caps-xl"
      >
        {label}
      </Text>
      <EloFieldLabelContext.Provider value={field}>{children}</EloFieldLabelContext.Provider>
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
  ({ className, hasError, onFocus, onBlur, accessibilityLabel, ...rest }, ref) => {
    const tokens = useThemedTokens();
    const field = React.useContext(EloFieldLabelContext);
    const usesFieldLabel = field !== undefined && accessibilityLabel === undefined;
    const claim = field?.claim;
    React.useEffect(() => (usesFieldLabel && claim ? claim() : undefined), [usesFieldLabel, claim]);
    const [focused, setFocused] = React.useState(false);
    return (
      <TextInput
        ref={ref}
        accessibilityLabel={accessibilityLabel ?? field?.label}
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

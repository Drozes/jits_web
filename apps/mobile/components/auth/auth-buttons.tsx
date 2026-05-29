import { Pressable, Text } from "react-native";
import { cn } from "@/lib/cn";

/**
 * Auth-screen CTA helpers. Mirror the wireframe .btn-primary / .btn-secondary /
 * .btn-tertiary variants used by A1, A2 and A3. Kept colocated to the auth
 * surface; if reused elsewhere, promote to a shared ELO primitive.
 */

interface CtaButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  className?: string;
}

/** Primary CTA button: bg-cta, ink-on-cta, uppercase heading typography. */
export function CtaButton({ label, onPress, disabled, className }: CtaButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      className={cn(
        "bg-cta items-center justify-center rounded-sm px-5 py-4",
        disabled && "opacity-50",
        className,
      )}
    >
      <Text className="font-heading text-[14px] text-ink-on-cta uppercase tracking-caps-l">
        {label}
      </Text>
    </Pressable>
  );
}

interface SecondaryButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  className?: string;
}

/** Secondary button: bg-surface-3 plate, bordered, ink primary text. */
export function SecondaryButton({
  label,
  onPress,
  disabled,
  className,
}: SecondaryButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      className={cn(
        "bg-surface-3 border border-hairline-strong items-center justify-center rounded-sm px-5 py-4",
        disabled && "opacity-50",
        className,
      )}
    >
      <Text className="font-heading text-[14px] text-ink uppercase tracking-caps-l">
        {label}
      </Text>
    </Pressable>
  );
}

interface TertiaryButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  className?: string;
}

/** Tertiary button: transparent, no border, ink-2 text. */
export function TertiaryButton({
  label,
  onPress,
  disabled,
  className,
}: TertiaryButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      className={cn("items-center justify-center px-5 py-3", className)}
    >
      <Text className="font-heading text-[14px] text-ink-2 uppercase tracking-caps-l">
        {label}
      </Text>
    </Pressable>
  );
}

import * as React from "react";
import { ActivityIndicator, Pressable, Text } from "react-native";
import { cn } from "@/lib/cn";

interface ViewerButtonProps {
  testID: string;
  label: string;
  /** `primary` is the Signal Red fill: at most ONE per surface. */
  variant: "primary" | "outline" | "text";
  onPress: () => void;
  disabled?: boolean;
  /** Spinner before the label (e.g. "Saving…"). */
  busy?: boolean;
}

/** The viewer's buttons: 4 px radius, no shadow, 44 pt touch target. */
export function ViewerButton({ testID, label, variant, onPress, disabled = false, busy = false }: ViewerButtonProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        "flex-row items-center justify-center gap-2 rounded-md px-5",
        variant === "primary" && "bg-cta",
        variant === "outline" && "border border-hairline-strong",
        variant === "text" && "self-center",
        disabled ? "opacity-60" : "active:opacity-70",
      )}
      style={{ minHeight: 44 }}
    >
      {busy ? <ActivityIndicator testID={`${testID}-spinner`} size="small" /> : null}
      <Text
        className={cn(
          "font-heading text-[12px] uppercase tracking-caps",
          variant === "primary" ? "text-ink-on-cta" : variant === "text" ? "text-ink-2" : "text-ink",
        )}
      >
        {label}
      </Text>
    </Pressable>
  );
}

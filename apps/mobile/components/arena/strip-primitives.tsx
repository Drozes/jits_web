/**
 * Arena strip primitives shared by the Mat Board strips and the invite
 * Booked strip, kept dependency-free (no Supabase client) so any strip can
 * import them.
 */
import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { cn } from "@/lib/cn";

/** Largest Dynamic Type scale on the dense Arena strip text (spec 4.2). */
export const MAX_SCALE = 1.3;

/** A small outline action: ROLL, OPEN, CANCEL, CONFIRM. 44pt hit area. */
export function OutlineAction({
  label,
  accessibilityLabel,
  accessibilityHint,
  onPress,
  disabled = false,
  dim = false,
  testID,
}: {
  label: string;
  accessibilityLabel: string;
  /** Tells apart two buttons with the same label (the chip's CONFIRM). */
  accessibilityHint?: string;
  onPress: () => void;
  disabled?: boolean;
  /** Muted ink: an offline ROLL, which goes live rather than challenging. */
  dim?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      hitSlop={{ top: 8, bottom: 8 }}
      className={cn(
        "h-8 justify-center rounded-xs border px-3 active:bg-surface-4",
        dim ? "border-hairline" : "border-hairline-strong",
      )}
      style={disabled ? { opacity: 0.5 } : undefined}
    >
      <Text
        maxFontSizeMultiplier={MAX_SCALE}
        className={cn(
          "font-heading text-[11px] uppercase tracking-caps",
          dim ? "text-ink-3" : "text-ink",
        )}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function StripShell({
  rail,
  testID,
  children,
  edge,
}: {
  /** `red` only for "someone wants you" (a rail, never a CTA). */
  rail: "red" | "neutral";
  testID: string;
  children: React.ReactNode;
  /** Drawn over the strip's bottom edge (the challenge afterglow). */
  edge?: React.ReactNode;
}) {
  return (
    <View
      testID={testID}
      className={cn(
        "min-h-[48px] flex-row items-center gap-3 rounded-xs border border-hairline bg-surface-2 py-1.5 pl-3 pr-2",
        "border-l-[3px]",
        rail === "red" ? "border-l-cta" : "border-l-ink-3",
      )}
    >
      {children}
      {edge}
    </View>
  );
}

/**
 * `Button`: the one brand button of the ELO kit (DESIGN.md "Interaction
 * Patterns", kit card `components/Button`, work package WP3).
 *
 * Every variant sits on `PressableScale`, so every press scales to
 * `PRESS_SCALE` (0.97) and springs back (an opacity dip under Reduce Motion),
 * and a disabled or busy button neither moves nor buzzes.
 *
 * Variants (colors from the active theme's tokens, so light and dark both
 * work):
 * - `primary`: Signal Red fill, on-signal label. At most ONE per surface.
 * - `secondary`: plate fill, strong hairline, ink label; plate-bright pressed.
 * - `ghost`: no fill, ink label (13px); a 0.7 opacity dip while pressed.
 * - `destructive`: an outline in `negative` (never a second red fill); plate
 *   fill while pressed. For irreversible actions (Delete account).
 * - `glass`: over camera or film (fixed on-media colors in both themes): the
 *   live screen's glass fill and white-40 hairline, white label.
 *
 * One disabled style (`DISABLED_OPACITY`, 0.5) for every variant. `busy`
 * swaps the icon for a spinner in the label color and makes the button inert
 * without dimming it.
 *
 * Layout: `className` is for placement only (`w-full`, `flex-1`, margins,
 * `self-center`); the look is the variant, the size is `height` (a minimum:
 * the button grows when a large Dynamic Type label wraps; the label scale is
 * capped at `BUTTON_MAX_FONT_SCALE`).
 */
import * as React from "react";
import { ActivityIndicator, Text, View, type Insets, type StyleProp, type ViewStyle } from "react-native";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { cn } from "@/lib/cn";
import { onMediaTokens } from "@/lib/tokens";
import { PressableScale, type PressHaptic } from "@/components/ui/pressable-scale";
import { PRESSED_OPACITY } from "@/components/ui/state-pressable";
import { SteelSheen } from "@/components/ui/steel-sheen";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive" | "glass";

/** The one disabled style (kit `opacity-disabled`). */
export const DISABLED_OPACITY = 0.5;
/** Corner radius of every button (kit `radius-button`). */
export const BUTTON_RADIUS = 3;
/** Default height (kit `size-button`). */
export const BUTTON_HEIGHT = 56;
/**
 * Dynamic Type cap on the label: it still grows for large accessibility
 * sizes (the button grows with it, `height` is a minimum) but stops short of
 * the largest steps, where a caps label would wrap into several lines.
 */
export const BUTTON_MAX_FONT_SCALE = 1.6;

/** Vertical padding that keeps the default size at `height` and lets a wrapped label grow it. */
export function buttonPaddingVertical(height: number): number {
  return Math.max(0, Math.min(8, (height - 20) / 2));
}

export interface ButtonProps {
  /** The visible label and the default accessible name. */
  label: string;
  /**
   * Drawn inside the label text in place of `label` (for example mono
   * digits); `label` stays the accessible name.
   */
  labelContent?: React.ReactNode;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  /** In flight: a spinner replaces the icon and the button is inert. */
  busy?: boolean;
  testID?: string;
  /** Defaults to `label`. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /**
   * Minimum height, default 56 (real sizes: 28 to 72). The button is exactly
   * this tall at normal text sizes and grows when a large Dynamic Type label
   * wraps.
   */
  height?: number;
  /** Drawn left of the label in the label color. */
  icon?: (color: string) => React.ReactNode;
  /** Right-aligned note inside the button (e.g. "PROCESSING"); the row becomes space-between. */
  trailing?: React.ReactNode;
  /** Placement classes only (`w-full`, `flex-1`, margins, `self-center`). */
  className?: string;
  /** Placement / size overrides, applied last. */
  style?: StyleProp<ViewStyle>;
  hitSlop?: number | Insets;
  /**
   * Commit-action haptic on press (Motion Rule). Omit it where the caller
   * already buzzes for the same event (one haptic per event).
   */
  haptic?: PressHaptic;
  /**
   * Steel sheen while this action waits on THIS user (Motion Rule, Ambient):
   * at most one per screen. Never drawn while disabled or busy.
   */
  sheen?: boolean;
}

interface VariantLook {
  fg: string;
  base: ViewStyle;
  pressed: ViewStyle;
}

/**
 * The variant's semantic classes. The resolved `style` below carries the same
 * colors (so the pressed state can swap them without an `active:` class);
 * the class names keep the variant readable to NativeWind and to the
 * one-Signal-Red-CTA-per-surface guards in the tests (`bg-cta`).
 */
const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "bg-cta",
  secondary: "bg-surface-3 border border-hairline-strong",
  ghost: "",
  destructive: "border border-negative",
  glass: "",
};

function useVariantLook(variant: ButtonVariant): VariantLook {
  const t = useThemedTokens();
  switch (variant) {
    case "primary":
      // signal-red fill, signal-red-lift pressed, on-signal label.
      return { fg: t.textOnAccent, base: { backgroundColor: t.accentCta }, pressed: { backgroundColor: t.accentCtaHover } };
    case "secondary":
      // plate fill, hairline-strong border, plate-bright pressed, ink label.
      return {
        fg: t.textPrimary,
        base: { backgroundColor: t.bgElevated, borderWidth: 1, borderColor: t.borderHairlineStrong },
        pressed: { backgroundColor: t.bgElevatedHover },
      };
    case "destructive":
      // An outline in negative; plate fill pressed.
      return {
        fg: t.stateNegative,
        base: { backgroundColor: "transparent", borderWidth: 1, borderColor: t.stateNegative },
        pressed: { backgroundColor: t.bgElevated },
      };
    case "glass":
      return {
        // The shared on-media glass (the live screen's glass buttons).
        fg: onMediaTokens.white,
        base: { backgroundColor: onMediaTokens.glassStrong, borderWidth: 1, borderColor: onMediaTokens.strong },
        pressed: { backgroundColor: onMediaTokens.glassPressed },
      };
    case "ghost":
    default:
      return { fg: t.textPrimary, base: {}, pressed: { opacity: PRESSED_OPACITY } };
  }
}

export function Button({
  label,
  labelContent,
  onPress,
  variant = "primary",
  disabled = false,
  busy = false,
  testID,
  accessibilityLabel,
  accessibilityHint,
  height = BUTTON_HEIGHT,
  icon,
  trailing,
  className,
  style,
  hitSlop,
  haptic,
  sheen = false,
}: ButtonProps) {
  const look = useVariantLook(variant);
  const inert = disabled || busy;
  const ghost = variant === "ghost";
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inert, busy }}
      onPress={onPress}
      disabled={inert}
      haptic={haptic}
      hitSlop={hitSlop ?? (ghost || height < 44 ? 8 : undefined)}
      className={cn(VARIANT_CLASS[variant], className)}
      style={({ pressed }) => [
        {
          minHeight: height,
          paddingVertical: buttonPaddingVertical(height),
          flexDirection: "row",
          alignItems: "center",
          justifyContent: trailing ? "space-between" : "center",
          gap: 10,
          paddingHorizontal: ghost ? 8 : 16,
          borderRadius: BUTTON_RADIUS,
        },
        look.base,
        pressed && look.pressed,
        // Clips the sheen to the button.
        sheen && { overflow: "hidden" as const },
        disabled && { opacity: DISABLED_OPACITY },
        style,
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 }}>
        {busy ? (
          <ActivityIndicator testID={testID ? `${testID}-spinner` : undefined} size="small" color={look.fg} />
        ) : icon ? (
          icon(look.fg)
        ) : null}
        <Text
          maxFontSizeMultiplier={BUTTON_MAX_FONT_SCALE}
          className="font-heading uppercase"
          style={{ fontSize: ghost ? 13 : 14, letterSpacing: 1.12, color: look.fg, flexShrink: 1, textAlign: "center" }}
        >
          {labelContent ?? label}
        </Text>
      </View>
      {trailing ?? null}
      <SteelSheen active={sheen && !inert} />
    </PressableScale>
  );
}

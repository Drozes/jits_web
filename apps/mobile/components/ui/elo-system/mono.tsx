import * as React from "react";
import { Text, type StyleProp, type TextProps, type TextStyle } from "react-native";
import { cn } from "@/lib/cn";
import {
  TABULAR,
  TRACKING,
  numeralTracking,
  typeStep,
  type TrackingStep,
  type TypeStep,
} from "@/lib/typography";

export type MonoWeight = "regular" | "medium" | "bold";

/** Static class names, so Tailwind's content scan generates each one. */
export const MONO_FAMILY_CLASS: Record<MonoWeight, string> = {
  regular: "font-mono",
  medium: "font-mono-medium",
  bold: "font-mono-bold",
};

export interface MonoProps extends Omit<TextProps, "style"> {
  /** A step from the type scale (lib/typography.ts). Default `small` (12px). */
  size?: TypeStep;
  /** JetBrains Mono weight. Default `regular`. */
  weight?: MonoWeight;
  /**
   * A tracking step, or `numeral` for hero numbers (-0.04em of the size, as
   * EloTile and the live clock). Default `normal`.
   */
  tracking?: TrackingStep | "numeral";
  /** Uppercase via style (the source string stays readable to VoiceOver). */
  caps?: boolean;
  /** Color and layout classes. Default color `text-ink` (every number is ink unless it is a delta). */
  className?: string;
  /**
   * Color (palette-driven screens) and layout. It may tune `lineHeight` or
   * `letterSpacing`; it cannot turn tabular figures off.
   */
  style?: StyleProp<TextStyle>;
  children?: React.ReactNode;
}

/** The letter-spacing a Mono or Label renders at. */
export function trackingFor(tracking: TrackingStep | "numeral", fontSize: number): number {
  return tracking === "numeral" ? numeralTracking(fontSize) : TRACKING[tracking];
}

/**
 * A number (or any data) in JetBrains Mono at a scale step, with tabular
 * figures always on (DESIGN.md "Typography": every number is mono, tabular).
 * Size comes from the scale, never a literal: `<Mono size="title-xl" weight="bold">1512</Mono>`.
 */
export function Mono({
  size = "small",
  weight = "regular",
  tracking = "normal",
  caps = false,
  className,
  style,
  children,
  ...rest
}: MonoProps) {
  const step = typeStep(size);
  return (
    <Text
      {...rest}
      className={cn(MONO_FAMILY_CLASS[weight], "text-ink", caps && "uppercase", className)}
      style={[step, { letterSpacing: trackingFor(tracking, step.fontSize) }, style, TABULAR]}
    >
      {children}
    </Text>
  );
}

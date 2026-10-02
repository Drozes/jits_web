import * as React from "react";
import { Text, type StyleProp, type TextProps, type TextStyle } from "react-native";
import { cn } from "@/lib/cn";
import { TABULAR, TRACKING, typeStep, type CapsTracking, type TextStep } from "@/lib/typography";
import { MONO_FAMILY_CLASS, type MonoWeight } from "./mono";

export type LabelFamily = "mono" | "heading";
export type LabelWeight = MonoWeight;

/** Static class names, so Tailwind's content scan generates each one. */
const HEADING_FAMILY_CLASS: Record<LabelWeight, string> = {
  regular: "font-heading-regular",
  medium: "font-heading-medium",
  bold: "font-heading",
};

/** Default color per family: mono meta labels in ink-3, heading labels in ink. */
const DEFAULT_TONE: Record<LabelFamily, string> = {
  mono: "text-ink-3",
  heading: "text-ink",
};

export interface LabelProps extends Omit<TextProps, "style"> {
  /**
   * A text step (display steps are not labels). Default `micro` (10px, the
   * floor). The size comes ONLY from here: never pass a `fontSize` in `style`
   * or a `text-[Npx]` / `text-<step>` class.
   */
  size?: TextStep;
  /** `mono` for meta labels (LBS, CLOSEST MATCH), `heading` for labels you act on. Default `mono`. */
  family?: LabelFamily;
  /** Default `regular` for mono, `bold` for heading (DM Sans 700, `font-heading`). */
  weight?: LabelWeight;
  /**
   * A caps tracking step; a caps label never renders untracked (R3 TY-3).
   * Default `caps-l` (1.68px), the meta-label tracking.
   */
  tracking?: CapsTracking;
  /** Color and layout classes; overrides the family's default tone. */
  className?: string;
  /**
   * Color (palette-driven screens) and layout; it may tune `lineHeight`. It
   * cannot remove the caps, the tracking or (mono) the tabular figures.
   */
  style?: StyleProp<TextStyle>;
  children?: React.ReactNode;
}

/**
 * A caps label at a scale step with the right tracking. Write the source
 * string in sentence case ("Closest match"); the label uppercases it by style
 * so VoiceOver reads words, not letters. Mono labels keep tabular figures
 * ("STEP 2 / 3").
 */
export function Label({
  size = "micro",
  family = "mono",
  weight,
  tracking = "caps-l",
  className,
  style,
  children,
  ...rest
}: LabelProps) {
  const resolvedWeight = weight ?? (family === "mono" ? "regular" : "bold");
  const familyClass =
    family === "mono" ? MONO_FAMILY_CLASS[resolvedWeight] : HEADING_FAMILY_CLASS[resolvedWeight];
  return (
    <Text
      {...rest}
      className={cn(familyClass, DEFAULT_TONE[family], "uppercase", className)}
      style={[
        typeStep(size),
        style,
        { letterSpacing: TRACKING[tracking], textTransform: "uppercase" },
        family === "mono" ? TABULAR : null,
      ]}
    >
      {children}
    </Text>
  );
}

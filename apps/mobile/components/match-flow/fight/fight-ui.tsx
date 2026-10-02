import * as React from "react";
import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import { ON_MEDIA, usePalette, type Palette } from "@/lib/theme/palette";
import { FIGHT_RADIUS, TABULAR } from "./fight-tokens";
import { TRACKING, typeSize, typeStep, type TrackingStep, type TypeStep } from "@/lib/typography";
import { Button, type ButtonProps } from "@/components/ui/elo-system/button";

/**
 * Small building blocks shared by the match-flow screens. Kept deliberately
 * plain: colors from the app theme (`usePalette()`, so light and dark both
 * work), brand fonts via NativeWind classes, no shadows, radius 2-4.
 */

/** "▲ +14" / "▼ −9" / "0". The minus is U+2212, as in the approved mockups. */
export function formatSignedDelta(delta: number): string {
  if (delta > 0) return `▲ +${delta}`;
  if (delta < 0) return `▼ −${Math.abs(delta)}`;
  return "0";
}

export function deltaColor(delta: number, p: Palette): string {
  return delta > 0 ? p.win : delta < 0 ? p.loss : p.text;
}

/** First letters of the first and last word: "Mina Park" -> "MP". */
export function initialsOf(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0][0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1][0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

/** "Mina Park" -> "M. Park"; a single word stays as is. */
export function shortName(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "Opponent";
  if (words.length === 1) return words[0];
  return `${words[0][0]}. ${words.slice(1).join(" ")}`;
}

interface MonoProps {
  children: React.ReactNode;
  color?: string;
  /**
   * A type-scale step (lib/typography.ts). Default `micro` (10px). A raw
   * number is accepted only so call sites outside the WP5b sweep keep
   * compiling until they migrate; new code passes a step.
   */
  size?: TypeStep | number;
  bold?: boolean;
  /**
   * A tracking step. Default `caps-xl` (2.52px). A raw number is accepted only
   * for call sites not yet migrated; new code passes a step.
   */
  spacing?: TrackingStep | number;
  testID?: string;
  numberOfLines?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  /** Caps Dynamic Type scaling where a row must not overflow (for example 1.3). */
  maxFontSizeMultiplier?: number;
}

/** JetBrains Mono caps label. */
export function Mono({ children, color, size = "micro", bold = false, spacing = "caps-xl", testID, numberOfLines, accessibilityLabel, maxFontSizeMultiplier }: MonoProps) {
  const p = usePalette();
  const sizeStyle = typeof size === "number" ? { fontSize: size } : typeStep(size);
  const letterSpacing = typeof spacing === "number" ? spacing : TRACKING[spacing];
  return (
    <Text
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      numberOfLines={numberOfLines}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      className={bold ? "font-mono-bold" : "font-mono-medium"}
      style={[sizeStyle, { letterSpacing, color: color ?? p.text2 }, TABULAR]}
    >
      {children}
    </Text>
  );
}

type FightButtonProps = Omit<ButtonProps, "variant" | "className" | "hitSlop" | "accessibilityHint"> & {
  variant?: "primary" | "secondary" | "ghost";
};

/**
 * The match flow's name for the one ELO `Button` (WP3): a thin alias kept so
 * the match-flow call sites and the Adding Flare tests read unchanged. New
 * code imports `Button` from `@/components/ui/elo-system`.
 */
export function FightButton(props: FightButtonProps) {
  return <Button {...props} />;
}

/** Initials on a bordered panel square (no photos in the match flow yet). */
export function InitialsBlock({
  name,
  size,
  fontSize,
  display = false,
  accent,
  style,
  maxFontSizeMultiplier,
}: {
  name: string;
  size: number | "fill";
  /**
   * A type-scale step for the initials (size only: the glyph is centered in a
   * fixed box, so no line height is set). A raw number is accepted only for
   * call sites not yet migrated.
   */
  fontSize: TypeStep | number;
  /** Dynamic Type cap for the initials (the block is a fixed size). */
  maxFontSizeMultiplier?: number;
  /** Bebas Neue instead of DM Sans. */
  display?: boolean;
  /** Bottom rule color (the face-off card: red for you). */
  accent?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const p = usePalette();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: size === "fill" ? p.plate : p.panel,
          borderWidth: 1,
          borderColor: p.strong,
          borderRadius: FIGHT_RADIUS.tag,
        },
        size === "fill" ? { width: "100%" } : { width: size, height: size },
        accent ? { borderBottomWidth: 3, borderBottomColor: accent } : null,
        style,
      ]}
    >
      <Text
        maxFontSizeMultiplier={maxFontSizeMultiplier}
        className={display ? "font-display" : "font-heading"}
        style={[
          typeof fontSize === "number" ? { fontSize } : typeSize(fontSize),
          { letterSpacing: TRACKING.caps, color: p.text },
        ]}
      >
        {initialsOf(name)}
      </Text>
    </View>
  );
}

/** Win / Draw / Loss rating stakes, the viewer's side. */
export function StakesStrip({
  win,
  draw,
  loss,
  height = 56,
  background,
  testID,
  maxFontSizeMultiplier,
}: {
  win: number;
  draw: number;
  loss: number;
  height?: number;
  /** Defaults to the plate. */
  background?: string;
  testID?: string;
  /**
   * Dynamic Type cap for the cell text (the strip is a fixed height). Passing
   * one also keeps each cell to one line; without it (the face-off) the text
   * scales and wraps freely, as before.
   */
  maxFontSizeMultiplier?: number;
}) {
  const p = usePalette();
  const lines = maxFontSizeMultiplier != null ? 1 : undefined;
  const cells = [
    { key: "win", label: "WIN", value: win },
    { key: "draw", label: "DRAW", value: draw },
    { key: "loss", label: "LOSS", value: loss },
  ];
  return (
    <View
      testID={testID}
      style={{
        height,
        flexDirection: "row",
        backgroundColor: background ?? p.plate,
        borderWidth: 1,
        borderColor: p.hairline,
        borderRadius: FIGHT_RADIUS.button,
      }}
    >
      {cells.map((c, i) => (
        <View
          key={c.key}
          accessible
          accessibilityLabel={`${c.label} ${c.value > 0 ? "+" : ""}${c.value}`}
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            gap: 5,
            borderLeftWidth: i === 0 ? 0 : 1,
            borderColor: p.hairline,
          }}
        >
          <Mono color={p.text3} numberOfLines={lines} maxFontSizeMultiplier={maxFontSizeMultiplier}>{c.label}</Mono>
          <Text
            testID={testID ? `${testID}-${c.key}` : undefined}
            numberOfLines={lines}
            maxFontSizeMultiplier={maxFontSizeMultiplier}
            className="font-mono-bold"
            style={[typeStep("subhead"), { color: c.key === "draw" ? (c.value < 0 ? p.amber : p.text) : deltaColor(c.value, p) }, TABULAR]}
          >
            {formatSignedDelta(c.value)}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * A 44 px per-athlete status plate: amber dashed while pending (attention),
 * a solid strong edge with an ink check when done. Done is not a gain, so it
 * is never Gain Green (WP2, R3 CO-2).
 */
export function StatusPlate({
  label,
  done,
  align = "left",
  testID,
  accessibilityLabel,
}: {
  label: string;
  done: boolean;
  align?: "left" | "right";
  testID?: string;
  accessibilityLabel?: string;
}) {
  const p = usePalette();
  const color = done ? p.text : p.amber;
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={accessibilityLabel ?? label}
      style={{
        flex: 1,
        height: 44,
        paddingHorizontal: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: align === "right" ? "flex-end" : "flex-start",
        gap: 8,
        borderWidth: 1,
        borderStyle: done ? "solid" : "dashed",
        borderColor: done ? p.strong : p.amber,
        borderRadius: FIGHT_RADIUS.button,
      }}
    >
      {done ? (
        <Text className="font-mono-bold" style={[typeStep("small"), { color }, TABULAR]}>
          {"✓"}
        </Text>
      ) : (
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      )}
      <Mono bold color={color} spacing="caps-l" numberOfLines={1}>
        {label}
      </Mono>
    </View>
  );
}

/** The rating block: "RATING / 1512 -> 1526" left, the delta right. */
export function RatingBlock({
  label = "RATING",
  before,
  after,
  delta,
  deltaTestID,
  deltaNode,
  ratingNode,
}: {
  label?: string;
  before: number | null;
  after: number | null;
  delta: number | null;
  deltaTestID?: string;
  /** Replaces the plain delta text. */
  deltaNode?: React.ReactNode;
  /** Replaces the rating text (the verdict rolls it in its own leaf). */
  ratingNode?: React.ReactNode;
}) {
  const p = usePalette();
  const ratingText =
    before != null && after != null && before !== after ? `${before} → ${after}` : after != null ? `${after}` : "";
  return (
    <View
      style={{
        height: 64,
        paddingHorizontal: 16,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: p.plate,
        borderWidth: 1,
        borderColor: p.hairline,
        borderRadius: FIGHT_RADIUS.plate,
      }}
    >
      <View style={{ gap: 6 }}>
        <Mono color={p.text3}>{label}</Mono>
        {ratingNode ?? (
          <Text className="font-mono-bold" style={[typeStep("title-xl"), { color: p.text }, TABULAR]}>
            {ratingText}
          </Text>
        )}
      </View>
      {deltaNode ??
        (delta != null && delta !== 0 ? (
          <Text testID={deltaTestID} className="font-mono-bold" style={[typeStep("headline-l"), { color: deltaColor(delta, p) }, TABULAR]}>
            {formatSignedDelta(delta)}
          </Text>
        ) : null)}
    </View>
  );
}

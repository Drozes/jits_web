import * as React from "react";
import { ActivityIndicator, Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { FIGHT, FIGHT_RADIUS, TABULAR } from "./fight-tokens";

/**
 * Small building blocks shared by the fight-night match-flow screens. Kept
 * deliberately plain: fixed dark colors (FIGHT), brand fonts via NativeWind
 * classes, no shadows, radius 2-4.
 */

/** "▲ +14" / "▼ −9" / "0". The minus is U+2212, as in the approved mockups. */
export function formatSignedDelta(delta: number): string {
  if (delta > 0) return `▲ +${delta}`;
  if (delta < 0) return `▼ −${Math.abs(delta)}`;
  return "0";
}

export function deltaColor(delta: number): string {
  return delta > 0 ? FIGHT.win : delta < 0 ? FIGHT.loss : FIGHT.text;
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
  size?: number;
  bold?: boolean;
  spacing?: number;
  testID?: string;
  numberOfLines?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/** JetBrains Mono caps label. */
export function Mono({ children, color = FIGHT.text2, size = 10, bold = false, spacing = 2.52, testID, numberOfLines, accessibilityLabel }: MonoProps) {
  return (
    <Text
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      numberOfLines={numberOfLines}
      className={bold ? "font-mono-bold" : "font-mono-medium"}
      style={[{ fontSize: size, letterSpacing: spacing, color }, TABULAR]}
    >
      {children}
    </Text>
  );
}

/** The bordered RANKED / CASUAL tag. */
export function KindTag({ kind, onScrim = false }: { kind: "ranked" | "casual"; onScrim?: boolean }) {
  return (
    <View
      style={{
        height: 24,
        paddingHorizontal: 8,
        justifyContent: "center",
        borderWidth: 1,
        borderColor: FIGHT.strong,
        borderRadius: FIGHT_RADIUS.tag,
        backgroundColor: onScrim ? FIGHT.glass : undefined,
      }}
    >
      <Mono color={FIGHT.tagText}>{kind === "ranked" ? "RANKED" : "CASUAL"}</Mono>
    </View>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost";

interface FightButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  busy?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  height?: number;
  icon?: (color: string) => React.ReactNode;
  /** Right-aligned mono note inside the button (e.g. "PROCESSING"). */
  trailing?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * The one button shape of the match flow: primary is Signal Red with dark
 * text (one per screen), secondary is the white-8 glass with a 40% border,
 * ghost is text only.
 */
export function FightButton({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  busy = false,
  testID,
  accessibilityLabel,
  height = 56,
  icon,
  trailing,
  style,
}: FightButtonProps) {
  const fg = variant === "primary" ? FIGHT.onCta : variant === "secondary" ? FIGHT.white : FIGHT.text;
  const inert = disabled || busy;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: inert, busy }}
      onPress={onPress}
      disabled={inert}
      style={({ pressed }) => [
        {
          height,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: trailing ? "space-between" : "center",
          gap: 10,
          paddingHorizontal: 16,
          borderRadius: FIGHT_RADIUS.button,
          opacity: disabled ? 0.5 : 1,
        },
        variant === "primary" && { backgroundColor: pressed ? FIGHT.ctaPressed : FIGHT.cta },
        variant === "secondary" && {
          backgroundColor: pressed ? FIGHT.secondaryBgPressed : FIGHT.secondaryBg,
          borderWidth: 1,
          borderColor: FIGHT.strong,
        },
        variant === "ghost" && { opacity: pressed ? 0.7 : disabled ? 0.5 : 1 },
        style,
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {busy ? <ActivityIndicator size="small" color={fg} /> : icon ? icon(fg) : null}
        <Text
          className="font-heading uppercase"
          style={{ fontSize: variant === "ghost" ? 13 : 14, letterSpacing: 1.12, color: fg }}
        >
          {label}
        </Text>
      </View>
      {trailing ?? null}
    </Pressable>
  );
}

/** Initials on a bordered panel square (no photos in the match flow yet). */
export function InitialsBlock({
  name,
  size,
  fontSize,
  display = false,
  accent,
  style,
}: {
  name: string;
  size: number | "fill";
  fontSize: number;
  /** Bebas Neue instead of DM Sans. */
  display?: boolean;
  /** Bottom rule color (the face-off card: red for you). */
  accent?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: size === "fill" ? FIGHT.plate : FIGHT.panel,
          borderWidth: 1,
          borderColor: FIGHT.strong,
          borderRadius: FIGHT_RADIUS.tag,
        },
        size === "fill" ? { width: "100%" } : { width: size, height: size },
        accent ? { borderBottomWidth: 3, borderBottomColor: accent } : null,
        style,
      ]}
    >
      <Text
        className={display ? "font-display" : "font-heading"}
        style={{ fontSize, letterSpacing: 1, color: FIGHT.text }}
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
  background = FIGHT.plate,
  testID,
}: {
  win: number;
  draw: number;
  loss: number;
  height?: number;
  background?: string;
  testID?: string;
}) {
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
        backgroundColor: background,
        borderWidth: 1,
        borderColor: FIGHT.hairline,
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
            borderColor: FIGHT.hairline,
          }}
        >
          <Mono color={FIGHT.text3}>{c.label}</Mono>
          <Text
            testID={testID ? `${testID}-${c.key}` : undefined}
            className="font-mono-bold"
            style={[{ fontSize: 16, color: c.key === "draw" ? (c.value < 0 ? FIGHT.amber : FIGHT.text) : deltaColor(c.value) }, TABULAR]}
          >
            {formatSignedDelta(c.value)}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** A 44 px per-athlete status plate: amber dashed while pending, green when done. */
export function StatusPlate({
  label,
  done,
  align = "left",
  testID,
  accessibilityLabel,
  pendingColor = FIGHT.amber,
}: {
  label: string;
  done: boolean;
  align?: "left" | "right";
  testID?: string;
  accessibilityLabel?: string;
  pendingColor?: string;
}) {
  const color = done ? FIGHT.win : pendingColor;
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
        borderColor: done ? FIGHT.winRule : pendingColor,
        borderRadius: FIGHT_RADIUS.button,
      }}
    >
      {done ? (
        <Text className="font-mono-bold" style={{ fontSize: 12, color }}>
          {"✓"}
        </Text>
      ) : (
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      )}
      <Mono bold color={color} spacing={1.68} numberOfLines={1}>
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
}: {
  label?: string;
  before: number | null;
  after: number | null;
  delta: number | null;
  deltaTestID?: string;
  /** Replaces the plain delta text (the verdict animates it). */
  deltaNode?: React.ReactNode;
}) {
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
        backgroundColor: FIGHT.plate,
        borderWidth: 1,
        borderColor: FIGHT.hairline,
        borderRadius: FIGHT_RADIUS.plate,
      }}
    >
      <View style={{ gap: 6 }}>
        <Mono color={FIGHT.text3}>{label}</Mono>
        <Text className="font-mono-bold" style={[{ fontSize: 22, color: FIGHT.text }, TABULAR]}>
          {ratingText}
        </Text>
      </View>
      {deltaNode ??
        (delta != null && delta !== 0 ? (
          <Text testID={deltaTestID} className="font-mono-bold" style={[{ fontSize: 26, color: deltaColor(delta) }, TABULAR]}>
            {formatSignedDelta(delta)}
          </Text>
        ) : null)}
    </View>
  );
}

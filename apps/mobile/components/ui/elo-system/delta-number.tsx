import { View, Text } from "react-native";
import { cn } from "@/lib/cn";
import { TYPE_SCALE, typeSize, type TypeStep } from "@/lib/typography";

type DeltaSize = "s" | "m" | "l";

/** The number step and the arrow glyph step (0.8x the number) per size. */
const SIZE_STEP: Record<DeltaSize, { number: TypeStep; glyph: TypeStep }> = {
  s: { number: "small", glyph: "micro" },
  m: { number: "subhead", glyph: "body" },
  l: { number: "headline-xl", glyph: "title-xl" },
};

interface DeltaNumberProps {
  value: number;
  size?: DeltaSize;
  showSign?: boolean;
  className?: string;
}

export function DeltaNumber({
  value,
  size = "m",
  showSign = false,
  className,
}: DeltaNumberProps) {
  const direction: "up" | "down" | "flat" =
    value > 0 ? "up" : value < 0 ? "down" : "flat";
  const colorClass =
    direction === "up"
      ? "text-positive"
      : direction === "down"
        ? "text-negative"
        : "text-ink-3";
  const glyph = direction === "up" ? "▲" : direction === "down" ? "▼" : "—";
  const numericText = showSign
    ? value > 0
      ? `+${value}`
      : value < 0
        ? `${value}`
        : "0"
    : `${Math.abs(value)}`;

  const step = SIZE_STEP[size];
  const px = TYPE_SCALE[step.number].fontSize;
  // Flat placeholder (no real delta, e.g. leaderboard rows passing 0): show only
  // the muted em-dash, not a redundant "0".
  const showNumber = showSign || value !== 0;

  return (
    <View className={cn("flex-row items-center", className)}>
      {!showSign && (
        <Text
          className={cn("font-mono-bold tabular-nums", colorClass, showNumber && "mr-[2px]")}
          style={{ ...typeSize(step.glyph), lineHeight: px }}
        >
          {glyph}
        </Text>
      )}
      {showNumber && (
        <Text
          className={cn("font-mono-bold tabular-nums", colorClass)}
          style={{ ...typeSize(step.number), lineHeight: Math.round(px * 1.2) }}
        >
          {numericText}
        </Text>
      )}
    </View>
  );
}

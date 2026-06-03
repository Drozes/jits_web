import { View, Text } from "react-native";
import { cn } from "@/lib/cn";

type DeltaSize = "s" | "m" | "l";

const SIZE_PX: Record<DeltaSize, number> = {
  s: 12,
  m: 16,
  l: 28,
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

  const px = SIZE_PX[size];
  // Flat placeholder (no real delta, e.g. leaderboard rows passing 0): show only
  // the muted em-dash, not a redundant "0".
  const showNumber = showSign || value !== 0;

  return (
    <View className={cn("flex-row items-center", className)}>
      {!showSign && (
        <Text
          className={cn("font-mono-bold", colorClass, showNumber && "mr-[2px]")}
          style={{ fontSize: Math.round(px * 0.8), lineHeight: px }}
        >
          {glyph}
        </Text>
      )}
      {showNumber && (
        <Text
          className={cn("font-mono-bold", colorClass)}
          style={{ fontSize: px, lineHeight: Math.round(px * 1.2) }}
        >
          {numericText}
        </Text>
      )}
    </View>
  );
}

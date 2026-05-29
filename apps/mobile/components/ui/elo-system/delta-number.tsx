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

  return (
    <View className={cn("flex-row items-center", className)}>
      {!showSign && (
        <Text
          className={cn("font-mono-bold mr-[2px]", colorClass)}
          style={{ fontSize: Math.round(px * 0.8), lineHeight: px }}
        >
          {glyph}
        </Text>
      )}
      <Text
        className={cn("font-mono-bold", colorClass)}
        style={{ fontSize: px, lineHeight: px }}
      >
        {numericText}
      </Text>
    </View>
  );
}

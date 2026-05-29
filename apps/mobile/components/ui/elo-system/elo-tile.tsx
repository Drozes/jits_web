import { View, Text } from "react-native";
import { cn } from "@/lib/cn";

type EloTileSize = "hero" | "large" | "medium" | "small";

const SIZE_PX: Record<EloTileSize, number> = {
  hero: 96,
  large: 64,
  medium: 44,
  small: 36,
};

interface EloTileProps {
  label: string;
  value?: number | string;
  size?: EloTileSize;
  accent?: boolean;
  /** Render the 3px Signal Red bottom accent bar (canonical hero ELO tile). */
  accentBar?: boolean;
  before?: string | number;
  after?: string | number;
  className?: string;
}

interface SingleTileProps {
  label: string;
  value: string | number;
  size: EloTileSize;
  accent?: boolean;
  accentBar?: boolean;
}

function SingleTile({ label, value, size, accent, accentBar }: SingleTileProps) {
  return (
    <View
      className={cn(
        "bg-surface-3 border rounded-md px-5 py-4 items-center min-w-[120px]",
        accentBar && "overflow-hidden",
        accent ? "border-cta" : "border-hairline",
      )}
    >
      <Text
        className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl"
      >
        {label}
      </Text>
      <Text
        className="font-mono-bold text-ink"
        style={{
          fontSize: SIZE_PX[size],
          // RN crops/centers the glyph tightly when lineHeight == fontSize; give
          // ~10% breathing room so the hero number isn't vertically clipped.
          lineHeight: SIZE_PX[size] * 1.1,
          letterSpacing: -SIZE_PX[size] * 0.04,
          marginTop: 8,
          fontVariant: ["tabular-nums"],
        }}
      >
        {value}
      </Text>
      {accentBar ? (
        <View className="absolute left-0 right-0 bottom-0 h-[3px] bg-cta" />
      ) : null}
    </View>
  );
}

export function EloTile({
  label,
  value,
  size = "large",
  accent,
  accentBar,
  before,
  after,
  className,
}: EloTileProps) {
  if (before !== undefined && after !== undefined) {
    return (
      <View className={cn("flex-row items-center gap-3", className)}>
        <SingleTile label={label} value={before} size={size} />
        <Text className="font-mono text-ink-3 text-[28px]">→</Text>
        <SingleTile label={label} value={after} size={size} accent={accent} />
      </View>
    );
  }
  return (
    <View className={className}>
      <SingleTile label={label} value={value ?? ""} size={size} accent={accent} accentBar={accentBar} />
    </View>
  );
}

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
  before?: string | number;
  after?: string | number;
  className?: string;
}

interface SingleTileProps {
  label: string;
  value: string | number;
  size: EloTileSize;
  accent?: boolean;
}

function SingleTile({ label, value, size, accent }: SingleTileProps) {
  return (
    <View
      className={cn(
        "bg-surface-3 border rounded-md px-5 py-4 items-center min-w-[120px]",
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
          lineHeight: SIZE_PX[size],
          letterSpacing: -SIZE_PX[size] * 0.04,
          marginTop: 8,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

export function EloTile({
  label,
  value,
  size = "large",
  accent,
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
      <SingleTile label={label} value={value ?? ""} size={size} accent={accent} />
    </View>
  );
}

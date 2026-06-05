import { View, Text, Pressable } from "react-native";
import { cn } from "@/lib/cn";
import { DeltaNumber } from "./delta-number";

interface RankRowProps {
  rank: number | string;
  name: string;
  subtitle: string;
  value: number | string;
  delta: number;
  leader?: boolean;
  you?: boolean;
  onPress?: () => void;
  className?: string;
}

export function RankRow({
  rank,
  name,
  subtitle,
  value,
  delta,
  leader = false,
  you = false,
  onPress,
  className,
}: RankRowProps) {
  const rankStr = typeof rank === "number" ? String(rank).padStart(2, "0") : rank;
  const Wrapper: any = onPress ? Pressable : View;

  return (
    <Wrapper
      onPress={onPress}
      accessibilityRole={onPress ? "button" : undefined}
      className={cn(
        "flex-row items-center gap-3 border-l-[3px]",
        you ? "bg-surface-2 px-5 py-4 border-t border-hairline-strong" : "bg-surface-3 px-4 py-3",
        onPress && (you ? "active:bg-surface-3" : "active:bg-surface-4"),
        leader ? "border-l-cta" : "border-l-transparent",
        className,
      )}
    >
      <Text
        className={cn(
          "font-mono-bold text-[16px] text-right",
          leader ? "text-cta" : "text-ink-2",
        )}
        style={{ width: 36 }}
      >
        {rankStr}
      </Text>
      <View className="flex-1 min-w-0">
        <Text
          numberOfLines={1}
          className="font-heading text-[15px] text-ink"
        >
          {name}
        </Text>
        <Text
          numberOfLines={1}
          className="font-body text-[11px] text-ink-3 mt-[2px]"
        >
          {subtitle}
        </Text>
      </View>
      <View className="items-end gap-[2px]">
        <Text className="font-mono-bold text-[28px] text-ink" style={{ lineHeight: 34 }}>
          {value}
        </Text>
        <DeltaNumber value={delta} size="s" />
      </View>
    </Wrapper>
  );
}

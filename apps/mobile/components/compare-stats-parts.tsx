import { Text, View } from "react-native";
import { cn } from "../lib/cn";

export interface AthleteStats {
  displayName: string;
  elo: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  weight: number | null;
}

/** One completed match between the viewer and the competitor. Every match is ranked. */
export interface HeadToHeadMatch {
  result: "win" | "loss" | "draw" | null;
}

export function StatRow({
  label,
  left,
  right,
  format,
  higherIsBetter = true,
}: {
  label: string;
  left: number;
  right: number;
  format?: (v: number) => string;
  higherIsBetter?: boolean;
}) {
  const leftWins = higherIsBetter ? left > right : left < right;
  const rightWins = higherIsBetter ? right > left : right < left;
  const fmt = format ?? String;
  return (
    <View className="flex-row items-center py-3 border-b border-hairline-faint">
      <Text
        className={cn(
          "flex-1 text-center font-mono-bold text-[20px] tabular-nums",
          leftWins ? "text-ink" : "text-ink-3",
        )}
      >
        {fmt(left)}
      </Text>
      <Text className="flex-1 text-center font-mono text-[10px] text-ink-3 uppercase tracking-caps-l">
        {label}
      </Text>
      <Text
        className={cn(
          "flex-1 text-center font-mono-bold text-[20px] tabular-nums",
          rightWins ? "text-ink" : "text-ink-3",
        )}
      >
        {fmt(right)}
      </Text>
    </View>
  );
}

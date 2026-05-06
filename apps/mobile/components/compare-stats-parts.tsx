import { Pressable, Text, View } from "react-native";
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

export interface HeadToHeadMatch {
  matchType: "ranked" | "casual";
  result: "win" | "loss" | "draw" | null;
}

export type Filter = "all" | "ranked" | "casual";

export const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "ranked", label: "Ranked" },
  { value: "casual", label: "Casual" },
];

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
    <View className="flex-row items-center py-2 border-b border-border">
      <Text
        className={cn(
          "flex-1 text-center text-lg font-mono tabular-nums text-foreground",
          leftWins && "text-success",
        )}
      >
        {fmt(left)}
      </Text>
      <Text className="flex-1 text-center text-xs text-muted-foreground">
        {label}
      </Text>
      <Text
        className={cn(
          "flex-1 text-center text-lg font-mono tabular-nums text-foreground",
          rightWins && "text-success",
        )}
      >
        {fmt(right)}
      </Text>
    </View>
  );
}

export function computeH2H(matches: HeadToHeadMatch[], filter: Filter) {
  const filtered =
    filter === "all" ? matches : matches.filter((m) => m.matchType === filter);
  const wins = filtered.filter((m) => m.result === "win").length;
  const losses = filtered.filter((m) => m.result === "loss").length;
  const draws = filtered.filter((m) => m.result === "draw").length;
  const total = wins + losses;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
  return { wins, losses, draws, winRate };
}

export function FilterPillRow({
  current,
  onSelect,
}: {
  current: Filter;
  onSelect: (f: Filter) => void;
}) {
  return (
    <View className="flex-row justify-center gap-1 pt-2">
      {FILTERS.map((f) => (
        <Pressable
          key={f.value}
          onPress={() => onSelect(f.value)}
          className={cn(
            "rounded-full px-3 py-1",
            current === f.value ? "bg-primary" : "bg-muted",
          )}
        >
          <Text
            className={cn(
              "text-xs font-medium",
              current === f.value
                ? "text-primary-foreground"
                : "text-muted-foreground",
            )}
          >
            {f.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

import { Text, View } from "react-native";
import { Chip } from "./ui/elo-system";
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
    <View className="flex-row justify-center gap-2 pt-3">
      {FILTERS.map((f) => (
        <Chip
          key={f.value}
          active={current === f.value}
          onPress={() => onSelect(f.value)}
        >
          {f.label}
        </Chip>
      ))}
    </View>
  );
}

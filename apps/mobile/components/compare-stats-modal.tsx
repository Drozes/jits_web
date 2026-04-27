import * as React from "react";
import { Pressable, Text, View } from "react-native";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { cn } from "../lib/cn";

interface AthleteStats {
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

interface CompareStatsModalProps {
  currentAthlete: AthleteStats;
  competitor: AthleteStats;
  headToHead: HeadToHeadMatch[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Filter = "all" | "ranked" | "casual";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "ranked", label: "Ranked" },
  { value: "casual", label: "Casual" },
];

function StatRow({
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
          "flex-1 text-center text-lg font-bold tabular-nums text-foreground",
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
          "flex-1 text-center text-lg font-bold tabular-nums text-foreground",
          rightWins && "text-success",
        )}
      >
        {fmt(right)}
      </Text>
    </View>
  );
}

function computeH2H(matches: HeadToHeadMatch[], filter: Filter) {
  const filtered = filter === "all" ? matches : matches.filter((m) => m.matchType === filter);
  const wins = filtered.filter((m) => m.result === "win").length;
  const losses = filtered.filter((m) => m.result === "loss").length;
  const draws = filtered.filter((m) => m.result === "draw").length;
  const total = wins + losses;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
  return { wins, losses, draws, winRate };
}

export function CompareStatsModal({
  currentAthlete,
  competitor,
  headToHead,
  open,
  onOpenChange,
}: CompareStatsModalProps) {
  const [filter, setFilter] = React.useState<Filter>("all");

  const myStats = React.useMemo(() => {
    if (filter === "all") {
      return {
        wins: currentAthlete.wins,
        losses: currentAthlete.losses,
        draws: currentAthlete.draws,
        winRate: currentAthlete.winRate,
      };
    }
    return computeH2H(headToHead, filter);
  }, [filter, currentAthlete, headToHead]);

  const theirStats = React.useMemo(() => {
    if (filter === "all") {
      return {
        wins: competitor.wins,
        losses: competitor.losses,
        draws: competitor.draws,
        winRate: competitor.winRate,
      };
    }
    const h2h = computeH2H(headToHead, filter);
    return {
      wins: h2h.losses,
      losses: h2h.wins,
      draws: h2h.draws,
      winRate: h2h.winRate > 0 ? 100 - h2h.winRate : 0,
    };
  }, [filter, competitor, headToHead]);

  const isFiltered = filter !== "all";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-center">Compare Stats</DialogTitle>
        </DialogHeader>

        <View className="flex-row items-center mb-2">
          <Text className="flex-1 text-center text-sm font-semibold text-foreground" numberOfLines={1}>
            {currentAthlete.displayName}
          </Text>
          <Text className="flex-1 text-center text-xs text-muted-foreground">vs</Text>
          <Text className="flex-1 text-center text-sm font-semibold text-foreground" numberOfLines={1}>
            {competitor.displayName}
          </Text>
        </View>

        <View>
          {!isFiltered ? (
            <StatRow label="ELO" left={currentAthlete.elo} right={competitor.elo} />
          ) : null}
          <StatRow label="Wins" left={myStats.wins} right={theirStats.wins} />
          <StatRow label="Losses" left={myStats.losses} right={theirStats.losses} higherIsBetter={false} />
          <StatRow label="Draws" left={myStats.draws} right={theirStats.draws} higherIsBetter={false} />
          <StatRow label="Win Rate" left={myStats.winRate} right={theirStats.winRate} format={(v) => `${v}%`} />
        </View>

        <View className="flex-row justify-center gap-1 pt-2">
          {FILTERS.map((f) => (
            <Pressable
              key={f.value}
              onPress={() => setFilter(f.value)}
              className={cn(
                "rounded-full px-3 py-1",
                filter === f.value ? "bg-primary" : "bg-muted",
              )}
            >
              <Text
                className={cn(
                  "text-xs font-medium",
                  filter === f.value ? "text-primary-foreground" : "text-muted-foreground",
                )}
              >
                {f.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </DialogContent>
    </Dialog>
  );
}

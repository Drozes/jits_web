"use client";

import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

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
const filters: { value: Filter; label: string }[] = [
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
    <div className="grid grid-cols-3 items-center py-2">
      <p className={cn("text-lg font-bold tabular-nums text-center", leftWins && "text-green-500")}>
        {fmt(left)}
      </p>
      <p className="text-xs text-muted-foreground text-center">{label}</p>
      <p className={cn("text-lg font-bold tabular-nums text-center", rightWins && "text-green-500")}>
        {fmt(right)}
      </p>
    </div>
  );
}

function computeH2HStats(matches: HeadToHeadMatch[], filter: Filter) {
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
  const [filter, setFilter] = useState<Filter>("all");

  const myStats = useMemo(() => {
    if (filter === "all") return { wins: currentAthlete.wins, losses: currentAthlete.losses, draws: currentAthlete.draws, winRate: currentAthlete.winRate };
    return computeH2HStats(headToHead, filter);
  }, [filter, currentAthlete, headToHead]);

  const theirStats = useMemo(() => {
    if (filter === "all") return { wins: competitor.wins, losses: competitor.losses, draws: competitor.draws, winRate: competitor.winRate };
    // Opponent's perspective: my wins are their losses, my losses are their wins
    const h2h = computeH2HStats(headToHead, filter);
    return { wins: h2h.losses, losses: h2h.wins, draws: h2h.draws, winRate: h2h.winRate > 0 ? 100 - h2h.winRate : 0 };
  }, [filter, competitor, headToHead]);

  // For filtered view, use H2H stats; for "all", use overall stats
  const isFiltered = filter !== "all";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-center">Compare Stats</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-3 items-center mb-2">
          <p className="text-sm font-semibold text-center truncate px-1">
            {currentAthlete.displayName}
          </p>
          <p className="text-xs text-muted-foreground text-center">vs</p>
          <p className="text-sm font-semibold text-center truncate px-1">
            {competitor.displayName}
          </p>
        </div>

        <div className="divide-y">
          {!isFiltered && (
            <StatRow label="ELO" left={currentAthlete.elo} right={competitor.elo} />
          )}
          <StatRow label="Wins" left={myStats.wins} right={theirStats.wins} />
          <StatRow label="Losses" left={myStats.losses} right={theirStats.losses} higherIsBetter={false} />
          <StatRow label="Draws" left={myStats.draws} right={theirStats.draws} higherIsBetter={false} />
          <StatRow label="Win Rate" left={myStats.winRate} right={theirStats.winRate} format={(v) => `${v}%`} />
          {!isFiltered && (currentAthlete.weight != null || competitor.weight != null) && (
            <div className="grid grid-cols-3 items-center py-2">
              <p className="text-lg font-bold tabular-nums text-center">
                {currentAthlete.weight != null ? `${currentAthlete.weight}` : "—"}
              </p>
              <p className="text-xs text-muted-foreground text-center">Weight (lbs)</p>
              <p className="text-lg font-bold tabular-nums text-center">
                {competitor.weight != null ? `${competitor.weight}` : "—"}
              </p>
            </div>
          )}
        </div>

        {/* Match type filter */}
        <div className="flex justify-center gap-1 pt-1">
          {filters.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                filter === f.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

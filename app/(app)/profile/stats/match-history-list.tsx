"use client";

import { useState } from "react";
import { MatchCard } from "@/components/domain/match-card";
import { cn } from "@/lib/utils";
import type { MatchOutcome } from "@/lib/constants";
import { Swords } from "lucide-react";

interface MatchHistoryItem {
  match_id: string;
  match_type: string;
  athlete_outcome: string;
  opponent_display_name: string;
  elo_delta: number;
  completed_at: string;
  submission_type_display_name: string;
  result: string;
}

interface MatchHistoryListProps {
  matches: MatchHistoryItem[];
}

type Filter = "all" | "ranked" | "casual";

const filters: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "ranked", label: "Ranked" },
  { value: "casual", label: "Casual" },
];

export function MatchHistoryList({ matches }: MatchHistoryListProps) {
  const [filter, setFilter] = useState<Filter>("all");

  if (matches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Swords className="h-10 w-10 text-muted-foreground/40 mb-3" />
        <p className="font-medium">No matches yet</p>
        <p className="text-sm text-muted-foreground mt-1">
          Complete your first match to see your history
        </p>
      </div>
    );
  }

  const filtered = filter === "all" ? matches : matches.filter((m) => m.match_type === filter);
  const wins = filtered.filter((m) => m.athlete_outcome === "win").length;
  const losses = filtered.filter((m) => m.athlete_outcome === "loss").length;
  const draws = filtered.filter((m) => m.athlete_outcome === "draw").length;

  return (
    <div className="flex flex-col gap-3">
      {/* Filter pills + W-L-D summary */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
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
        <div className="flex items-center gap-1.5 text-xs tabular-nums">
          <span className="font-semibold text-green-500">{wins}W</span>
          <span className="text-muted-foreground">-</span>
          <span className="font-semibold text-red-500">{losses}L</span>
          <span className="text-muted-foreground">-</span>
          <span className="font-semibold text-muted-foreground">{draws}D</span>
        </div>
      </div>

      {/* Match list */}
      {filtered.length > 0 ? (
        <div className="flex flex-col gap-2">
          {filtered.map((m) => (
            <MatchCard
              key={m.match_id}
              type="match"
              opponentName={m.opponent_display_name}
              result={m.athlete_outcome as MatchOutcome}
              matchType={m.match_type as "ranked" | "casual"}
              eloDelta={m.match_type === "ranked" ? m.elo_delta : undefined}
              date={m.completed_at}
              href={`/match/${m.match_id}/results`}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-sm text-muted-foreground">
            No {filter} matches yet
          </p>
        </div>
      )}
    </div>
  );
}

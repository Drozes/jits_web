"use client";

import { MatchCard } from "@/components/domain/match-card";
import { matchRowLabel } from "@/lib/match-row-label";
import type { MatchOutcome } from "@jits/shared/constants";
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

export function MatchHistoryList({ matches }: MatchHistoryListProps) {
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

  // Every match is the same kind (casual was retired), so there is no filter.
  const wins = matches.filter((m) => m.athlete_outcome === "win").length;
  const losses = matches.filter((m) => m.athlete_outcome === "loss").length;
  const draws = matches.filter((m) => m.athlete_outcome === "draw").length;

  return (
    <div className="flex flex-col gap-3">
      {/* W-L-D summary */}
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-1.5 text-xs tabular-nums">
          <span className="font-semibold text-success">{wins}W</span>
          <span className="text-muted-foreground">-</span>
          <span className="font-semibold text-destructive">{losses}L</span>
          <span className="text-muted-foreground">-</span>
          <span className="font-semibold text-muted-foreground">{draws}D</span>
        </div>
      </div>

      {/* Match list */}
      <div className="flex flex-col gap-2">
          {matches.map((m) => (
            <MatchCard
              key={m.match_id}
              type="match"
              opponentName={m.opponent_display_name}
              result={m.athlete_outcome as MatchOutcome}
              matchType={m.match_type as "ranked" | "casual"}
              eloDelta={m.match_type === "ranked" ? m.elo_delta : undefined}
              date={m.completed_at}
              href={`/matches/${m.match_id}`}
              ariaLabel={matchRowLabel(m.opponent_display_name, m.athlete_outcome, m.match_type, m.elo_delta)}
            />
          ))}
      </div>
    </div>
  );
}

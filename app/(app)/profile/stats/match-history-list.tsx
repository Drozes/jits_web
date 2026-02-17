"use client";

import { MatchCard } from "@/components/domain/match-card";
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

  return (
    <div className="space-y-3">
      {matches.map((m) => (
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
  );
}

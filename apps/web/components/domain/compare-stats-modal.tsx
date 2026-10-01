"use client";

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

interface CompareStatsModalProps {
  currentAthlete: AthleteStats;
  competitor: AthleteStats;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

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
      <p className={cn("text-lg font-bold tabular-nums text-center", leftWins && "text-success")}>
        {fmt(left)}
      </p>
      <p className="text-xs text-muted-foreground text-center">{label}</p>
      <p className={cn("text-lg font-bold tabular-nums text-center", rightWins && "text-success")}>
        {fmt(right)}
      </p>
    </div>
  );
}

export function CompareStatsModal({
  currentAthlete,
  competitor,
  open,
  onOpenChange,
}: CompareStatsModalProps) {
  // Career stats side by side. Every match is the same kind, so no filter.
  const myStats = currentAthlete;
  const theirStats = competitor;

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
          <StatRow label="ELO" left={currentAthlete.elo} right={competitor.elo} />
          <StatRow label="Wins" left={myStats.wins} right={theirStats.wins} />
          <StatRow label="Losses" left={myStats.losses} right={theirStats.losses} higherIsBetter={false} />
          <StatRow label="Draws" left={myStats.draws} right={theirStats.draws} higherIsBetter={false} />
          <StatRow label="Win Rate" left={myStats.winRate} right={theirStats.winRate} format={(v) => `${v}%`} />
          {(currentAthlete.weight != null || competitor.weight != null) && (
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

      </DialogContent>
    </Dialog>
  );
}

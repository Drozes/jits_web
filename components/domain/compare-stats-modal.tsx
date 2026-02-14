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
  winRate: number;
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
  higherIsBetter = true,
}: {
  label: string;
  left: number;
  right: number;
  higherIsBetter?: boolean;
}) {
  const leftWins = higherIsBetter ? left > right : left < right;
  const rightWins = higherIsBetter ? right > left : right < left;

  return (
    <div className="grid grid-cols-3 items-center py-2">
      <p
        className={cn(
          "text-lg font-bold tabular-nums text-center",
          leftWins && "text-green-500",
        )}
      >
        {label === "Win Rate" ? `${left}%` : left}
      </p>
      <p className="text-xs text-muted-foreground text-center">{label}</p>
      <p
        className={cn(
          "text-lg font-bold tabular-nums text-center",
          rightWins && "text-green-500",
        )}
      >
        {label === "Win Rate" ? `${right}%` : right}
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
          <StatRow
            label="ELO"
            left={currentAthlete.elo}
            right={competitor.elo}
          />
          <StatRow
            label="Wins"
            left={currentAthlete.wins}
            right={competitor.wins}
          />
          <StatRow
            label="Losses"
            left={currentAthlete.losses}
            right={competitor.losses}
            higherIsBetter={false}
          />
          <StatRow
            label="Win Rate"
            left={currentAthlete.winRate}
            right={competitor.winRate}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

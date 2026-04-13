"use client";

import { Scale, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface Athlete { displayName: string; weight: number | null }

interface WeightVerifyStepProps {
  onNext: () => void;
  currentAthlete: Athlete;
  opponent: Athlete;
  matchType: "casual" | "ranked";
}

function weightGapDivisions(a: number, b: number): number {
  const DIVISION_SIZE = 11; // ~5 kg IBJJF division gap in lbs
  return Math.floor(Math.abs(a - b) / DIVISION_SIZE);
}

export function WeightVerifyStep({ onNext, currentAthlete, opponent, matchType }: WeightVerifyStepProps) {
  const bothPresent = currentAthlete.weight != null && opponent.weight != null;
  const gap = bothPresent ? weightGapDivisions(currentAthlete.weight!, opponent.weight!) : 0;
  const diff = bothPresent ? Math.abs(currentAthlete.weight! - opponent.weight!) : 0;

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4">
      <Scale className="h-8 w-8 text-primary" />
      <h2 className="text-lg font-semibold">Verify Weights</h2>

      <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
        <WeightCard name={currentAthlete.displayName} weight={currentAthlete.weight} />
        <WeightCard name={opponent.displayName} weight={opponent.weight} />
      </div>

      {bothPresent && matchType === "ranked" && diff > 0 && (
        <p className="text-xs text-muted-foreground tabular-nums">
          Weight difference: {diff} lbs
        </p>
      )}

      {matchType === "ranked" && gap > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
          <p className="text-xs text-amber-500">
            Weight division gap detected. Heavier athlete&apos;s ELO will be adjusted.
          </p>
        </div>
      )}

      <Button className="w-full max-w-sm" size="lg" onClick={onNext}>
        Confirm Weights
      </Button>
    </div>
  );
}

function WeightCard({ name, weight }: { name: string; weight: number | null }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-1 py-4 px-3">
        <p className="text-sm font-medium truncate w-full text-center">{name}</p>
        <p className="text-3xl font-bold tabular-nums">
          {weight != null ? `${weight}` : "N/A"}
        </p>
        {weight != null && <p className="text-xs text-muted-foreground">lbs</p>}
      </CardContent>
    </Card>
  );
}

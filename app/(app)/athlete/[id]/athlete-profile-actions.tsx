"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CompareStatsModal } from "@/components/domain/compare-stats-modal";
import { Swords, BarChart3 } from "lucide-react";

interface AthleteStats {
  displayName: string;
  elo: number;
  wins: number;
  losses: number;
  winRate: number;
  weight: number | null;
}

interface AthleteProfileActionsProps {
  competitorId: string;
  currentAthlete: AthleteStats;
  competitor: AthleteStats;
}

export function AthleteProfileActions({
  currentAthlete,
  competitor,
}: AthleteProfileActionsProps) {
  const [compareOpen, setCompareOpen] = useState(false);

  return (
    <>
      <div className="flex gap-2">
        <Button className="flex-1" disabled>
          <Swords className="mr-2 h-4 w-4" />
          Challenge
        </Button>
        <Button
          className="flex-1"
          variant="outline"
          onClick={() => setCompareOpen(true)}
        >
          <BarChart3 className="mr-2 h-4 w-4" />
          Compare Stats
        </Button>
      </div>

      <CompareStatsModal
        currentAthlete={currentAthlete}
        competitor={competitor}
        open={compareOpen}
        onOpenChange={setCompareOpen}
      />
    </>
  );
}

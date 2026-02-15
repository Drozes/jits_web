"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CompareStatsModal } from "@/components/domain/compare-stats-modal";
import { ChallengeSheet } from "@/components/domain/challenge-sheet";
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
  currentAthleteId: string;
  currentAthlete: AthleteStats;
  competitor: AthleteStats;
  pendingChallengeId: string | null;
}

export function AthleteProfileActions({
  competitorId,
  currentAthleteId,
  currentAthlete,
  competitor,
  pendingChallengeId,
}: AthleteProfileActionsProps) {
  const [compareOpen, setCompareOpen] = useState(false);
  const [challengeOpen, setChallengeOpen] = useState(false);

  const isSelf = currentAthleteId === competitorId;

  return (
    <>
      <div className="flex gap-2">
        {!isSelf && (
          pendingChallengeId ? (
            <Button className="flex-1 bg-amber-500 hover:bg-amber-600 text-white" asChild>
              <Link href="/match/pending">
                <Swords className="mr-2 h-4 w-4" />
                View Challenge
              </Link>
            </Button>
          ) : (
            <Button className="flex-1" onClick={() => setChallengeOpen(true)}>
              <Swords className="mr-2 h-4 w-4" />
              Challenge
            </Button>
          )
        )}
        <Button
          className="flex-1"
          variant="outline"
          onClick={() => setCompareOpen(true)}
        >
          <BarChart3 className="mr-2 h-4 w-4" />
          Compare Stats
        </Button>
      </div>

      {!isSelf && !pendingChallengeId && (
        <ChallengeSheet
          competitorId={competitorId}
          competitorName={competitor.displayName}
          competitorElo={competitor.elo}
          currentAthleteId={currentAthleteId}
          currentAthleteElo={currentAthlete.elo}
          currentAthleteWeight={currentAthlete.weight}
          open={challengeOpen}
          onOpenChange={setChallengeOpen}
        />
      )}

      <CompareStatsModal
        currentAthlete={currentAthlete}
        competitor={competitor}
        open={compareOpen}
        onOpenChange={setCompareOpen}
      />
    </>
  );
}

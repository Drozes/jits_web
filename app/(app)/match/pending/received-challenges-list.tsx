"use client";

import { useState } from "react";
import { MatchCard } from "@/components/domain/match-card";
import { ChallengeResponseSheet } from "@/components/domain/challenge-response-sheet";
import { Button } from "@/components/ui/button";

export interface ReceivedChallenge {
  id: string;
  challengerName: string;
  challengerId: string | undefined;
  challengerElo: number;
  challengerWeight: number | null;
  matchType: "casual" | "ranked";
  date: string;
}

interface ReceivedChallengesListProps {
  challenges: ReceivedChallenge[];
  currentAthleteElo: number;
}

export function ReceivedChallengesList({
  challenges,
  currentAthleteElo,
}: ReceivedChallengesListProps) {
  const [selectedChallenge, setSelectedChallenge] =
    useState<ReceivedChallenge | null>(null);

  return (
    <>
      <div className="flex flex-col gap-2">
        {challenges.map((challenge) => (
          <div key={challenge.id} className="flex flex-col gap-1.5">
            <MatchCard
              type="challenge"
              opponentName={challenge.challengerName}
              status="Pending"
              date={challenge.date}
              href={
                challenge.challengerId
                  ? `/athlete/${challenge.challengerId}`
                  : undefined
              }
            />
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setSelectedChallenge(challenge)}
            >
              Respond
            </Button>
          </div>
        ))}
      </div>

      {selectedChallenge && (
        <ChallengeResponseSheet
          challenge={selectedChallenge}
          currentAthleteElo={currentAthleteElo}
          open={!!selectedChallenge}
          onOpenChange={(open) => {
            if (!open) setSelectedChallenge(null);
          }}
        />
      )}
    </>
  );
}

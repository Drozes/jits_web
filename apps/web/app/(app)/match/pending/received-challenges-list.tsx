"use client";

import { useState } from "react";
import { MatchCard } from "@/components/domain/match-card";
import { ChallengeResponseSheet } from "@/components/domain/challenge-response-sheet";
import { ExpiryBadge } from "@/components/domain/expiry-badge";
import { Button } from "@/components/ui/button";

export interface ReceivedChallenge {
  id: string;
  challengerName: string;
  challengerId: string | undefined;
  challengerElo: number;
  challengerWeight: number | null;
  matchType: "casual" | "ranked";
  expiresAt: string;
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
              matchType={challenge.matchType}
              status="Pending"
              date={challenge.date}
              href={`/match/lobby/${challenge.id}`}
            />
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => setSelectedChallenge(challenge)}
              >
                Respond
              </Button>
              <ExpiryBadge expiresAt={challenge.expiresAt} />
            </div>
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

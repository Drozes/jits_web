"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MatchCard } from "@/components/domain/match-card";
import { ExpiryBadge } from "@/components/domain/expiry-badge";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export interface SentChallenge {
  id: string;
  opponentName: string;
  opponentId: string | undefined;
  matchType: string;
  expiresAt: string;
  date: string;
}

interface SentChallengesListProps {
  challenges: SentChallenge[];
}

export function SentChallengesList({ challenges }: SentChallengesListProps) {
  const router = useRouter();
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCancel(challengeId: string) {
    setCancellingId(challengeId);
    setError(null);

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("challenges")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", challengeId)
      .eq("status", "pending");

    setCancellingId(null);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {challenges.map((challenge) => (
        <div key={challenge.id} className="flex flex-col gap-1.5">
          <MatchCard
            type="challenge"
            opponentName={challenge.opponentName}
            matchType={challenge.matchType as "ranked" | "casual"}
            status="Pending"
            date={challenge.date}
            href={`/match/lobby/${challenge.id}`}
          />
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-destructive hover:text-destructive"
              onClick={() => handleCancel(challenge.id)}
              disabled={cancellingId === challenge.id}
            >
              <X className="mr-1.5 h-3.5 w-3.5" />
              {cancellingId === challenge.id ? "Cancelling..." : "Cancel"}
            </Button>
            <ExpiryBadge expiresAt={challenge.expiresAt} />
          </div>
        </div>
      ))}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cancelChallenge, startMatchFromChallenge } from "@jits/shared/api/mutations";
import { ChallengeResponseSheet } from "@/components/domain/challenge-response-sheet";
import { ExpiryBadge } from "@/components/domain/expiry-badge";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import type { MatchType } from "@jits/shared/constants";

interface ChallengeVersusActionsProps {
  challengeId: string;
  isSender: boolean;
  expiresAt: string;
  challengerName: string;
  challengerElo: number;
  challengerWeight: number | null;
  matchType: MatchType;
  currentAthleteElo: number;
}

export function ChallengeVersusActions({
  challengeId, isSender, expiresAt,
  challengerName, challengerElo, challengerWeight,
  matchType, currentAthleteElo,
}: ChallengeVersusActionsProps) {
  const router = useRouter();
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [responseOpen, setResponseOpen] = useState(false);

  async function handleCancel() {
    setCancelling(true);
    setError(null);
    const supabase = createClient();
    const result = await cancelChallenge(supabase, challengeId);
    if (!result.ok) { setCancelling(false); setError(result.error.message); return; }
    if (!result.data.cancelled) {
      // No row changed (a 0-row update is not an error): the challenge was
      // already over, or the opponent has just started the match. The RPC is
      // idempotent and returns an existing match, so join it rather than
      // leave the opponent in it alone (Arena parity, 91c08de).
      const started = await startMatchFromChallenge(supabase, challengeId);
      if (started.ok) {
        router.push(`/arena/match/${started.data.match_id}`);
        return;
      }
    }
    setCancelling(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      {error && <p className="text-xs text-destructive flex-1">{error}</p>}

      {isSender ? (
        <Button
          variant="outline" size="sm"
          className="flex-1 text-destructive hover:text-destructive"
          onClick={handleCancel} disabled={cancelling}
        >
          <X className="mr-1.5 h-3.5 w-3.5" />
          {cancelling ? "Cancelling..." : "Cancel"}
        </Button>
      ) : (
        <>
          <Button variant="outline" size="sm" className="flex-1" onClick={() => setResponseOpen(true)}>
            Respond
          </Button>
          <ChallengeResponseSheet
            challenge={{ id: challengeId, challengerName, challengerElo, challengerWeight, matchType }}
            currentAthleteElo={currentAthleteElo}
            open={responseOpen}
            onOpenChange={setResponseOpen}
          />
        </>
      )}

      <ExpiryBadge expiresAt={expiresAt} />
    </div>
  );
}

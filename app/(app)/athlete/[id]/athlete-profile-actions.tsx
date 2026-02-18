"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CompareStatsModal, type HeadToHeadMatch } from "@/components/domain/compare-stats-modal";
import { ChallengeSheet } from "@/components/domain/challenge-sheet";
import { Swords, BarChart3, MessageSquare } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface AthleteStats {
  displayName: string;
  elo: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  weight: number | null;
}

interface AthleteProfileActionsProps {
  competitorId: string;
  currentAthleteId: string;
  currentAthlete: AthleteStats;
  competitor: AthleteStats;
  headToHead: HeadToHeadMatch[];
  pendingChallengeId: string | null;
  lookingForRanked?: boolean;
}

export function AthleteProfileActions({
  competitorId,
  currentAthleteId,
  currentAthlete,
  competitor,
  headToHead,
  pendingChallengeId,
  lookingForRanked,
}: AthleteProfileActionsProps) {
  const [compareOpen, setCompareOpen] = useState(false);
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [messagingLoading, setMessagingLoading] = useState(false);
  const router = useRouter();

  const isSelf = currentAthleteId === competitorId;

  async function handleMessage() {
    setMessagingLoading(true);
    try {
      const supabase = createClient();
      const { data } = await supabase.rpc("create_direct_conversation", {
        p_other_athlete_id: competitorId,
      });
      const result = data as unknown as { conversation_id: string } | null;
      if (result?.conversation_id) {
        router.push(`/messages/${result.conversation_id}`);
      }
    } finally {
      setMessagingLoading(false);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        {!isSelf && (
          pendingChallengeId ? (
            <Button className="w-full bg-amber-500 hover:bg-amber-600 text-white" asChild>
              <Link href={`/athlete/${competitorId}/challenges`}>
                <Swords className="mr-2 h-4 w-4" />
                View Challenge
              </Link>
            </Button>
          ) : (
            <Button className="w-full" onClick={() => setChallengeOpen(true)}>
              <Swords className="mr-2 h-4 w-4" />
              Challenge
            </Button>
          )
        )}
        <div className="flex gap-2">
          {!isSelf && (
            <Button
              className="flex-1"
              variant="outline"
              onClick={handleMessage}
              disabled={messagingLoading}
            >
              <MessageSquare className="mr-2 h-4 w-4" />
              Message
            </Button>
          )}
          <Button
            className={isSelf ? "w-full" : "flex-1"}
            variant="outline"
            onClick={() => setCompareOpen(true)}
          >
            <BarChart3 className="mr-2 h-4 w-4" />
            Compare Stats
          </Button>
        </div>
      </div>

      {!isSelf && !pendingChallengeId && (
        <ChallengeSheet
          competitorId={competitorId}
          competitorName={competitor.displayName}
          competitorElo={competitor.elo}
          competitorWeight={competitor.weight}
          currentAthleteElo={currentAthlete.elo}
          currentAthleteWeight={currentAthlete.weight}
          defaultMatchType={lookingForRanked ? "ranked" : undefined}
          open={challengeOpen}
          onOpenChange={setChallengeOpen}
        />
      )}

      <CompareStatsModal
        currentAthlete={currentAthlete}
        competitor={competitor}
        headToHead={headToHead}
        open={compareOpen}
        onOpenChange={setCompareOpen}
      />
    </>
  );
}

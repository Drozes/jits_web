"use client";

import { useState } from "react";
import Link from "next/link";
import { Swords, BarChart3 } from "lucide-react";
import {
  CompareStatsModal,
  type HeadToHeadMatch,
} from "@/components/domain/compare-stats-modal";
import { ChallengeSheet } from "@/components/domain/challenge-sheet";

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
}

export function AthleteProfileActions({
  competitorId,
  currentAthleteId,
  currentAthlete,
  competitor,
  headToHead,
  pendingChallengeId,
}: AthleteProfileActionsProps) {
  const [compareOpen, setCompareOpen] = useState(false);
  const [challengeOpen, setChallengeOpen] = useState(false);
  const isSelf = currentAthleteId === competitorId;

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {!isSelf ? (
          pendingChallengeId ? (
            <Link
              href={`/athlete/${competitorId}/challenges`}
              className="font-heading uppercase grid items-center justify-center"
              style={primaryBtnStyle}
            >
              <span className="inline-flex items-center gap-2">
                <Swords className="h-4 w-4" />
                View Challenge
              </span>
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setChallengeOpen(true)}
              className="font-heading uppercase inline-flex items-center justify-center gap-2"
              style={primaryBtnStyle}
            >
              <Swords className="h-4 w-4" />
              Challenge
            </button>
          )
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={() => setCompareOpen(true)}
          className="font-heading uppercase inline-flex items-center justify-center gap-2"
          style={secondaryBtnStyle}
        >
          <BarChart3 className="h-4 w-4" />
          Compare
        </button>
      </div>

      {!isSelf && !pendingChallengeId && (
        <ChallengeSheet
          competitorId={competitorId}
          competitorName={competitor.displayName}
          competitorElo={competitor.elo}
          competitorWeight={competitor.weight}
          currentAthleteElo={currentAthlete.elo}
          currentAthleteWeight={currentAthlete.weight}
          defaultMatchType={undefined}
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

const primaryBtnStyle: React.CSSProperties = {
  fontFamily: "var(--font-heading)",
  fontWeight: 700,
  fontSize: "var(--size-label-m)",
  letterSpacing: "var(--ls-caps)",
  padding: "var(--space-3) var(--space-4)",
  background: "var(--accent-cta)",
  color: "var(--text-on-accent)",
  border: "1px solid transparent",
  borderRadius: "var(--radius-sm)",
  cursor: "pointer",
  textDecoration: "none",
};

const secondaryBtnStyle: React.CSSProperties = {
  fontFamily: "var(--font-heading)",
  fontWeight: 700,
  fontSize: "var(--size-label-m)",
  letterSpacing: "var(--ls-caps)",
  padding: "var(--space-3) var(--space-4)",
  background: "transparent",
  color: "var(--text-primary)",
  border: "1px solid var(--border-hairline-strong)",
  borderRadius: "var(--radius-sm)",
  cursor: "pointer",
};

"use client";

import { useEffect, useState } from "react";
import { Swords, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getEloStakes } from "@jits/shared/api/queries";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MATCH_TYPE, type MatchType } from "@jits/shared/constants";
import type { EloStakes } from "@jits/shared/types/composites";
import type { LobbyParticipant } from "@jits/shared/types/session";

interface SessionChallengeSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  currentAthleteElo: number;
  currentAthleteWeight: number | null;
  currentAthleteName: string;
  opponent: LobbyParticipant;
  onSendChallenge: (matchType: MatchType) => void;
}

export function SessionChallengeSheet({
  open, onOpenChange, currentAthleteElo, currentAthleteWeight,
  opponent, onSendChallenge,
}: SessionChallengeSheetProps) {
  const [stakes, setStakes] = useState<EloStakes | null>(null);

  useEffect(() => {
    if (!open) { setStakes(null); return; }
    const supabase = createClient();
    getEloStakes(
      supabase,
      currentAthleteElo,
      opponent.currentElo,
      currentAthleteWeight ?? undefined,
      opponent.currentWeight ?? undefined,
    ).then((result) => { if (result) setStakes(result); });
  }, [open, currentAthleteElo, opponent.currentElo, currentAthleteWeight, opponent.currentWeight]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] rounded-t-2xl">
        <div className="overflow-y-auto px-6 pb-10">
          <SheetHeader className="px-0">
            <SheetTitle className="flex items-center gap-2 text-lg">
              <Swords className="h-5 w-5" />
              Challenge {opponent.displayName}
            </SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-4 pt-2">
            <p className="text-sm text-muted-foreground">
              ELO <span className="tabular-nums font-semibold text-foreground">{opponent.currentElo}</span>
              {opponent.currentWeight && <> &middot; {opponent.currentWeight} lbs</>}
            </p>
            {stakes && <StakesPreview stakes={stakes} />}
            <Button className="h-12 text-base" onClick={() => onSendChallenge(MATCH_TYPE.RANKED)}>Send Challenge</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function StakesPreview({ stakes }: { stakes: EloStakes }) {
  return (
    <Card className="bg-primary/5 border-primary/20">
      <CardContent className="p-3">
        <p className="text-xs font-medium mb-2">ELO Stakes</p>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div
            className="flex items-center gap-1.5"
            aria-label={`Win: +${stakes.challenger_win} ELO`}
          >
            <TrendingUp className="h-3.5 w-3.5 text-success" aria-hidden="true" />
            <span>Win: <span className="font-semibold text-success">+{stakes.challenger_win}</span></span>
          </div>
          <div
            className="flex items-center gap-1.5"
            aria-label={`Draw: ${stakes.challenger_draw} ELO`}
          >
            <Minus className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
            <span>Draw: <span className="font-semibold text-amber-500">{stakes.challenger_draw}</span></span>
          </div>
          <div
            className="flex items-center gap-1.5"
            aria-label={`Loss: ${stakes.challenger_loss} ELO`}
          >
            <TrendingDown className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
            <span>Loss: <span className="font-semibold text-destructive">{stakes.challenger_loss}</span></span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

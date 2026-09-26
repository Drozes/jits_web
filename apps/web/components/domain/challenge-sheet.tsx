"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { canCreateChallenge } from "@jits/shared/api/queries";
import { arenaActions, useArenaState } from "@/lib/arena/arena-store";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Swords, TrendingUp, TrendingDown, Minus, AlertCircle, Loader2 } from "lucide-react";
import type { EloStakes } from "@jits/shared/types/composites";
import { MATCH_TYPE, type MatchType } from "@jits/shared/constants";

interface ChallengeSheetProps {
  competitorId: string;
  competitorName: string;
  competitorElo: number;
  competitorWeight: number | null;
  currentAthleteElo: number;
  currentAthleteWeight: number | null;
  /** @deprecated All matches are now ranked. Ignored. */
  defaultMatchType?: MatchType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Challenge from an athlete profile. Sends through the app-wide Arena
 * handshake (`arenaActions.sendChallenge`, owned by <ArenaBootstrap />), so the
 * challenger gets the same waiting bar, accept subscription and match entry
 * as a challenge sent from the Arena. Creating the row directly left a live
 * opponent who accepted alone in the match. Weight is not entered here: the
 * Arena sends the athlete's profile weight and the match wizard verifies it.
 */
export function ChallengeSheet({
  competitorId,
  competitorName,
  competitorElo,
  competitorWeight,
  currentAthleteElo,
  currentAthleteWeight,
  open,
  onOpenChange,
}: ChallengeSheetProps) {
  const matchType = MATCH_TYPE.RANKED;
  const arena = useArenaState();
  const [stakes, setStakes] = useState<EloStakes | null>(null);
  const [canChallenge, setCanChallenge] = useState<boolean | null>(null);
  // One Arena challenge at a time: an open prompt or a sent one blocks this.
  const arenaBlocked = arena.isBusy || !!arena.outgoing || !!arena.incoming;

  useEffect(() => {
    if (!open) {
      setCanChallenge(null);
      return;
    }
    let cancelled = false;
    const supabase = createClient();
    canCreateChallenge(supabase, competitorId).then((ok) => {
      if (!cancelled) setCanChallenge(ok);
    });
    return () => { cancelled = true; };
  }, [open, competitorId]);

  useEffect(() => {
    if (!open) {
      setStakes(null);
      return;
    }
    const supabase = createClient();
    supabase
      .rpc("calculate_elo_stakes", {
        challenger_elo: currentAthleteElo,
        opponent_elo: competitorElo,
        ...(currentAthleteWeight ? { challenger_weight: currentAthleteWeight } : {}),
        ...(competitorWeight ? { opponent_weight: competitorWeight } : {}),
      })
      .then(({ data }) => {
        if (data) setStakes(data as EloStakes);
      });
  }, [matchType, open, currentAthleteElo, competitorElo, currentAthleteWeight, competitorWeight]);

  function resetState() {
    setStakes(null);
    setCanChallenge(null);
  }

  function handleSubmit() {
    if (arenaBlocked) return;
    // The Arena owner toasts a failure itself; on success its waiting bar
    // (the app-wide overlay) takes over from this sheet.
    void arenaActions.sendChallenge(competitorId, competitorName);
    onOpenChange(false);
    resetState();
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) resetState();
      }}
    >
      <SheetContent side="bottom" className="max-h-[85vh] rounded-t-2xl">
        <div className="overflow-y-auto px-6 pb-10">
        <SheetHeader className="px-0">
          <SheetTitle className="flex items-center gap-2 text-lg">
            <Swords className="h-5 w-5" />
            Challenge {competitorName}
          </SheetTitle>
        </SheetHeader>

        {canChallenge === null && open ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : canChallenge === false ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <AlertCircle className="h-10 w-10 text-muted-foreground" />
            <p className="font-semibold">Can&apos;t Challenge</p>
            <p className="text-sm text-muted-foreground text-center">
              You have too many pending challenges or this opponent is currently unavailable.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-6 pt-2">
            {/* ELO Stakes Preview */}
            {stakes && (
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-3">
                  <p className="text-xs font-medium mb-2">ELO Stakes</p>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div className="flex items-center gap-1.5">
                      <TrendingUp className="h-3.5 w-3.5 text-success" />
                      <span>Win: <span className="font-semibold text-success">+{stakes.challenger_win}</span></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Minus className="h-3.5 w-3.5 text-amber-500" />
                      <span>Draw: <span className="font-semibold text-amber-500">{stakes.challenger_draw}</span></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <TrendingDown className="h-3.5 w-3.5 text-destructive" />
                      <span>Loss: <span className="font-semibold text-destructive">{stakes.challenger_loss}</span></span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Win probability: {Math.round(stakes.challenger_expected * 100)}%
                    {stakes.weight_division_gap > 0 && (
                      <> &middot; {stakes.weight_division_gap} weight class{stakes.weight_division_gap > 1 ? "es" : ""} apart</>
                    )}
                  </p>
                </CardContent>
              </Card>
            )}

            {arenaBlocked && (
              <p className="text-sm text-muted-foreground">
                Finish your current Arena challenge first.
              </p>
            )}

            <Button
              onClick={handleSubmit}
              disabled={arenaBlocked}
              className="h-12 text-base mt-1"
            >
              Send Challenge
            </Button>
          </div>
        )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

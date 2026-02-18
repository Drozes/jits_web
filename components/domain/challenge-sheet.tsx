"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createChallenge } from "@/lib/api/mutations";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Swords, TrendingUp, TrendingDown, Minus, Check } from "lucide-react";
import type { EloStakes } from "@/types/composites";
import { MATCH_TYPE, type MatchType } from "@/lib/constants";

interface ChallengeSheetProps {
  competitorId: string;
  competitorName: string;
  competitorElo: number;
  competitorWeight: number | null;
  currentAthleteElo: number;
  currentAthleteWeight: number | null;
  defaultMatchType?: MatchType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChallengeSheet({
  competitorId,
  competitorName,
  competitorElo,
  competitorWeight,
  currentAthleteElo,
  defaultMatchType,
  currentAthleteWeight,
  open,
  onOpenChange,
}: ChallengeSheetProps) {
  const router = useRouter();
  const [matchType, setMatchType] = useState<MatchType>(defaultMatchType ?? MATCH_TYPE.CASUAL);
  const [weight, setWeight] = useState(currentAthleteWeight?.toString() ?? "");
  const [stakes, setStakes] = useState<EloStakes | null>(null);
  const [weightConfirmed, setWeightConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (matchType !== MATCH_TYPE.RANKED || !open) {
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
    setMatchType(defaultMatchType ?? MATCH_TYPE.CASUAL);
    setWeight(currentAthleteWeight?.toString() ?? "");
    setStakes(null);
    setWeightConfirmed(false);
    setError(null);
    setSuccess(false);
  }

  async function handleSubmit() {
    const parsedWeight = weight ? parseFloat(weight) : null;
    if (!parsedWeight || parsedWeight <= 0 || parsedWeight > 500) {
      setError("Please enter a valid weight");
      return;
    }

    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    const result = await createChallenge(supabase, {
      opponentId: competitorId,
      matchType,
      challengerWeight: parsedWeight ?? undefined,
    });

    setSubmitting(false);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    setSuccess(true);
    setTimeout(() => {
      onOpenChange(false);
      resetState();
      router.refresh();
    }, 1500);
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

        {success ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <Check className="h-6 w-6 text-green-600" />
            </div>
            <p className="font-semibold">Challenge Sent!</p>
            <p className="text-sm text-muted-foreground">
              Waiting for {competitorName} to respond
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-6 pt-2">
            {/* Match Type */}
            <div className="flex flex-col gap-3">
              <Label className="text-sm font-medium">Match Type</Label>
              <div className="flex gap-3">
                <Button
                  variant={matchType === MATCH_TYPE.CASUAL ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setMatchType(MATCH_TYPE.CASUAL)}
                  type="button"
                >
                  Casual
                </Button>
                <Button
                  variant={matchType === MATCH_TYPE.RANKED ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setMatchType(MATCH_TYPE.RANKED)}
                  type="button"
                >
                  Ranked
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {matchType === MATCH_TYPE.CASUAL
                  ? "Practice match — no ELO changes"
                  : "Competitive match — ELO at stake"}
              </p>
            </div>

            {/* ELO Stakes Preview */}
            {matchType === MATCH_TYPE.RANKED && stakes && (
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-3">
                  <p className="text-xs font-medium mb-2">ELO Stakes</p>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div className="flex items-center gap-1.5">
                      <TrendingUp className="h-3.5 w-3.5 text-green-500" />
                      <span>Win: <span className="font-semibold text-green-500">+{stakes.challenger_win}</span></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Minus className="h-3.5 w-3.5 text-amber-500" />
                      <span>Draw: <span className="font-semibold text-amber-500">{stakes.challenger_draw}</span></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                      <span>Loss: <span className="font-semibold text-red-500">{stakes.challenger_loss}</span></span>
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

            {/* Weight */}
            <div className="flex flex-col gap-3">
              <Label htmlFor="challenge-weight" className="text-sm font-medium">Your Weight (lbs)</Label>
              <Input
                id="challenge-weight"
                type="number"
                value={weight}
                onChange={(e) => { setWeight(e.target.value); setWeightConfirmed(false); }}
                placeholder="e.g. 155"
                min={1}
                max={500}
                step="0.1"
                className="h-11"
              />
            </div>

            {/* Weight Confirmation */}
            <div className="flex items-center gap-3">
              <Checkbox
                id="confirm-weight"
                checked={weightConfirmed}
                onCheckedChange={(checked) => setWeightConfirmed(checked === true)}
              />
              <Label htmlFor="confirm-weight" className="text-sm leading-tight">
                I confirm my weight is accurate
              </Label>
            </div>

            {error && (
              <div className="rounded-lg bg-destructive/10 px-4 py-3">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <Button
              onClick={handleSubmit}
              disabled={submitting || !weight || !weightConfirmed}
              className="h-12 text-base mt-1"
            >
              {submitting ? "Sending..." : "Send Challenge"}
            </Button>
          </div>
        )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

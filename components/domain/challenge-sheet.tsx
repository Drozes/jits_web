"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
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
import { Swords, TrendingUp, TrendingDown, Check } from "lucide-react";

interface ChallengeSheetProps {
  competitorId: string;
  competitorName: string;
  competitorElo: number;
  currentAthleteElo: number;
  currentAthleteWeight: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface EloStakes {
  challenger_win: number;
  challenger_loss: number;
  opponent_win: number;
  opponent_loss: number;
  challenger_expected: number;
  opponent_expected: number;
}

export function ChallengeSheet({
  competitorId,
  competitorName,
  competitorElo,
  currentAthleteElo,
  currentAthleteWeight,
  open,
  onOpenChange,
}: ChallengeSheetProps) {
  const router = useRouter();
  const [matchType, setMatchType] = useState<"casual" | "ranked">("casual");
  const [weight, setWeight] = useState(currentAthleteWeight?.toString() ?? "");
  const [stakes, setStakes] = useState<EloStakes | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (matchType !== "ranked" || !open) {
      setStakes(null);
      return;
    }
    const supabase = createClient();
    supabase
      .rpc("calculate_elo_stakes", {
        challenger_elo: currentAthleteElo,
        opponent_elo: competitorElo,
      })
      .then(({ data }) => {
        if (data) setStakes(data as EloStakes);
      });
  }, [matchType, open, currentAthleteElo, competitorElo]);

  function resetState() {
    setMatchType("casual");
    setWeight(currentAthleteWeight?.toString() ?? "");
    setStakes(null);
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
    const { error: insertError } = await supabase.from("challenges").insert({
      opponent_id: competitorId,
      match_type: matchType,
      challenger_weight: parsedWeight,
    });

    setSubmitting(false);

    if (insertError) {
      if (insertError.code === "42501") {
        setError("You already have 3 pending challenges. Wait for a response or cancel one first.");
      } else {
        setError(insertError.message);
      }
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
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Swords className="h-5 w-5" />
            Challenge {competitorName}
          </SheetTitle>
        </SheetHeader>

        {success ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <Check className="h-6 w-6 text-green-600" />
            </div>
            <p className="font-semibold">Challenge Sent!</p>
            <p className="text-sm text-muted-foreground">
              Waiting for {competitorName} to respond
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 pt-4">
            {/* Match Type */}
            <div className="flex flex-col gap-2">
              <Label>Match Type</Label>
              <div className="flex gap-2">
                <Button
                  variant={matchType === "casual" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setMatchType("casual")}
                  type="button"
                >
                  Casual
                </Button>
                <Button
                  variant={matchType === "ranked" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setMatchType("ranked")}
                  type="button"
                >
                  Ranked
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {matchType === "casual"
                  ? "Practice match — no ELO changes"
                  : "Competitive match — ELO at stake"}
              </p>
            </div>

            {/* ELO Stakes Preview */}
            {matchType === "ranked" && stakes && (
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-3">
                  <p className="text-xs font-medium mb-2">ELO Stakes</p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex items-center gap-1.5">
                      <TrendingUp className="h-3.5 w-3.5 text-green-500" />
                      <span>Win: <span className="font-semibold text-green-500">+{stakes.challenger_win}</span></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                      <span>Loss: <span className="font-semibold text-red-500">{stakes.challenger_loss}</span></span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Win probability: {Math.round(stakes.challenger_expected * 100)}%
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Weight */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="challenge-weight">Your Weight (lbs)</Label>
              <Input
                id="challenge-weight"
                type="number"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="e.g. 155"
                min={1}
                max={500}
                step="0.1"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button
              onClick={handleSubmit}
              disabled={submitting || !weight}
            >
              {submitting ? "Sending..." : "Send Challenge"}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

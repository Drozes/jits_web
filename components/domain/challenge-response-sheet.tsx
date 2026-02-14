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
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Swords,
  TrendingUp,
  TrendingDown,
  Check,
  Scale,
} from "lucide-react";
import type { EloStakes } from "@/types/composites";
import { MATCH_TYPE, type MatchType } from "@/lib/constants";

interface ChallengeResponseSheetProps {
  challenge: {
    id: string;
    challengerName: string;
    challengerElo: number;
    challengerWeight: number | null;
    matchType: MatchType;
  };
  currentAthleteElo: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChallengeResponseSheet({
  challenge,
  currentAthleteElo,
  open,
  onOpenChange,
}: ChallengeResponseSheetProps) {
  const router = useRouter();
  const [weight, setWeight] = useState("");
  const [stakes, setStakes] = useState<EloStakes | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<"accepted" | "declined" | null>(null);

  useEffect(() => {
    if (challenge.matchType !== MATCH_TYPE.RANKED || !open) {
      setStakes(null);
      return;
    }
    const supabase = createClient();
    supabase
      .rpc("calculate_elo_stakes", {
        challenger_elo: challenge.challengerElo,
        opponent_elo: currentAthleteElo,
      })
      .then(({ data }) => {
        if (data) setStakes(data as EloStakes);
      });
  }, [challenge.matchType, challenge.challengerElo, currentAthleteElo, open]);

  function resetState() {
    setWeight("");
    setStakes(null);
    setError(null);
    setSuccess(null);
  }

  async function handleAccept() {
    const parsedWeight = parseFloat(weight);
    if (!parsedWeight || parsedWeight <= 0 || parsedWeight > 500) {
      setError("Please enter a valid weight (1–500 lbs)");
      return;
    }

    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("challenges")
      .update({
        status: "accepted",
        opponent_weight: parsedWeight,
        updated_at: new Date().toISOString(),
      })
      .eq("id", challenge.id)
      .eq("status", "pending");

    setSubmitting(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSuccess("accepted");
    setTimeout(() => {
      onOpenChange(false);
      resetState();
      router.refresh();
    }, 1500);
  }

  async function handleDecline() {
    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("challenges")
      .update({
        status: "declined",
        updated_at: new Date().toISOString(),
      })
      .eq("id", challenge.id)
      .eq("status", "pending");

    setSubmitting(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSuccess("declined");
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
            Challenge from {challenge.challengerName}
          </SheetTitle>
        </SheetHeader>

        {success ? (
          <SuccessState
            type={success}
            challengerName={challenge.challengerName}
          />
        ) : (
          <div className="flex flex-col gap-4 pt-4">
            {/* Challenger Info */}
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-medium">
                  {challenge.challengerName}
                </p>
                <p className="text-xs text-muted-foreground">
                  ELO: <span className="text-primary font-semibold">{challenge.challengerElo}</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                {challenge.challengerWeight && (
                  <Badge variant="outline" className="gap-1">
                    <Scale className="h-3 w-3" />
                    {challenge.challengerWeight} lbs
                  </Badge>
                )}
                <Badge
                  variant={challenge.matchType === MATCH_TYPE.RANKED ? "default" : "outline"}
                >
                  {challenge.matchType === MATCH_TYPE.RANKED ? "Ranked" : "Casual"}
                </Badge>
              </div>
            </div>

            {/* ELO Stakes (ranked only) */}
            {challenge.matchType === MATCH_TYPE.RANKED && stakes && (
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-3">
                  <p className="text-xs font-medium mb-2">Your ELO Stakes</p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex items-center gap-1.5">
                      <TrendingUp className="h-3.5 w-3.5 text-green-500" />
                      <span>
                        Win:{" "}
                        <span className="font-semibold text-green-500">
                          +{stakes.opponent_win}
                        </span>
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                      <span>
                        Loss:{" "}
                        <span className="font-semibold text-red-500">
                          {stakes.opponent_loss}
                        </span>
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Your win probability:{" "}
                    {Math.round(stakes.opponent_expected * 100)}%
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Weight Input */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="response-weight">Your Weight (lbs)</Label>
              <Input
                id="response-weight"
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

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleDecline}
                disabled={submitting}
              >
                {submitting ? "..." : "Decline"}
              </Button>
              <Button
                className="flex-1"
                onClick={handleAccept}
                disabled={submitting || !weight}
              >
                {submitting ? "Accepting..." : "Accept"}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function SuccessState({
  type,
  challengerName,
}: {
  type: "accepted" | "declined";
  challengerName: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-8">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
        <Check className="h-6 w-6 text-green-600" />
      </div>
      <p className="font-semibold">
        Challenge {type === "accepted" ? "Accepted" : "Declined"}!
      </p>
      <p className="text-sm text-muted-foreground">
        {type === "accepted"
          ? `Get ready to face ${challengerName}`
          : `Challenge from ${challengerName} declined`}
      </p>
    </div>
  );
}

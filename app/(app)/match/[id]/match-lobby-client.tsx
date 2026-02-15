"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Swords, TrendingUp, TrendingDown, Scale } from "lucide-react";
import { getInitials } from "@/lib/utils";
import { MATCH_TYPE, type MatchType } from "@/lib/constants";

interface LobbyAthlete {
  id: string;
  displayName: string;
  elo: number;
  weight: number | null;
}

interface MatchLobbyClientProps {
  challengeId: string;
  existingMatchId: string | null;
  matchType: MatchType;
  currentAthlete: LobbyAthlete;
  rivalAthlete: LobbyAthlete;
  eloStakes: { winDelta: number; lossDelta: number } | null;
}

export function MatchLobbyClient({
  challengeId,
  existingMatchId,
  matchType,
  currentAthlete,
  rivalAthlete,
  eloStakes,
}: MatchLobbyClientProps) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStartMatch() {
    setStarting(true);
    setError(null);

    const supabase = createClient();

    // Create match from challenge (idempotent)
    const matchId =
      existingMatchId ??
      (await (async () => {
        const { data, error: rpcError } = await supabase.rpc(
          "start_match_from_challenge",
          { p_challenge_id: challengeId },
        );
        if (rpcError) {
          setError(rpcError.message);
          setStarting(false);
          return null;
        }
        return data?.match_id ?? null;
      })());

    if (!matchId) return;

    router.push(`/match/${matchId}/live`);
  }

  async function handleCancel() {
    setCancelling(true);
    setError(null);

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("challenges")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", challengeId)
      .eq("status", "accepted");

    setCancelling(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    router.push("/match/pending");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {/* VS Header */}
      <div className="flex items-center justify-between gap-2">
        <AthleteColumn athlete={currentAthlete} label="You" />
        <div className="flex flex-col items-center gap-1">
          <Swords className="h-8 w-8 text-primary" />
          <span className="text-xs font-bold text-muted-foreground">VS</span>
        </div>
        <AthleteColumn athlete={rivalAthlete} />
      </div>

      {/* Match Type Badge */}
      <div className="flex justify-center">
        <Badge
          variant={matchType === MATCH_TYPE.RANKED ? "default" : "outline"}
          className="text-sm px-3 py-1"
        >
          {matchType === MATCH_TYPE.RANKED ? "Ranked Match" : "Casual Match"}
        </Badge>
      </div>

      {/* ELO Stakes (ranked only) */}
      {matchType === MATCH_TYPE.RANKED && eloStakes && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4">
            <p className="text-xs font-medium mb-3 text-center">
              Your ELO Stakes
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center justify-center gap-2 rounded-md bg-green-500/10 px-3 py-2">
                <TrendingUp className="h-4 w-4 text-green-600" />
                <span className="text-sm font-semibold text-green-600">
                  +{eloStakes.winDelta}
                </span>
              </div>
              <div className="flex items-center justify-center gap-2 rounded-md bg-red-500/10 px-3 py-2">
                <TrendingDown className="h-4 w-4 text-red-600" />
                <span className="text-sm font-semibold text-red-600">
                  {eloStakes.lossDelta}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {error && <p className="text-sm text-destructive text-center">{error}</p>}

      {/* Actions */}
      <div className="flex flex-col gap-3">
        <Button
          size="lg"
          className="w-full"
          onClick={handleStartMatch}
          disabled={starting || cancelling}
        >
          {starting ? "Creating match..." : "Start Match"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={handleCancel}
          disabled={starting || cancelling}
        >
          {cancelling ? "Cancelling..." : "Cancel Match"}
        </Button>
      </div>
    </div>
  );
}

function AthleteColumn({
  athlete,
  label,
}: {
  athlete: LobbyAthlete;
  label?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 flex-1">
      <Avatar className="h-16 w-16">
        <AvatarFallback className="text-lg font-bold">
          {getInitials(athlete.displayName)}
        </AvatarFallback>
      </Avatar>
      <div className="text-center">
        <p className="text-sm font-semibold leading-tight">
          {athlete.displayName}
        </p>
        {label && (
          <p className="text-xs text-muted-foreground">{label}</p>
        )}
      </div>
      <span className="text-primary font-bold tabular-nums text-sm">
        {athlete.elo} ELO
      </span>
      {athlete.weight && (
        <Badge variant="outline" className="gap-1 text-xs">
          <Scale className="h-3 w-3" />
          {athlete.weight} lbs
        </Badge>
      )}
    </div>
  );
}

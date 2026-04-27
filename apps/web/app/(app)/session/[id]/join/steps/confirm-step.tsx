"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { joinSessionLobby } from "@jits/shared/api/mutations";

interface ConfirmStepProps {
  sessionId: string;
  gymName: string;
  confirmedWeight: number;
  currentAthleteId: string;
  currentAthleteName: string;
  currentAthleteElo: number;
  currentAthletePhotoUrl: string | null;
}

export function ConfirmStep({
  sessionId, gymName, confirmedWeight,
  currentAthleteId, currentAthleteName, currentAthleteElo, currentAthletePhotoUrl,
}: ConfirmStepProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleJoin() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const result = await joinSessionLobby(supabase, { sessionId, confirmedWeight });
    setLoading(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    // Broadcast participant_joined so existing lobby members see the new athlete
    const channel = supabase.channel(`session:${sessionId}`);
    await channel.subscribe();
    await channel.send({
      type: "broadcast",
      event: "participant_joined",
      payload: {
        athleteId: currentAthleteId,
        displayName: currentAthleteName,
        currentElo: currentAthleteElo,
        currentWeight: confirmedWeight,
        profilePhotoUrl: currentAthletePhotoUrl,
        status: "checked_in",
      },
    });
    supabase.removeChannel(channel);

    router.push(`/session/${sessionId}/lobby`);
  }

  return (
    <div className="space-y-4 py-4">
      <h2 className="text-center text-lg font-semibold">Ready to join</h2>
      <Card className="rounded-2xl">
        <CardContent className="space-y-2 p-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Gym</span>
            <span className="font-medium">{gymName}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Weight</span>
            <span className="font-medium">{confirmedWeight} lbs</span>
          </div>
        </CardContent>
      </Card>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <Button onClick={handleJoin} disabled={loading} className="w-full rounded-xl">
        {loading ? "Joining..." : "Join Lobby"}
      </Button>
    </div>
  );
}

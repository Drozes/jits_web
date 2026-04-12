"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { joinSessionLobby } from "@/lib/api/mutations";

interface ConfirmStepProps {
  sessionId: string;
  gymName: string;
  confirmedWeight: number;
}

export function ConfirmStep({ sessionId, gymName, confirmedWeight }: ConfirmStepProps) {
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

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  startMatchFromChallenge,
  cancelChallenge,
} from "@/lib/api/mutations";
import { useLobbySync } from "@/hooks/use-lobby-sync";

interface LobbyActionsProps {
  challengeId: string;
}

export function LobbyActions({ challengeId }: LobbyActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { broadcastMatchStarted, broadcastCancelled } = useLobbySync({
    challengeId,
    onCancelled: () => router.push("/match/pending"),
  });

  async function handleStart() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const result = await startMatchFromChallenge(supabase, challengeId);
    if (!result.ok) {
      setError(result.error.message);
      setLoading(false);
      return;
    }
    const matchId = result.data.match_id!;
    broadcastMatchStarted(matchId);
    router.push(`/match/${matchId}/live`);
  }

  async function handleCancel() {
    setLoading(true);
    broadcastCancelled();
    const supabase = createClient();
    await cancelChallenge(supabase, challengeId);
    router.push("/match/pending");
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-sm text-red-500 text-center">{error}</p>
      )}
      <Button
        className="w-full"
        size="lg"
        onClick={handleStart}
        disabled={loading}
      >
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Start Match
      </Button>
      <Button
        variant="outline"
        className="w-full"
        onClick={handleCancel}
        disabled={loading}
      >
        Cancel
      </Button>
    </div>
  );
}

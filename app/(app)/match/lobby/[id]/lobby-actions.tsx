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

interface LobbyActionsProps {
  challengeId: string;
}

export function LobbyActions({ challengeId }: LobbyActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    router.push(`/match/${result.data.match_id}/live`);
  }

  async function handleCancel() {
    setLoading(true);
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

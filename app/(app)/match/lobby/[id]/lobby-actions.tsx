"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import {
  startMatchFromChallenge,
  acceptChallenge,
  declineChallenge,
  cancelChallenge,
} from "@/lib/api/mutations";
import { useLobbySync } from "@/hooks/use-lobby-sync";

interface LobbyActionsProps {
  challengeId: string;
  status: "pending" | "accepted";
  isChallenger: boolean;
  currentWeight?: number | null;
}

export function LobbyActions({ challengeId, status, isChallenger, currentWeight }: LobbyActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weight, setWeight] = useState(currentWeight?.toString() ?? "");
  const [weightConfirmed, setWeightConfirmed] = useState(false);

  const { broadcastMatchStarted, broadcastCancelled, broadcastAccepted } = useLobbySync({
    challengeId,
    onCancelled: () => router.push("/match/pending"),
    onAccepted: status === "pending" && isChallenger ? () => router.refresh() : undefined,
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
    const matchId = result.data.match_id;
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

  async function handleAccept() {
    const parsedWeight = parseFloat(weight);
    if (!parsedWeight || parsedWeight <= 0 || parsedWeight > 500) {
      setError("Please enter a valid weight (1-500 lbs)");
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const result = await acceptChallenge(supabase, { challengeId, opponentWeight: parsedWeight });
    if (!result.ok) {
      setError(result.error.message);
      setLoading(false);
      return;
    }
    broadcastAccepted();
    router.refresh();
  }

  async function handleDecline() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const result = await declineChallenge(supabase, challengeId);
    if (!result.ok) {
      setError(result.error.message);
      setLoading(false);
      return;
    }
    router.push("/match/pending");
  }

  // Accepted — both athletes can start the match
  if (status === "accepted") {
    return (
      <div className="space-y-3">
        {error && <p className="text-sm text-red-500 text-center">{error}</p>}
        <Button className="w-full" size="lg" onClick={handleStart} disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Start Match
        </Button>
        <Button variant="outline" className="w-full" onClick={handleCancel} disabled={loading}>
          Cancel
        </Button>
      </div>
    );
  }

  // Pending — challenger is waiting for opponent to respond
  if (isChallenger) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-2 py-4">
          <Clock className="h-6 w-6 text-muted-foreground animate-pulse" />
          <p className="text-sm text-muted-foreground text-center">
            Waiting for your opponent to respond...
          </p>
        </div>
        {error && <p className="text-sm text-red-500 text-center">{error}</p>}
        <Button variant="outline" className="w-full" onClick={handleCancel} disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Cancel Challenge
        </Button>
      </div>
    );
  }

  // Pending — opponent needs to accept or decline
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="lobby-weight" className="text-sm font-medium">Your Weight (lbs)</Label>
        <Input
          id="lobby-weight"
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
      <div className="flex items-center gap-3">
        <Checkbox
          id="confirm-lobby-weight"
          checked={weightConfirmed}
          onCheckedChange={(checked) => setWeightConfirmed(checked === true)}
        />
        <Label htmlFor="confirm-lobby-weight" className="text-sm leading-tight">
          I confirm my weight is accurate
        </Label>
      </div>
      {error && <p className="text-sm text-red-500 text-center">{error}</p>}
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={handleDecline} disabled={loading}>
          {loading ? "..." : "Decline"}
        </Button>
        <Button className="flex-1" onClick={handleAccept} disabled={loading || !weight || !weightConfirmed}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Accept
        </Button>
      </div>
    </div>
  );
}

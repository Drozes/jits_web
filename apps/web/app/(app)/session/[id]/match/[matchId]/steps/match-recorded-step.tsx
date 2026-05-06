"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Share2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BroadcastResult } from "@jits/shared/hooks/use-session-match-sync";
import { buildShareUrl, buildShareText } from "@jits/shared/utils";

interface MatchRecordedStepProps {
  sessionId: string;
  matchId: string;
  currentAthleteId: string;
  resultData: BroadcastResult | null;
}

function deriveOutcome(resultData: BroadcastResult | null, currentAthleteId: string): "win" | "loss" | "draw" | null {
  if (!resultData) return null;
  if (resultData.result === "draw") return "draw";
  return resultData.winnerId === currentAthleteId ? "win" : "loss";
}

export function MatchRecordedStep({ sessionId, currentAthleteId, resultData }: MatchRecordedStepProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const outcome = deriveOutcome(resultData, currentAthleteId);

  async function handleShare() {
    if (!outcome) return;
    const url = buildShareUrl("athlete", currentAthleteId);
    const text = buildShareText({
      type: "match-result",
      data: { outcome },
    });
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: "ELO RATED Match Result", text, url });
        return;
      } catch { /* user cancelled or not supported, fall through to copy */ }
    }
    await navigator.clipboard.writeText(`${text}\n${url}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4">
      <div className="animate-scale-in">
        <CheckCircle2 className="h-16 w-16 text-green-500" />
      </div>
      <h2 className="text-xl font-bold">Match Recorded!</h2>
      <div className="flex flex-col gap-3 w-full max-w-sm">
        {outcome && (
          <Button variant="secondary" size="lg" onClick={handleShare}>
            {copied ? <Check className="mr-2 h-4 w-4 text-green-500" /> : <Share2 className="mr-2 h-4 w-4" />}
            {copied ? "Copied!" : "Share Result"}
          </Button>
        )}
        <Button size="lg" onClick={() => router.push(`/session/${sessionId}/lobby`)}>
          Back to Lobby
        </Button>
        <Button variant="outline" size="lg" onClick={() => router.push("/gyms")}>
          Exit Session
        </Button>
      </div>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MatchRecordedStepProps {
  sessionId: string;
  matchId: string;
}

export function MatchRecordedStep({ sessionId }: MatchRecordedStepProps) {
  const router = useRouter();

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4">
      <div className="animate-scale-in">
        <CheckCircle2 className="h-16 w-16 text-green-500" />
      </div>
      <h2 className="text-xl font-bold">Match Recorded!</h2>
      <div className="flex flex-col gap-3 w-full max-w-sm">
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

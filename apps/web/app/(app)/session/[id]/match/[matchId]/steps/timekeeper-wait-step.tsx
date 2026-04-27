"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSessionMatchSync } from "@/hooks/use-session-match-sync";

interface TimekeeperWaitStepProps {
  onNext: () => void;
  matchId: string;
}

export function TimekeeperWaitStep({ onNext, matchId }: TimekeeperWaitStepProps) {
  const [timedOut, setTimedOut] = useState(false);

  useSessionMatchSync({
    matchId,
    onReadySignal: () => onNext(),
  });

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), 30_000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4">
      {!timedOut ? (
        <>
          <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Waiting for timekeeper to connect...</p>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground text-center">
            Timekeeper hasn&apos;t connected. Continue without?
          </p>
          <Button onClick={onNext}>Continue</Button>
        </>
      )}
    </div>
  );
}

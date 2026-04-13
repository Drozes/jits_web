"use client";

import { useState } from "react";
import { Swords } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { InSessionChallenge } from "@/hooks/use-session-lobby-realtime";

interface SessionChallengeReceivedSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  challenge: InSessionChallenge | null;
  onRespond: (accept: boolean) => void;
}

export function SessionChallengeReceivedSheet({
  open,
  onOpenChange,
  challenge,
  onRespond,
}: SessionChallengeReceivedSheetProps) {
  const [accepting, setAccepting] = useState(false);

  if (!challenge) return null;

  async function handleAccept() {
    setAccepting(true);
    await onRespond(true);
    setAccepting(false);
    onOpenChange(false);
  }

  function handleDecline() {
    onRespond(false);
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] rounded-t-2xl">
        <div className="overflow-y-auto px-6 pb-10">
          <SheetHeader className="px-0">
            <SheetTitle className="flex items-center gap-2 text-lg">
              <Swords className="h-5 w-5" />
              Challenge Received
            </SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-4 pt-4">
            <div className="space-y-1">
              <p className="text-base font-semibold">{challenge.fromDisplayName}</p>
              <p className="text-sm text-muted-foreground">
                ELO <span className="tabular-nums font-semibold text-foreground">{challenge.fromElo}</span>
              </p>
              <Badge variant={challenge.matchType === "ranked" ? "default" : "secondary"}>
                {challenge.matchType === "ranked" ? "Ranked" : "Casual"}
              </Badge>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 h-12" onClick={handleDecline} disabled={accepting}>
                Decline
              </Button>
              <Button className="flex-1 h-12" onClick={handleAccept} disabled={accepting}>
                {accepting ? "Accepting..." : "Accept"}
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

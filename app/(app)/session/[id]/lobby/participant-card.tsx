"use client";

import { Swords } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getInitials } from "@/lib/utils";
import type { LobbyParticipant } from "@/types/session";

interface ParticipantCardProps {
  participant: LobbyParticipant;
  onChallenge: () => void;
  isBusy: boolean;
}

export function ParticipantCard({ participant, onChallenge, isBusy }: ParticipantCardProps) {
  const inMatch = participant.status === "in_match";
  const disabled = isBusy || inMatch;

  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Avatar className="h-8 w-8">
            <AvatarImage src={participant.profilePhotoUrl ?? undefined} />
            <AvatarFallback className="text-xs">{getInitials(participant.displayName)}</AvatarFallback>
          </Avatar>
          <span className="truncate text-sm font-medium">{participant.displayName}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="tabular-nums text-sm font-bold">{participant.currentElo}</span>
          {participant.currentWeight && (
            <span className="text-xs text-muted-foreground">{participant.currentWeight} lbs</span>
          )}
        </div>
        {inMatch ? (
          <Badge variant="secondary" className="w-full justify-center">In Match</Badge>
        ) : (
          <Button size="sm" className="w-full" onClick={onChallenge} disabled={disabled}>
            <Swords className="mr-1.5 h-3.5 w-3.5" />
            Challenge
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

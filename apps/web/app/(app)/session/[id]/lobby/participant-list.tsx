"use client";

import type { LobbyParticipant } from "@/types/session";
import { ParticipantCard } from "./participant-card";

interface ParticipantListProps {
  participants: LobbyParticipant[];
  currentAthleteId: string;
  onChallenge: (participant: LobbyParticipant) => void;
  busyIds: Set<string>;
}

export function ParticipantList({
  participants,
  currentAthleteId,
  onChallenge,
  busyIds,
}: ParticipantListProps) {
  const visible = participants
    .filter((p) => p.athleteId !== currentAthleteId && p.status !== "left")
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  if (visible.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No other fighters in the lobby yet.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {visible.map((p) => (
        <ParticipantCard
          key={p.athleteId}
          participant={p}
          onChallenge={() => onChallenge(p)}
          isBusy={busyIds.has(p.athleteId)}
        />
      ))}
    </div>
  );
}

"use client";

import { useLobbyPresence } from "@/hooks/use-lobby-presence";

export function LobbyPresenceBootstrap({
  athleteId,
  lookingForCasual,
  lookingForRanked,
}: {
  athleteId: string;
  lookingForCasual: boolean;
  lookingForRanked: boolean;
}) {
  useLobbyPresence(athleteId, lookingForCasual, lookingForRanked);
  return null;
}

"use client";

import { useOnlinePresence } from "@/hooks/use-online-presence";

export function OnlinePresenceBootstrap({
  athleteId,
  displayName,
  profilePhotoUrl,
}: {
  athleteId: string;
  displayName: string;
  profilePhotoUrl: string | null;
}) {
  useOnlinePresence(athleteId, displayName, profilePhotoUrl);
  return null;
}

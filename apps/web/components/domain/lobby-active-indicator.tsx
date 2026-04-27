"use client";

import { useLobbyStatus } from "@/hooks/use-lobby-presence";

export function LobbyActiveIndicator({ athleteId }: { athleteId: string }) {
  const inLobby = useLobbyStatus(athleteId);

  if (!inLobby) return null;

  return (
    <div className="flex items-center gap-1 mt-1">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
      </span>
      <span className="text-[10px] font-medium text-green-500">Active now</span>
    </div>
  );
}

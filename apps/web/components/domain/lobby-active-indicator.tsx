"use client";

import { useLobbyStatus } from "@/hooks/use-lobby-presence";
import { LivePill } from "@/components/ui/elo-system";

/**
 * Presence-driven wrapper around <LivePill/>.
 *
 * Arena renders LivePill directly (it already knows lobby membership from
 * useLobbyIds), so this exists for surfaces that only have an athleteId.
 * The pulse comes from LivePill's sanctioned --duration-pulse keyframe; do not
 * reintroduce `animate-ping`, which loops at 1000ms outside the motion budget.
 */
export function LobbyActiveIndicator({ athleteId }: { athleteId: string }) {
  const inLobby = useLobbyStatus(athleteId);

  if (!inLobby) return null;

  return <LivePill label="Active now" />;
}

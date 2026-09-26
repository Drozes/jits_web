"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useArenaLive } from "@/hooks/use-arena-live";
import { useArenaChallenge } from "@/hooks/use-arena-challenge";
import { useLobbyIds, useLobbyPresence } from "@/hooks/use-lobby-presence";
import { useActiveLobbyCount } from "@/hooks/use-active-lobby-count";
import { useRegisterArenaController } from "@/hooks/use-register-arena-controller";
import { publishArenaState } from "@/lib/arena/arena-store";
import { isImmersiveRoute } from "@/components/layout/nav-config";
import { ArenaChallengeOverlay } from "./arena-challenge-overlay";

interface ArenaBootstrapProps {
  athleteId: string;
  athleteWeight: number | null;
  initialLive: boolean;
}

/**
 * The single, app-wide owner of the Arena: live flag, `lobby:online`
 * presence, the challenge handshake and its overlay. Mounted once by
 * `<ArenaBootstrapGate />` in `app/(app)/layout.tsx` (active athletes only,
 * keyed by athlete id). State is published to `lib/arena/arena-store.ts`;
 * never mount these hooks anywhere else (double writes, double prompts).
 * Renders real DOM on purpose: see the hydration note in the layout.
 */
export function ArenaBootstrap({
  athleteId,
  athleteWeight,
  initialLive,
}: ArenaBootstrapProps) {
  const inMatch = isImmersiveRoute(usePathname());
  const live = useArenaLive({ athleteId, initialLive, inMatch });
  // Observing is not joining: self is tracked only while live.
  useLobbyPresence(athleteId, false, live.isLive);
  const lobbyIds = useLobbyIds();
  const onlineCount = useActiveLobbyCount(lobbyIds, athleteId);
  const challenge = useArenaChallenge({
    athleteId,
    athleteWeight,
    canReceive: live.isLive && !inMatch,
    inMatch,
    // A pending challenge found by a read is offered only while its
    // challenger is still in the lobby (mobile parity).
    lobbyIds,
  });
  useRegisterArenaController(live, challenge);

  const { isLive, isSaving } = live;
  const { incoming, outgoing, isBusy } = challenge;
  useEffect(() => {
    publishArenaState({
      ready: true,
      isLive,
      isSaving,
      incoming,
      outgoing,
      isBusy,
      onlineCount,
    });
  }, [isLive, isSaving, incoming, outgoing, isBusy, onlineCount]);

  return (
    <ArenaChallengeOverlay
      incoming={incoming}
      outgoing={outgoing}
      busy={isBusy}
      suppressed={inMatch}
      onAccept={() => void challenge.accept()}
      onDecline={() => void challenge.decline()}
      onCancel={() => void challenge.cancelOutgoing()}
    />
  );
}

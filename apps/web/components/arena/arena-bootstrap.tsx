"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useArenaLive } from "@/hooks/use-arena-live";
import { useArenaChallenge } from "@/hooks/use-arena-challenge";
import { useLobbyIds, useLobbyPresence } from "@/hooks/use-lobby-presence";
import { useActiveLobbyCount } from "@/hooks/use-active-lobby-count";
import { useRegisterArenaController } from "@/hooks/use-register-arena-controller";
import { publishArenaState } from "@/lib/arena/arena-store";
import { useMatchLocationRequired } from "@/lib/location/use-match-location-required";
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
  const pathname = usePathname();
  const inMatch = isImmersiveRoute(pathname);
  // match_location_required: read here once, shared by both hooks, and again
  // whenever the Arena is navigated to (the owner may flip it mid-session).
  const location = useMatchLocationRequired({ arenaFocused: pathname === "/arena" });
  const live = useArenaLive({ athleteId, initialLive, inMatch, location, routeKey: pathname ?? "" });
  // Observing is not joining: self is tracked only while live.
  useLobbyPresence(athleteId, false, live.isLive);
  const onlineCount = useActiveLobbyCount(useLobbyIds(), athleteId);
  const challenge = useArenaChallenge({
    athleteId,
    athleteWeight,
    canReceive: live.isLive && !inMatch,
    inMatch,
    locationRequired: location.ensure,
    onLocationRequired: location.markRequired,
  });
  useRegisterArenaController(live, challenge);

  const { isLive, isSaving, isLocating, locationPrompt } = live;
  const { incoming, outgoing, isBusy } = challenge;
  useEffect(() => {
    publishArenaState({
      ready: true,
      isLive,
      isSaving,
      isLocating,
      locationPrompt,
      incoming,
      outgoing,
      isBusy,
      onlineCount,
    });
  }, [isLive, isSaving, isLocating, locationPrompt, incoming, outgoing, isBusy, onlineCount]);

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

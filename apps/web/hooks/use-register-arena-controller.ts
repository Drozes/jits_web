"use client";

import { useEffect, useRef } from "react";
import {
  IDLE_ARENA_STATE,
  publishArenaState,
  registerArenaController,
} from "@/lib/arena/arena-store";
import type { useArenaLive } from "@/hooks/use-arena-live";
import type { useArenaChallenge } from "@/hooks/use-arena-challenge";

/**
 * Registers the owner's hooks as the store's action controller, once, through
 * refs so the delegates always reach the latest callbacks. Unmount unregisters
 * and resets the store to idle (sign-out, athlete switch).
 */
export function useRegisterArenaController(
  live: ReturnType<typeof useArenaLive>,
  challenge: ReturnType<typeof useArenaChallenge>,
): void {
  const liveRef = useRef(live);
  liveRef.current = live;
  const challengeRef = useRef(challenge);
  challengeRef.current = challenge;

  useEffect(() => {
    const unregister = registerArenaController({
      toggle: () => liveRef.current.toggle(),
      goLive: () => liveRef.current.goLive(),
      goOffline: () => liveRef.current.goOffline(),
      sendChallenge: (id, name) => challengeRef.current.sendChallenge(id, name),
      accept: () => challengeRef.current.accept(),
      decline: () => challengeRef.current.decline(),
      cancelOutgoing: () => challengeRef.current.cancelOutgoing(),
    });
    return () => {
      unregister();
      publishArenaState(IDLE_ARENA_STATE);
    };
  }, []);
}

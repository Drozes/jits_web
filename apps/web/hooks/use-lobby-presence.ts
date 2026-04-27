"use client";

import { useEffect } from "react";
import { useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

/** Payload tracked on the `lobby:online` Presence channel. */
interface LobbyPayload {
  athlete_id: string;
  looking_for_casual: boolean;
  looking_for_ranked: boolean;
}

// ---------------------------------------------------------------------------
// External store — allows any client component to subscribe without context
// ---------------------------------------------------------------------------

let lobbyIds: Set<string> = new Set();
const listeners = new Set<() => void>();

function emitChange() {
  for (const l of listeners) l();
}

function getSnapshot(): Set<string> {
  return lobbyIds;
}

const SERVER_SNAPSHOT: Set<string> = new Set();
function getServerSnapshot(): Set<string> {
  return SERVER_SNAPSHOT;
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

// ---------------------------------------------------------------------------
// Module-level channel reference for imperative API
// ---------------------------------------------------------------------------

let channelRef: RealtimeChannel | null = null;

// ---------------------------------------------------------------------------
// Consumer hook — use in any client component
// ---------------------------------------------------------------------------

export function useLobbyStatus(athleteId: string): boolean {
  const ids = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return ids.has(athleteId);
}

/** Returns the full set of athlete IDs currently in the lobby. */
export function useLobbyIds(): Set<string> {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// ---------------------------------------------------------------------------
// Imperative API — call from toggle component
// ---------------------------------------------------------------------------

export function joinLobby(payload: LobbyPayload): void {
  channelRef?.track(payload);
}

export function leaveLobby(): void {
  channelRef?.untrack();
}

// ---------------------------------------------------------------------------
// Provider hook — call once at app level to set up the channel
// ---------------------------------------------------------------------------

export function useLobbyPresence(
  athleteId: string,
  lookingForCasual: boolean,
  lookingForRanked: boolean,
): void {
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase.channel("lobby:online", {
      config: { presence: { key: athleteId } },
    });

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<LobbyPayload>();
      lobbyIds = new Set(Object.keys(state));
      emitChange();
    });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        if (lookingForCasual || lookingForRanked) {
          await channel.track({
            athlete_id: athleteId,
            looking_for_casual: lookingForCasual,
            looking_for_ranked: lookingForRanked,
          } satisfies LobbyPayload);
        }
      }
    });

    channelRef = channel;

    return () => {
      channelRef = null;
      supabase.removeChannel(channel);
    };
    // Only athleteId in deps — toggle changes go through imperative API,
    // avoiding channel teardown/reconnect on every toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athleteId]);
}

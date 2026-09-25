"use client";

import { useEffect, useRef } from "react";
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
  // The SUBSCRIBED callback re-fires on every websocket rejoin, but the effect
  // deliberately depends only on athleteId (so a toggle does not tear the
  // channel down). Without this ref the rejoin would re-track using the flags
  // captured at MOUNT, silently dropping a user who went live mid-session out
  // of the lobby on the next reconnect.
  const lookingRef = useRef({ lookingForCasual, lookingForRanked });
  lookingRef.current = { lookingForCasual, lookingForRanked };

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
        const { lookingForCasual: casual, lookingForRanked: ranked } =
          lookingRef.current;
        if (casual || ranked) {
          await channel.track({
            athlete_id: athleteId,
            looking_for_casual: casual,
            looking_for_ranked: ranked,
          } satisfies LobbyPayload);
        }
      }
    });

    channelRef = channel;

    return () => {
      channelRef = null;
      supabase.removeChannel(channel);
      // Drop the last roster so nothing reads a stale lobby after sign-out or
      // an athlete switch (the next owner starts from an empty set).
      lobbyIds = new Set();
      emitChange();
    };
    // Only athleteId in deps — toggle changes go through the imperative API,
    // avoiding channel teardown/reconnect on every toggle. The flags are read
    // through lookingRef, so no suppression is needed.
  }, [athleteId]);
}

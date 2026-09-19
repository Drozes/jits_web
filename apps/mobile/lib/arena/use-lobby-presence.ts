/**
 * `lobby:online` Presence for the Arena surface.
 *
 * The second of the app's two presence tiers. `app:online`
 * (`lib/presence/use-online-presence.ts`) says "this athlete has the app
 * open" and drives green dots everywhere; `lobby:online` says "this athlete is
 * in the Arena right now and can answer a live challenge". They are separate
 * signals on separate topics and must never be merged: the Arena splits its
 * roster on this one, and folding it into the app-wide channel would mark
 * every signed-in athlete as challengeable.
 *
 * Mirrors `apps/web/hooks/use-lobby-presence.ts`. Same external-store shape,
 * so any component can read the lobby without a Provider wrap.
 */
import * as React from "react";
import { useSyncExternalStore } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../supabase/client";
import { LOBBY_TOPIC } from "./constants";

/**
 * Tracked payload. `looking_for_casual` / `looking_for_ranked` are carried for
 * web, whose `LobbyPayload` type expects them; `display_name` / `current_elo`
 * are what a mobile presence row can render without a second read. Neither
 * client reads the other's extra fields, but keeping the union means a future
 * reader on either side finds what it expects.
 */
export interface LobbyPayload {
  athlete_id: string;
  display_name: string;
  current_elo: number;
  looking_for_casual: boolean;
  looking_for_ranked: boolean;
}

// ---------------------------------------------------------------------------
// External store
// ---------------------------------------------------------------------------

let lobbyIds: Set<string> = new Set();
const listeners = new Set<() => void>();

function emitChange() {
  for (const l of listeners) l();
}

function getSnapshot(): Set<string> {
  return lobbyIds;
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

/** Every athlete id currently present in `lobby:online`. */
export function useLobbyIds(): Set<string> {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** True when this athlete is present in the lobby. */
export function useLobbyStatus(athleteId: string): boolean {
  return useLobbyIds().has(athleteId);
}

// ---------------------------------------------------------------------------
// Imperative API
// ---------------------------------------------------------------------------

let channelRef: RealtimeChannel | null = null;
/**
 * What we WANT tracked, independent of whether the channel is joined yet.
 *
 * Two cases need it. A `joinLobby()` that lands before SUBSCRIBED would be
 * dropped by a bare `channel.track()`, and the SUBSCRIBED callback re-fires on
 * every websocket rejoin, where re-tracking a payload captured at mount would
 * resurrect a stale one. Reading the desired payload at track time fixes both.
 */
let desiredPayload: LobbyPayload | null = null;

async function trackDesired(): Promise<void> {
  if (!channelRef || !desiredPayload) return;
  await channelRef.track(desiredPayload);
}

/** Appear in the lobby. Safe to call before the channel has joined. */
export async function joinLobby(payload: LobbyPayload): Promise<void> {
  desiredPayload = payload;
  await trackDesired();
}

/** Disappear from the lobby. */
export async function leaveLobby(): Promise<void> {
  desiredPayload = null;
  await channelRef?.untrack();
}

/** Test seam: true when a join is currently desired. */
export function isLobbyJoinDesired(): boolean {
  return desiredPayload !== null;
}

// ---------------------------------------------------------------------------
// Provider hook
// ---------------------------------------------------------------------------

/**
 * Owns the single `lobby:online` channel. Mount once, on the Arena screen.
 *
 * The effect depends on `athleteId` alone. Going live and going offline run
 * through the imperative API above rather than through props, so a toggle
 * never tears the channel down and re-joins it.
 */
export function useLobbyPresence(athleteId: string): void {
  const mountIdRef = React.useRef(0);

  React.useEffect(() => {
    if (!athleteId) return;

    const mountId = ++mountIdRef.current;

    // The topic is a shared constant, never per-mount: Presence only syncs
    // members of the same topic, so `lobby:online:${mountId}` would isolate
    // this client into an empty lobby of one. `mountId` is only a stale-write
    // guard for the sync handler below.
    const channel = supabase.channel(LOBBY_TOPIC, {
      config: { presence: { key: athleteId } },
    });

    channel.on("presence", { event: "sync" }, () => {
      // Drop a late sync from a superseded mount so it cannot clobber the
      // store after cleanup.
      if (mountId !== mountIdRef.current) return;
      const state = channel.presenceState<LobbyPayload>();
      lobbyIds = new Set(Object.keys(state));
      emitChange();
    });

    channel.subscribe((status) => {
      if (status !== "SUBSCRIBED") return;
      void trackDesired();
    });

    channelRef = channel;

    return () => {
      channelRef = null;
      desiredPayload = null;
      void supabase.removeChannel(channel);
      // Clear the snapshot so a re-mount never renders a stale lobby.
      lobbyIds = new Set();
      emitChange();
    };
  }, [athleteId]);
}

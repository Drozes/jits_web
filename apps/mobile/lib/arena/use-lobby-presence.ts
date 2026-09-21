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
 *
 * THE CHANNEL IS CREATED ONCE AND REUSED, NEVER REBUILT. This topic is a
 * shared constant, so the per-instance suffix that protects the Arena's
 * postgres_changes channel is not available here, and realtime-js 2.105.4
 * makes a rebuild actively dangerous:
 *   - `RealtimeClient.channel(topic)` returns the EXISTING instance when one
 *     with that topic is still registered (RealtimeClient.js:343-355).
 *   - `removeChannel()` is async and only tears the channel down when
 *     `unsubscribe()` resolves 'ok' (RealtimeClient.js:270-276), so a
 *     fire-and-forget removal can leave the instance registered.
 *   - `subscribe()` is a silent no-op unless the adapter `isClosed()`
 *     (RealtimeChannel.js:121), so re-subscribing that instance never fires
 *     SUBSCRIBED, never tracks, and the athlete never appears to anyone.
 *   - `on()` THROWS for presence and postgres_changes alike once the channel
 *     is joined or joining (RealtimeChannel.js:389-396), so re-binding it is
 *     not an option either.
 * A remount racing its own teardown would therefore leave a channel that is
 * silently dead for the rest of the app session, with "Online now" stuck at
 * zero. Adopting the live instance sidesteps all four.
 *
 * When a removal does NOT confirm, there is no instance worth adopting and no
 * safe way to build one, so setup BAILS OUT and comes back later rather than
 * re-binding the registered instance. Continuing past an unconfirmed removal
 * is the same dead lobby by a different door: `channel()` hands back the
 * joined instance, `on()` throws, `channelRef` is never assigned, and from
 * then on the identity guard in the sync handler rejects every update while
 * `track()` has nothing to push to.
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

/** What `RealtimeClient` keys its channel registry by. */
const REGISTERED_TOPIC = `realtime:${LOBBY_TOPIC}`;

/**
 * Backoff for a stale channel we could not clear.
 *
 * An unconfirmed removal means the socket is not answering, which is a
 * condition that passes: the retry is what turns "dead for the rest of the
 * session" into "dead until the connection comes back". Bounded because these
 * delays only cover a socket on its way back, and a remount or an athlete
 * change re-runs setup anyway.
 */
const STALE_RETRY_DELAYS_MS = [1_000, 2_000, 4_000];

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
/** The athlete the live channel's presence key was built for. */
let channelAthleteId: string | null = null;
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

/** True while the client still holds this exact channel instance. */
function isRegistered(channel: RealtimeChannel | null): boolean {
  if (!channel) return false;
  return supabase.getChannels().some((c) => c === channel);
}

/**
 * Drop the channel properly: awaited, and with the status checked, because a
 * removal that did not confirm leaves the instance registered and poisons
 * every later `channel()` call for this topic.
 */
async function releaseChannel(): Promise<void> {
  const channel = channelRef;
  channelRef = null;
  channelAthleteId = null;
  desiredPayload = null;
  lobbyIds = new Set();
  emitChange();
  if (!channel) return;
  const status = await supabase.removeChannel(channel);
  if (status !== "ok") {
    console.warn("[arena] lobby channel did not confirm teardown:", status);
  }
}

// ---------------------------------------------------------------------------
// Provider hook
// ---------------------------------------------------------------------------

/**
 * Owns the single `lobby:online` channel. Mount once, on the Arena screen.
 *
 * Going live and going offline run through the imperative API above rather
 * than through props, so a toggle never tears the channel down and re-joins
 * it.
 */
export function useLobbyPresence(athleteId: string): void {
  React.useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    /**
     * Come back to a setup that could not complete. `attempt` is the try that
     * just failed, so the delays step up and the sequence terminates.
     */
    function retryLater(attempt: number) {
      if (cancelled) return;
      const delay = STALE_RETRY_DELAYS_MS[attempt];
      if (delay === undefined) {
        console.warn(
          "[arena] gave up clearing the stale lobby channel; the lobby stays empty until the Arena is re-entered",
        );
        return;
      }
      retryTimer = setTimeout(() => {
        retryTimer = null;
        run(attempt + 1);
      }, delay);
    }

    async function ensure(attempt: number) {
      if (!athleteId) {
        await releaseChannel();
        return;
      }

      // Adopt a channel we already hold for this athlete. Its existing
      // presence binding is still wired to the module store, so nothing needs
      // re-binding, which is fortunate, because `on()` would throw.
      if (isRegistered(channelRef) && channelAthleteId === athleteId) {
        await trackDesired();
        return;
      }

      // Either we hold a channel for a different athlete, or one was left
      // behind. Both have to go before `channel()` will hand back anything
      // new rather than the old instance.
      if (channelRef || channelAthleteId !== null) await releaseChannel();
      if (cancelled) return;

      const stray = supabase
        .getChannels()
        .find((c) => c.topic === REGISTERED_TOPIC);
      if (stray) {
        const status = await supabase.removeChannel(stray);
        if (status !== "ok") {
          // BAIL OUT. The instance is still registered and still joined, so
          // `channel()` below would hand back this exact one and `on()` would
          // THROW on it, killing the lobby for the rest of the app session.
          // An unconfirmed removal is a socket that is not answering, which
          // is temporary, so the honest move is to leave the lobby empty and
          // try the removal again rather than adopt a channel we cannot wire.
          console.warn("[arena] stale lobby channel did not clear:", status);
          retryLater(attempt);
          return;
        }
      }
      if (cancelled) return;

      const channel = supabase.channel(LOBBY_TOPIC, {
        config: { presence: { key: athleteId } },
      });

      channel.on("presence", { event: "sync" }, () => {
        // Identity guard rather than a mount counter: the only question that
        // matters is whether this is still the channel the module owns.
        if (channelRef !== channel) return;
        const state = channel.presenceState<LobbyPayload>();
        lobbyIds = new Set(Object.keys(state));
        emitChange();
      });

      channel.subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        void trackDesired();
      });

      channelRef = channel;
      channelAthleteId = athleteId;
    }

    /**
     * Never let a setup failure escape as an unhandled rejection, and never
     * let it pass quietly either: a lobby that is empty because setup threw
     * looks exactly like a lobby that is empty because nobody is in it.
     */
    function run(attempt: number) {
      void ensure(attempt).catch((error: unknown) => {
        console.warn("[arena] lobby channel setup failed:", error);
        retryLater(attempt);
      });
    }

    run(0);

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      // Leave the lobby, KEEP the channel. Removing it here is what creates
      // the zombie described at the top of this file, and an observer with
      // nothing tracked costs one idle topic.
      void leaveLobby();
    };
  }, [athleteId]);
}

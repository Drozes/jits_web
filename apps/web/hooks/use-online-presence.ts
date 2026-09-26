"use client";

import { useEffect } from "react";
import { useSyncExternalStore } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import {
  clearStrayChannel,
  discardLostChannel,
  isRegistered,
  LOSS_RETRY_DELAYS_MS,
  LOSS_STREAK_RESET_MS,
  settleWithin,
} from "@/lib/realtime/presence-channel";

/** Payload tracked on the `app:online` Presence channel (per BE contract). */
interface AppOnlinePayload {
  athlete_id: string;
  display_name: string;
  profile_photo_url: string | null;
}

// ---------------------------------------------------------------------------
// External store: allows any client component to subscribe without context
// ---------------------------------------------------------------------------

let onlineIds: Set<string> = new Set();
const listeners = new Set<() => void>();

function emitChange() {
  for (const l of listeners) l();
}

function getSnapshot(): Set<string> {
  return onlineIds;
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
// Consumer hook: use in any client component
// ---------------------------------------------------------------------------

export function useOnlineStatus(athleteId: string): boolean {
  const ids = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return ids.has(athleteId);
}

// ---------------------------------------------------------------------------
// Provider hook: call once at app level to set up the channel
// ---------------------------------------------------------------------------

const TOPIC = "app:online";

/** The previous mount's channel removal, while it is still in flight. */
let pendingRemoval: Promise<unknown> | null = null;

/**
 * Owns the `app:online` channel (jits-ifvw, mirrors mobile jits-fa9x):
 * - A CLOSED for our channel once it is no longer registered is the server
 *   closing it (e.g. the presence rate limit). realtime-js never rejoins it,
 *   so it is rebuilt on a bounded backoff and the payload re-tracked.
 * - A remount (display name or photo change) waits for the previous mount's
 *   removal first: until it confirms, `channel("app:online")` would hand back
 *   that leaving instance, whose `subscribe()` is a no-op.
 * - The payload is tracked once per join, and every awaited call is bounded.
 */
export function useOnlinePresence(
  athleteId: string,
  displayName: string,
  profilePhotoUrl: string | null,
): void {
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    /** A channel the server closed, discarded by the next setup. */
    let deadChannel: RealtimeChannel | null = null;
    /** Whether the joined channel holds (or is being sent) our payload. */
    let tracked = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let losses = 0;
    let subscribedAt: number | null = null;
    let gaveUp = false;

    const payload: AppOnlinePayload = {
      athlete_id: athleteId,
      display_name: displayName,
      profile_photo_url: profilePhotoUrl,
    };

    // Only on a JOINED channel: a push while joining is buffered and
    // SUBSCRIBED then tracks again, two calls for one intent.
    async function trackOnce() {
      const ch = channel;
      if (!ch || tracked || ch.state !== "joined") return;
      tracked = true;
      const status = await settleWithin(ch.track(payload));
      if (status !== "ok" && channel === ch) tracked = false;
    }

    function scheduleRebuild() {
      if (cancelled || retryTimer) return;
      const delay = LOSS_RETRY_DELAYS_MS[losses - 1];
      if (delay === undefined) {
        console.warn(
          "[presence] gave up rebuilding app:online; retrying when the tab is next visible",
        );
        gaveUp = true;
        return;
      }
      retryTimer = setTimeout(() => {
        retryTimer = null;
        run();
      }, delay);
    }

    function handleLoss(ch: RealtimeChannel, reason: string) {
      const wasHealthy =
        subscribedAt !== null && Date.now() - subscribedAt >= LOSS_STREAK_RESET_MS;
      losses = wasHealthy ? 1 : losses + 1;
      console.warn(
        `[presence] app:online channel lost (${reason}); rebuilding it (loss ${losses} in a row)`,
      );
      channel = null;
      deadChannel = ch;
      tracked = false;
      subscribedAt = null;
      onlineIds = new Set();
      emitChange();
      scheduleRebuild();
    }

    async function connect() {
      if (deadChannel) {
        discardLostChannel(deadChannel);
        deadChannel = null;
      }
      if (pendingRemoval) await pendingRemoval;
      if (cancelled) return;
      if (!(await clearStrayChannel(supabase, TOPIC))) {
        // Still registered, so `channel()` would hand this one back.
        console.warn("[presence] stale app:online channel did not clear");
        losses += 1;
        scheduleRebuild();
        return;
      }
      if (cancelled) return;

      const ch = supabase.channel(TOPIC, {
        config: { presence: { key: athleteId } },
      });

      ch.on("presence", { event: "sync" }, () => {
        // A late sync from a superseded channel must not clobber the store.
        if (channel !== ch) return;
        const state = ch.presenceState<AppOnlinePayload>();
        onlineIds = new Set(Object.keys(state));
        emitChange();
      });

      ch.subscribe((status) => {
        // Our own teardown nulls `channel` first, so its CLOSED stops here.
        if (cancelled || channel !== ch) return;
        if (status === "SUBSCRIBED") {
          // A fresh join (first or a phoenix rejoin) holds nothing for us.
          subscribedAt = Date.now();
          tracked = false;
          void trackOnce();
          return;
        }
        if (!isRegistered(supabase, ch)) handleLoss(ch, status);
      });

      channel = ch;
    }

    function run() {
      void connect().catch((err: unknown) => {
        console.warn("[presence] app:online setup failed", err);
        losses += 1;
        scheduleRebuild();
      });
    }

    run();

    // The tab coming back is when a socket that gave up is likely back too.
    const onVisible = () => {
      if (document.visibilityState !== "visible" || cancelled) return;
      if (gaveUp && !channel) {
        gaveUp = false;
        losses = 0;
        run();
        return;
      }
      void trackOnce();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (retryTimer) clearTimeout(retryTimer);
      if (deadChannel) discardLostChannel(deadChannel);
      const ch = channel;
      channel = null;
      if (ch) {
        // The next mount waits on this before building its own channel.
        const removal = settleWithin(supabase.removeChannel(ch)).finally(() => {
          if (pendingRemoval === removal) pendingRemoval = null;
        });
        pendingRemoval = removal;
      }
    };
  }, [athleteId, displayName, profilePhotoUrl]);
}

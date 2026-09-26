/**
 * Mobile online presence hook.
 *
 * Mirrors `apps/web/hooks/use-online-presence.ts` but layers in `AppState`
 * awareness. The web tab can stay subscribed indefinitely; a mobile app that
 * goes background loses CPU and we don't want to keep tracking a phantom
 * presence. So we untrack on background and re-track on foreground.
 *
 * Same external store / `useSyncExternalStore` pattern, so any client component
 * can subscribe to "is athlete X online?" without a Provider wrap.
 *
 * Two ways this channel used to die silently for the rest of the app process
 * (jits-fa9x), both handled below:
 *   - The SERVER CLOSES it. Realtime enforces a per-channel presence rate
 *     limit (5 track/untrack calls per 30s) and stops the channel past it.
 *     realtime-js drops a closed channel from its registry and never rejoins
 *     it, so a CLOSED for our channel rebuilds it on a bounded backoff.
 *     CHANNEL_ERROR / TIMED_OUT are left alone while the instance is still
 *     registered: phoenix rejoins it itself and SUBSCRIBED re-tracks.
 *   - A REMOUNT races the previous mount's removal. `removeChannel()` only
 *     unregisters once the server confirms the leave, and until then
 *     `supabase.channel("app:online")` hands back that leaving instance, whose
 *     `subscribe()` is a no-op and which unregisters itself moments later.
 *     Setup therefore waits for the previous removal before building.
 */
import * as React from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useSyncExternalStore } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../supabase/client";

interface AppOnlinePayload {
  athlete_id: string;
  display_name: string;
  profile_photo_url: string | null;
}

// MUST be the shared constant topic: Supabase Presence only syncs members of
// the SAME topic, so a per-mount name (`app:online:${mountId}`) would isolate
// this client and never see web's members.
const TOPIC = "app:online";
/** What `RealtimeClient` keys its channel registry by. */
const REGISTERED_TOPIC = `realtime:${TOPIC}`;

/**
 * Backoff for rebuilding a channel the server closed, indexed by losses in a
 * row. Past the last step we wait for the next foreground instead.
 */
const LOSS_RETRY_DELAYS_MS = [1_000, 5_000, 15_000, 30_000];
/** Joined at least this long before a loss ends the losing streak. */
const LOSS_STREAK_RESET_MS = 30_000;

/** The previous mount's channel removal, while it is still in flight. */
let pendingRemoval: Promise<unknown> | null = null;

// ---------------------------------------------------------------------------
// External store
// ---------------------------------------------------------------------------

let onlineIds: Set<string> = new Set();
const listeners = new Set<() => void>();

function emitChange() {
  for (const l of listeners) l();
}

function getSnapshot(): Set<string> {
  return onlineIds;
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function isRegistered(channel: RealtimeChannel): boolean {
  return supabase.getChannels().some((c) => c === channel);
}

// ---------------------------------------------------------------------------
// Consumer hook
// ---------------------------------------------------------------------------

export function useOnlineStatus(athleteId: string): boolean {
  const ids = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return ids.has(athleteId);
}

// ---------------------------------------------------------------------------
// Provider hook
// ---------------------------------------------------------------------------

export function useOnlinePresence(
  athleteId: string,
  displayName: string,
  profilePhotoUrl: string | null,
): void {
  const mountIdRef = React.useRef(0);

  React.useEffect(() => {
    if (!athleteId) return;

    const mountId = ++mountIdRef.current;
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    /** A channel the server closed, torn down by the next setup. */
    let deadChannel: RealtimeChannel | null = null;
    /**
     * Whether the joined channel holds our presence. Keeps presence calls to
     * the ones that change something: every call counts toward the server's
     * rate limit, and `inactive` then `background` would otherwise untrack
     * twice.
     */
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

    // Only on a JOINED channel: while joining or errored, a push is buffered
    // and SUBSCRIBED then tracks again, two calls for one intent.
    const trackIfActive = async () => {
      const ch = channel;
      if (!ch || tracked || ch.state !== "joined") return;
      tracked = true;
      try {
        const status = await ch.track(payload);
        if (status !== "ok" && channel === ch) tracked = false;
      } catch (err) {
        if (channel === ch) tracked = false;
        console.warn("[presence] track failed", err);
      }
    };

    const untrack = async () => {
      const ch = channel;
      if (!ch || !tracked) return;
      tracked = false;
      // A channel that is not joined holds nothing server-side any more.
      if (ch.state !== "joined") return;
      try {
        await ch.untrack();
      } catch (err) {
        console.warn("[presence] untrack failed", err);
      }
    };

    function scheduleRebuild() {
      if (cancelled || retryTimer) return;
      const delay = LOSS_RETRY_DELAYS_MS[losses - 1];
      if (delay === undefined) {
        console.warn(
          "[presence] gave up rebuilding app:online; retrying when the app next returns to the foreground",
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
      // Tear the closed instance down locally. Not `removeChannel()`: that
      // pushes a leave for this topic, and realtime-js unregisters BY TOPIC
      // on close, so a late close could take the replacement with it.
      if (deadChannel) {
        const dead = deadChannel;
        deadChannel = null;
        dead.teardown();
      }
      if (pendingRemoval) await pendingRemoval;
      if (cancelled) return;

      const stray = supabase
        .getChannels()
        .find((c) => c.topic === REGISTERED_TOPIC);
      if (stray) {
        const status = await supabase.removeChannel(stray);
        if (status !== "ok") {
          // Still registered, so `channel()` would hand this one back.
          console.warn("[presence] stale app:online channel did not clear:", status);
          losses += 1;
          scheduleRebuild();
          return;
        }
      }
      if (cancelled) return;

      const ch = supabase.channel(TOPIC, {
        config: { presence: { key: athleteId } },
      });

      ch.on("presence", { event: "sync" }, () => {
        // Ignore a late sync from a superseded mount or channel so it can't
        // clobber the store after cleanup/re-mount.
        if (mountId !== mountIdRef.current || channel !== ch) return;
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
          if (AppState.currentState === "active") void trackIfActive();
          return;
        }
        if (!isRegistered(ch)) handleLoss(ch, status);
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

    const handleAppStateChange = (next: AppStateStatus) => {
      if (next === "active") {
        if (gaveUp && !cancelled && !channel) {
          gaveUp = false;
          run();
          return;
        }
        void trackIfActive();
      } else {
        // background / inactive
        void untrack();
      }
    };

    const sub = AppState.addEventListener("change", handleAppStateChange);

    return () => {
      cancelled = true;
      sub.remove();
      if (retryTimer) clearTimeout(retryTimer);
      if (deadChannel) {
        deadChannel.teardown();
        deadChannel = null;
      }
      const ch = channel;
      channel = null;
      if (ch) {
        // The next mount waits on this before building its own channel.
        const removal = supabase
          .removeChannel(ch)
          .catch(() => "error")
          .finally(() => {
            if (pendingRemoval === removal) pendingRemoval = null;
          });
        pendingRemoval = removal;
      }
      // Clear local store snapshot so a re-mount doesn't show stale state.
      onlineIds = new Set();
      emitChange();
    };
  }, [athleteId, displayName, profilePhotoUrl]);
}

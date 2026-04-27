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
  React.useEffect(() => {
    if (!athleteId) return;

    let channel: RealtimeChannel | null = null;
    let trackedRecently = false;

    const payload: AppOnlinePayload = {
      athlete_id: athleteId,
      display_name: displayName,
      profile_photo_url: profilePhotoUrl,
    };

    const trackIfActive = async () => {
      if (!channel) return;
      if (trackedRecently) return;
      trackedRecently = true;
      try {
        await channel.track(payload);
      } catch (err) {
        trackedRecently = false;
        console.warn("[presence] track failed", err);
      }
    };

    const untrack = async () => {
      if (!channel) return;
      trackedRecently = false;
      try {
        await channel.untrack();
      } catch (err) {
        console.warn("[presence] untrack failed", err);
      }
    };

    channel = supabase.channel("app:online", {
      config: { presence: { key: athleteId } },
    });

    channel.on("presence", { event: "sync" }, () => {
      const state = channel!.presenceState<AppOnlinePayload>();
      onlineIds = new Set(Object.keys(state));
      emitChange();
    });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED" && AppState.currentState === "active") {
        await trackIfActive();
      }
    });

    const handleAppStateChange = (next: AppStateStatus) => {
      if (next === "active") {
        void trackIfActive();
      } else {
        // background / inactive
        void untrack();
      }
    };

    const sub = AppState.addEventListener("change", handleAppStateChange);

    return () => {
      sub.remove();
      if (channel) {
        supabase.removeChannel(channel);
        channel = null;
      }
      // Clear local store snapshot so a re-mount doesn't show stale state.
      onlineIds = new Set();
      emitChange();
    };
  }, [athleteId, displayName, profilePhotoUrl]);
}

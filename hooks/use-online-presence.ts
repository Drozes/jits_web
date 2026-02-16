"use client";

import { useEffect } from "react";
import { useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";

/** Payload tracked on the `app:online` Presence channel (per BE contract). */
interface AppOnlinePayload {
  athlete_id: string;
  display_name: string;
  profile_photo_url: string | null;
}

// ---------------------------------------------------------------------------
// External store — allows any client component to subscribe without context
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
// Consumer hook — use in any client component
// ---------------------------------------------------------------------------

export function useOnlineStatus(athleteId: string): boolean {
  const ids = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return ids.has(athleteId);
}

// ---------------------------------------------------------------------------
// Provider hook — call once at app level to set up the channel
// ---------------------------------------------------------------------------

export function useOnlinePresence(
  athleteId: string,
  displayName: string,
  profilePhotoUrl: string | null,
): void {
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase.channel("app:online", {
      config: { presence: { key: athleteId } },
    });

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<AppOnlinePayload>();
      onlineIds = new Set(Object.keys(state));
      emitChange();
    });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({
          athlete_id: athleteId,
          display_name: displayName,
          profile_photo_url: profilePhotoUrl,
        } satisfies AppOnlinePayload);
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [athleteId, displayName, profilePhotoUrl]);
}

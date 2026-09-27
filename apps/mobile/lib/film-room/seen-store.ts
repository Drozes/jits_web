import * as React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Which matches this device has opened in the Film Room, for the NEW badge.
 * Per device on purpose (AsyncStorage, like the recording opt-in): "new to
 * me on this phone" is the question, and it needs no backend column.
 *
 * Module-level so the match page marking a match seen updates the grid that
 * is still mounted underneath it. Bounded to the most recent MAX_SEEN ids.
 */
export const SEEN_STORAGE_KEY = "film-room:seen:v1";
const MAX_SEEN = 300;

let seen: string[] = [];
let loaded = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
let version = 0;

function emit(): void {
  version += 1;
  for (const l of listeners) l();
}

export function loadSeenMatches(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (!loading) {
    loading = (async () => {
      try {
        const raw = await AsyncStorage.getItem(SEEN_STORAGE_KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed)) {
          // Anything marked while the read was in flight stays.
          const fromDisk = parsed.filter((x): x is string => typeof x === "string");
          seen = [...new Set([...fromDisk, ...seen])].slice(-MAX_SEEN);
        }
      } catch {
        // Unreadable storage: everything recent reads as NEW, which is harmless.
      }
      loaded = true;
      emit();
    })();
  }
  return loading;
}

export function isMatchSeen(matchId: string): boolean {
  return seen.includes(matchId);
}

export function markMatchSeen(matchId: string): void {
  if (seen.includes(matchId)) return;
  seen = [...seen, matchId].slice(-MAX_SEEN);
  emit();
  void AsyncStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(seen)).catch(() => undefined);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getVersion = () => version;

/**
 * Re-renders when the seen set changes and returns a lookup. `ready` is false
 * until the stored set has been read, so callers can hold NEW badges back
 * instead of flashing them on every card.
 */
export function useSeenMatches(): { ready: boolean; isSeen: (id: string) => boolean } {
  React.useSyncExternalStore(subscribe, getVersion, getVersion);
  React.useEffect(() => {
    void loadSeenMatches();
  }, []);
  return { ready: loaded, isSeen: isMatchSeen };
}

/** Test-only reset. */
export function __resetSeenMatches(): void {
  seen = [];
  loaded = false;
  loading = null;
  emit();
}

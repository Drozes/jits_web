import * as React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { UPLOAD_JOB_RETENTION_DAYS } from "./upload-persistence";

/**
 * "This phone recorded the match and the athlete Discarded the clip"
 * (jits-n2im.25 review minor 2), per athlete and match, persisted next to the
 * upload jobs so it survives an app restart, and dropped after the same
 * 7 days. With it, the Film status keeps this phone's own copy ("Not
 * uploaded / The clip isn't on this phone anymore.") instead of the
 * other-device "open the phone that recorded" line. The server's recording
 * intent is frozen once the match is over, so it is not cleared there.
 */
export const DISCARD_MARKER_PREFIX = "elo-video-discarded::";
const TTL_MS = UPLOAD_JOB_RETENTION_DAYS * 24 * 60 * 60 * 1000;

const keyOf = (athleteId: string, matchId: string) => `${athleteId}::${matchId}`;
const marks = new Set<string>();
const loaded = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
let version = 0;

function emit(): void {
  version += 1;
  for (const l of listeners) l();
}

/** Record a Discard on this phone (memory now, disk in the background). */
export async function markDiscardedHere(athleteId: string, matchId: string, now = Date.now()): Promise<void> {
  marks.add(keyOf(athleteId, matchId));
  emit();
  try {
    await AsyncStorage.setItem(DISCARD_MARKER_PREFIX + keyOf(athleteId, matchId), JSON.stringify({ at: now }));
  } catch {
    // Best effort: the in-memory mark still covers this session.
  }
}

/** A new recording attempt on the match supersedes any earlier Discard. */
export async function clearDiscardedHere(matchId: string): Promise<void> {
  let changed = false;
  for (const k of [...marks]) {
    if (k.endsWith(`::${matchId}`)) {
      marks.delete(k);
      changed = true;
    }
  }
  if (changed) emit();
  try {
    const keys = await AsyncStorage.getAllKeys();
    for (const k of keys) {
      if (k.startsWith(DISCARD_MARKER_PREFIX) && k.endsWith(`::${matchId}`)) await AsyncStorage.removeItem(k);
    }
  } catch {
    // Best effort.
  }
}

/** Read this athlete's markers from disk once per process, dropping expired ones. */
export function loadDiscardMarkers(athleteId: string, now = Date.now()): Promise<void> {
  const running = loaded.get(athleteId);
  if (running) return running;
  const p = (async () => {
    try {
      const prefix = `${DISCARD_MARKER_PREFIX}${athleteId}::`;
      const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(prefix));
      for (const k of keys) {
        const raw = await AsyncStorage.getItem(k);
        const at = raw ? Number((JSON.parse(raw) as { at?: unknown }).at) : NaN;
        if (!Number.isFinite(at) || now - at > TTL_MS) {
          await AsyncStorage.removeItem(k);
          continue;
        }
        marks.add(k.slice(DISCARD_MARKER_PREFIX.length));
      }
      emit();
    } catch {
      // Unreadable storage: no markers, the server copy stands.
    }
  })();
  loaded.set(athleteId, p);
  return p;
}

export function wasDiscardedHere(athleteId: string | null | undefined, matchId: string): boolean {
  return !!athleteId && marks.has(keyOf(athleteId, matchId));
}

/** Subscribe to the viewer's marker for a match, loading the athlete's markers on first use. */
export function useDiscardedHere(athleteId: string | null | undefined, matchId: string | null | undefined): boolean {
  React.useEffect(() => {
    if (athleteId) void loadDiscardMarkers(athleteId);
  }, [athleteId]);
  const subscribe = React.useCallback((l: () => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  const get = React.useCallback(() => version, []);
  React.useSyncExternalStore(subscribe, get, get);
  return !!matchId && wasDiscardedHere(athleteId, matchId);
}

/** Test-only: forget the in-memory state (as an app restart does); disk is kept. */
export function __resetDiscardMemoryForTests(): void {
  marks.clear();
  loaded.clear();
  emit();
}

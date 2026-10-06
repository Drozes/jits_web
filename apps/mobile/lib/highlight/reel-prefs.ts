import * as React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Per-install viewer preferences (specs/matches-tab section 8, COPY-DECK
 * section 5). Every read and write is best effort: storage failing never
 * breaks playback, it only forgets the preference.
 *
 * - Mute (`reels:muted:v1`): the full-screen viewer starts WITH sound unless
 *   the athlete muted it last time. Cached at module level so every page and
 *   the next viewer open agree at once.
 * - Swipe hint (`reels:swipe-hint:v1`): C-V1 shows once per install. If a
 *   shared helper for this key lands elsewhere (jits-a4fw wave 2), this one
 *   should delegate to it; the key and semantics are the spec's.
 */
export const REEL_MUTED_KEY = "reels:muted:v1";
export const REEL_SWIPE_HINT_KEY = "reels:swipe-hint:v1";

let muted = false;
let loaded = false;
let settled = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

/** Reads the stored mute choice once per app run. */
let priming: Promise<void> = Promise.resolve();

export function primeReelMuted(): Promise<void> {
  if (loaded) return priming;
  loaded = true;
  priming = AsyncStorage.getItem(REEL_MUTED_KEY)
    .then((v) => {
      if ((v === "1") !== muted) {
        muted = v === "1";
        emit();
      }
    })
    .catch(() => undefined)
    .finally(() => {
      settled = true;
    });
  return priming;
}

/** The stored mute choice has been read (or the read failed and the default stands). */
export function reelMutedLoaded(): boolean {
  return settled;
}

export function getReelMuted(): boolean {
  return muted;
}

export function setReelMuted(next: boolean): void {
  loaded = true;
  settled = true;
  if (next === muted) return;
  muted = next;
  emit();
  void AsyncStorage.setItem(REEL_MUTED_KEY, next ? "1" : "0").catch(() => undefined);
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useReelMuted(): boolean {
  React.useEffect(() => {
    void primeReelMuted();
  }, []);
  return React.useSyncExternalStore(subscribe, getReelMuted, getReelMuted);
}

/** True when C-V1 was never shown on this install (false when storage fails: no hint is safer than a repeat). */
export async function swipeHintPending(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(REEL_SWIPE_HINT_KEY)) == null;
  } catch {
    return false;
  }
}

export function markSwipeHintShown(): void {
  void AsyncStorage.setItem(REEL_SWIPE_HINT_KEY, "1").catch(() => undefined);
}

/** Tests only. */
export function __resetReelPrefsForTests(): void {
  muted = false;
  loaded = false;
  settled = false;
  priming = Promise.resolve();
  listeners.clear();
}

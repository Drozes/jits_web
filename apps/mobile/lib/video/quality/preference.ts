import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { QualityPreference } from "@jits/shared/utils";

/**
 * Playback quality choice, per device (jits-xfvd.12, owner decision 1):
 * Auto (adaptive), High (always the 720p copy) or Data saver (always the
 * 360p copy). Same tiny external store as `recording-optin.ts`: the Video
 * settings screen writes it, each player reads it once when a video opens
 * (a change applies to the next video opened). Default Auto, also for any
 * unknown stored value.
 */
export const PLAYBACK_QUALITY_KEY = "video-playback:quality";

let value: QualityPreference = "auto";
let hydrated = false;
let hydrating: Promise<void> | null = null;
const listeners = new Set<() => void>();

function parse(raw: string | null): QualityPreference {
  return raw === "high" || raw === "data_saver" || raw === "auto" ? raw : "auto";
}

function emit() {
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function snapshot() {
  return value;
}

/** Read the remembered choice once per app run. Never rejects. */
export function hydratePlaybackQualityPreference(): Promise<void> {
  if (hydrated) return Promise.resolve();
  if (!hydrating) {
    hydrating = AsyncStorage.getItem(PLAYBACK_QUALITY_KEY)
      .then((raw) => {
        // A choice made before the read landed wins over the stored one.
        if (!hydrated) {
          value = parse(raw);
          hydrated = true;
          emit();
        }
      })
      .catch(() => {
        hydrated = true;
      });
  }
  return hydrating;
}

export function getPlaybackQualityPreference(): QualityPreference {
  return value;
}

/** Set and remember the choice. The write is best effort. */
export function setPlaybackQualityPreference(next: QualityPreference): void {
  hydrated = true;
  if (value === next) return;
  value = next;
  emit();
  void AsyncStorage.setItem(PLAYBACK_QUALITY_KEY, next).catch(() => undefined);
}

/** The current choice; hydrates the remembered one on first use. */
export function usePlaybackQualityPreference(): QualityPreference {
  if (!hydrated) void hydratePlaybackQualityPreference();
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Tests only: back to a fresh store. */
export function __resetPlaybackQualityPreferenceForTests(next: QualityPreference = "auto", markHydrated = true): void {
  value = next;
  hydrated = markHydrated;
  hydrating = null;
  emit();
}

import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * "Record from my phone", per device (product decision 5). Each athlete opts
 * in on their own phone on the face-off ready screen. OFF on first use, then
 * remembered on this device. The live step only arms the recorder when it is
 * on; the opponent learns the choice over the match channel
 * (`recording_optin`).
 *
 * A tiny external store rather than component state: the face-off toggle,
 * the camera surface and the live step all read the same value, and it must
 * not flip between them mid-match.
 */
export const RECORDING_OPTIN_KEY = "match-flow:record-from-my-phone";

let value = false;
let hydrated = false;
let hydrating: Promise<void> | null = null;
const listeners = new Set<() => void>();

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
export function hydrateRecordingOptIn(): Promise<void> {
  if (hydrated) return Promise.resolve();
  if (!hydrating) {
    hydrating = AsyncStorage.getItem(RECORDING_OPTIN_KEY)
      .then((raw) => {
        // A choice made before the read landed wins over the stored one.
        if (!hydrated) {
          value = raw === "1";
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

export function getRecordingOptIn(): boolean {
  return value;
}

/** Set and remember the choice. The write is best effort. */
export function setRecordingOptIn(next: boolean): void {
  hydrated = true;
  if (value === next) return;
  value = next;
  emit();
  void AsyncStorage.setItem(RECORDING_OPTIN_KEY, next ? "1" : "0").catch(() => undefined);
}

/** The current choice; hydrates the remembered one on first use. */
export function useRecordingOptIn(): boolean {
  if (!hydrated) void hydrateRecordingOptIn();
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Tests only: back to a fresh, unhydrated OFF. */
export function __resetRecordingOptInForTests(next = false, markHydrated = true): void {
  value = next;
  hydrated = markHydrated;
  hydrating = null;
  emit();
}

import { useSyncExternalStore } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * The OS "Reduce Motion" setting, read once per app run and cached at module
 * level, so every animation in the Motion Rule registry (DESIGN.md) knows it on their FIRST frame instead of animating
 * for one frame before the async read lands. Kept current by one listener.
 */
let reduceMotion = false;
let started = false;
const listeners = new Set<() => void>();

function set(next: boolean) {
  if (next === reduceMotion) return;
  reduceMotion = next;
  for (const l of listeners) l();
}

/** Seed the cache; called at import and safe to call again. */
export function primeReduceMotion(): void {
  if (started) return;
  started = true;
  try {
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => set(v === true))
      .catch(() => undefined);
    AccessibilityInfo.addEventListener?.("reduceMotionChanged", (v: boolean) => set(v === true));
  } catch {
    // No accessibility module (tests, web): motion stays allowed.
  }
}

primeReduceMotion();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

const snapshot = () => reduceMotion;

export function useReduceMotion(): boolean {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Tests only. */
export function __setReduceMotionForTests(next: boolean): void {
  set(next);
}

import { useSyncExternalStore } from "react";
import { AppState, type AppStateStatus } from "react-native";

/**
 * Whether the app is in the foreground (`AppState` is `active`). Ambient
 * loops (Motion Rule, Ambient tier) run only while this is true: cancel the
 * animation when it turns false and restart it when it turns true again.
 *
 * Correct on the first frame (seeded from `AppState.currentState`). An
 * `unknown` or missing state (iOS before the first report, tests) counts as
 * active so a loop is not suppressed by a state that never arrives.
 * `inactive` (iOS app switcher, Control Center) counts as not active.
 */
let latest: AppStateStatus | null = null;

function isActive(state: AppStateStatus | null | undefined): boolean {
  return state == null || state === "active" || state === "unknown";
}

function subscribe(cb: () => void): () => void {
  const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
    latest = next;
    cb();
  });
  return () => sub?.remove?.();
}

const snapshot = () => isActive(latest ?? AppState.currentState);

export function useAppActive(): boolean {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Tests only: forget the last reported state. */
export function __resetAppActiveForTests(): void {
  latest = null;
}

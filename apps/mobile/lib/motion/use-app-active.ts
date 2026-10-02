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
// The last state a listener saw. Only trusted while at least one hook is
// subscribed: with no listener nothing keeps it current, so it is dropped
// when the last subscriber leaves and the next mount reads
// `AppState.currentState` afresh (otherwise a loop that unmounted while the
// app was in the background would stay frozen after a later foreground).
let latest: AppStateStatus | null = null;
let subscribers = 0;

function isActive(state: AppStateStatus | null | undefined): boolean {
  return state == null || state === "active" || state === "unknown";
}

function subscribe(cb: () => void): () => void {
  subscribers += 1;
  const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
    latest = next;
    cb();
  });
  return () => {
    sub?.remove?.();
    subscribers = Math.max(0, subscribers - 1);
    if (subscribers === 0) latest = null;
  };
}

const snapshot = () => isActive(latest ?? AppState.currentState);

export function useAppActive(): boolean {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Tests only: forget the last reported state. */
export function __resetAppActiveForTests(): void {
  latest = null;
  subscribers = 0;
}

/**
 * System permission prompts in flight (location, camera, microphone). On
 * Android the runtime permission dialog pauses the activity, so AppState
 * reports "background" (then "active") while it is up; iOS reports
 * "inactive". Owners that treat a background as "the athlete left" (live
 * status, `app:online` presence, the Go Live flow, the challenger's one-time
 * ask) ignore a background while a prompt is up (jits-3dc2).
 *
 * Every caller that shows a system permission prompt wraps the request in
 * `trackPermissionRequest`. A request that only READS the current status
 * (`get*PermissionsAsync`) shows nothing and is not wrapped.
 *
 * Safety nets (review B1, jits-mafl.2):
 *  - `ignoreBackgroundForPermissionDialog()` is Android only. iOS reports a
 *    dialog as "inactive", so an iOS "background" with a prompt up is a real
 *    Home press and is never ignored.
 *  - A request older than `PERMISSION_REQUEST_MAX_AGE_MS` (30 s) no longer counts, so
 *    a native promise that never settles cannot hold the guard for the life of
 *    the process.
 *  - On Android, pressing Home while the dialog is up fires no further
 *    AppState event after the dialog's own "background". So when the last
 *    request settles (or expires), `permissionDialogBackgroundGuard`
 *    re-checks `AppState.currentState` after `SETTLE_REPLAY_DELAY_MS`
 *    (Android delivers the permission result before onResume) and replays
 *    the owner's background branch if the app really is in the background.
 *
 * Background handlers deliberately left unguarded (audit, jits-3dc2): they
 * only note "came back" and refetch on the next "active" (use-arena-challenge,
 * use-pending-challenge-recovery, active-match-store, highlight-store,
 * use-my-highlight), clear and re-arm upload retry timers
 * (video-upload-manager), flush telemetry (use-playback-telemetry,
 * upload-telemetry) or pause playback (use-video-playback,
 * use-multi-angle-playback, use-reel-player-pool). A dialog's "background"
 * costs them at most one extra refresh or a pause, never live state.
 */
import { AppState, Platform, type AppStateStatus } from "react-native";

/**
 * 30 s, the location prompt's own timeout (`PERMISSION_REQUEST_TIMEOUT_MS`),
 * so every prompt, camera and microphone included, holds the guard for at
 * most about 31 s with the replay delay (review, jits-mafl.2).
 */
export const PERMISSION_REQUEST_MAX_AGE_MS = 30_000;
export const SETTLE_REPLAY_DELAY_MS = 1_000;

/** Request id -> start time (ms epoch). */
const requests = new Map<number, number>();
let nextId = 0;
let expiryTimer: ReturnType<typeof setTimeout> | null = null;

/** Never keeps a Node (Jest) process alive; a no-op in React Native. */
function unrefTimer(t: ReturnType<typeof setTimeout>): void {
  (t as { unref?: () => void }).unref?.();
}
const settledListeners = new Set<() => void>();

export function permissionRequestInFlight(now: number = Date.now()): boolean {
  for (const startedAt of requests.values()) {
    if (now - startedAt < PERMISSION_REQUEST_MAX_AGE_MS) return true;
  }
  return false;
}

/**
 * True when an AppState "background" is the Android permission dialog, not
 * the athlete leaving. Always false on iOS (see the header).
 */
export function ignoreBackgroundForPermissionDialog(): boolean {
  return Platform.OS === "android" && permissionRequestInFlight();
}

function notifySettled(): void {
  for (const cb of [...settledListeners]) {
    try {
      cb();
    } catch {
      // One owner's failure never stops the others.
    }
  }
}

/** Drops expired requests; fires the settle hook when that empties the set. */
function scheduleExpiry(): void {
  if (expiryTimer) clearTimeout(expiryTimer);
  expiryTimer = null;
  if (requests.size === 0) return;
  const oldest = Math.min(...requests.values());
  const wait = Math.max(0, oldest + PERMISSION_REQUEST_MAX_AGE_MS - Date.now());
  expiryTimer = setTimeout(() => {
    expiryTimer = null;
    const now = Date.now();
    for (const [id, startedAt] of requests) {
      if (now - startedAt >= PERMISSION_REQUEST_MAX_AGE_MS) requests.delete(id);
    }
    if (requests.size === 0) notifySettled();
    else scheduleExpiry();
  }, wait);
  unrefTimer(expiryTimer);
}

/**
 * Runs `request` (one system permission prompt) with the in-flight counter
 * held. Exported for every prompt owner (the push and Photos prompts can use
 * it too).
 */
export async function trackPermissionRequest<T>(request: () => Promise<T>): Promise<T> {
  const id = ++nextId;
  requests.set(id, Date.now());
  scheduleExpiry();
  try {
    return await request();
  } finally {
    // A request that already expired (and was announced) settles quietly.
    if (requests.delete(id)) {
      scheduleExpiry();
      if (requests.size === 0) notifySettled();
    }
  }
}

/** Fires each time the last in-flight request settles or expires. */
export function onPermissionRequestsSettled(cb: () => void): () => void {
  settledListeners.add(cb);
  return () => {
    settledListeners.delete(cb);
  };
}

export interface PermissionDialogBackgroundGuard {
  /**
   * Call with EVERY AppState change. True means "ignore this background": it
   * is the Android permission dialog. Any other state (or a background that
   * is not ignored) clears a pending replay.
   */
  ignore(next: AppStateStatus): boolean;
  dispose(): void;
}

/**
 * For an owner whose "background" branch means "the athlete left": ignores
 * the Android dialog's background and, if the athlete pressed Home while the
 * dialog was up, runs `replay` (the owner's normal background branch) once
 * the requests settle or expire: `SETTLE_REPLAY_DELAY_MS` later, only if the
 * app is still in the background, no new prompt is up, and no other AppState
 * event reached the owner meanwhile. Android only (iOS never ignores).
 */
export function permissionDialogBackgroundGuard(replay: () => void): PermissionDialogBackgroundGuard {
  let pending = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const unsubscribe = onPermissionRequestsSettled(() => {
    if (!pending) return;
    const t = setTimeout(() => {
      timers.delete(t);
      if (!pending || permissionRequestInFlight() || AppState.currentState !== "background") return;
      pending = false;
      replay();
    }, SETTLE_REPLAY_DELAY_MS);
    unrefTimer(t);
    timers.add(t);
  });
  return {
    ignore(next) {
      if (next === "background" && ignoreBackgroundForPermissionDialog()) {
        pending = true;
        return true;
      }
      pending = false;
      return false;
    },
    dispose() {
      unsubscribe();
      for (const t of timers) clearTimeout(t);
      timers.clear();
      pending = false;
    },
  };
}

/** Tests only: call in afterEach. Drops every request and the expiry timer. */
export function __resetPermissionRequestsForTests(): void {
  requests.clear();
  if (expiryTimer) clearTimeout(expiryTimer);
  expiryTimer = null;
}

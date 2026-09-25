/**
 * App-wide Arena state: "am I live?" and the live challenge handshake.
 *
 * Being live PERSISTS across tabs, so the live state machine
 * (`use-arena-live.ts`), the `lobby:online` channel (`use-lobby-presence.ts`)
 * and the incoming-challenge listener (`use-arena-challenge.ts`) are each
 * mounted exactly once, by `<ArenaBootstrap />` in `app/(app)/_layout.tsx`.
 * Everything else (the Arena screen, the header LIVE signal) READS from here
 * and never mounts its own copy, which is what keeps a single presence track,
 * a single flag writer and a single challenge prompt.
 *
 * Same external-store shape as the lobby (`use-lobby-presence.ts`): a module
 * value, a listener set and `useSyncExternalStore`, so any component can read
 * it without a Provider wrap, including headers rendered outside `(app)`
 * (auth screens, profile setup), which simply read "not live".
 *
 * Actions go through a registered controller rather than through the snapshot,
 * so the functions consumers hold are stable for the life of the app and a
 * call made while no owner is mounted is a harmless no-op.
 */
import * as React from "react";
import { useSyncExternalStore } from "react";
import type {
  IncomingChallenge,
  OutgoingChallenge,
} from "./use-arena-challenge";

export interface ArenaState {
  isLive: boolean;
  isSaving: boolean;
  incoming: IncomingChallenge | null;
  outgoing: OutgoingChallenge | null;
  isBusy: boolean;
  capReached: boolean;
}

export interface ArenaController {
  toggle: () => Promise<void>;
  /** Take the athlete offline; resolves true once the flag clear landed. */
  goOffline: () => Promise<boolean>;
  sendChallenge: (opponentId: string, opponentName: string) => Promise<void>;
  cancelOutgoing: () => Promise<void>;
  clearCap: () => void;
}

export const IDLE_ARENA_STATE: ArenaState = Object.freeze({
  isLive: false,
  isSaving: false,
  incoming: null,
  outgoing: null,
  isBusy: false,
  capReached: false,
});

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

let state: ArenaState = IDLE_ARENA_STATE;
const listeners = new Set<() => void>();

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function getState(): ArenaState {
  return state;
}

function getIsLive(): boolean {
  return state.isLive;
}

/**
 * Replace the snapshot. A shallow-equal update is dropped so a re-render of
 * the owner that changed nothing does not wake every header in the app.
 */
export function publishArenaState(next: ArenaState): void {
  const keys = Object.keys(next) as (keyof ArenaState)[];
  if (keys.every((k) => next[k] === state[k])) return;
  state = next;
  for (const l of listeners) l();
}

/** The full snapshot. For the Arena screen. */
export function useArenaState(): ArenaState {
  return useSyncExternalStore(subscribe, getState, getState);
}

/**
 * Just the live bit, as a primitive, so a header re-renders only when the
 * athlete goes live or offline and not on every challenge state change.
 */
export function useIsArenaLive(): boolean {
  return useSyncExternalStore(subscribe, getIsLive, getIsLive);
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

let controller: ArenaController | null = null;

/** Called by the owner. Returns the matching unregister. */
export function registerArenaController(next: ArenaController): () => void {
  controller = next;
  return () => {
    if (controller === next) controller = null;
  };
}

/** Stable delegates; safe to hold across renders and across owner remounts. */
export const arenaActions: ArenaController = Object.freeze({
  toggle: () => controller?.toggle() ?? Promise.resolve(),
  goOffline: () => controller?.goOffline() ?? Promise.resolve(true),
  sendChallenge: (opponentId: string, opponentName: string) =>
    controller?.sendChallenge(opponentId, opponentName) ?? Promise.resolve(),
  cancelOutgoing: () => controller?.cancelOutgoing() ?? Promise.resolve(),
  clearCap: () => controller?.clearCap(),
});

// ---------------------------------------------------------------------------
// Roster correction hook-in
// ---------------------------------------------------------------------------

let opponentUnavailableHandler: ((opponentId: string) => void) | null = null;

/**
 * The Arena screen owns the roster, the app-wide owner owns the challenge
 * hook, and a refused challenge insert has to reach the roster so the stale
 * row gets re-read. The screen registers its `refresh` here.
 */
export function setOpponentUnavailableHandler(
  handler: ((opponentId: string) => void) | null,
): void {
  opponentUnavailableHandler = handler;
}

export function notifyOpponentUnavailable(opponentId: string): void {
  opponentUnavailableHandler?.(opponentId);
}

// ---------------------------------------------------------------------------
// In a match
// ---------------------------------------------------------------------------

/**
 * How many match screens are mounted. A count, not a boolean, so a
 * `router.replace` that mounts the next match screen before the old one
 * unmounts cannot clear the bit early.
 *
 * Lives here rather than in the owner because the match screen can mount
 * BEFORE the owner (a launch straight into `/match/<id>`: the Stack's effects
 * run before its sibling's), and the owner must still see it.
 */
let matchScreens = 0;
const matchListeners = new Set<() => void>();

function subscribeMatch(callback: () => void): () => void {
  matchListeners.add(callback);
  return () => {
    matchListeners.delete(callback);
  };
}

function getInMatch(): boolean {
  return matchScreens > 0;
}

/** True while any match screen is mounted. */
export function useIsInArenaMatch(): boolean {
  return useSyncExternalStore(subscribeMatch, getInMatch, getInMatch);
}

/**
 * Mark a match screen as mounted for its lifetime. While any is mounted the
 * athlete is offline and no challenge prompt is raised; every exit path
 * (summary done, abort, back gesture, `router.replace`) unmounts the screen,
 * which is what restores live.
 */
export function useArenaMatchScreen(): void {
  React.useEffect(() => {
    matchScreens += 1;
    for (const l of matchListeners) l();
    return () => {
      matchScreens = Math.max(0, matchScreens - 1);
      for (const l of matchListeners) l();
    };
  }, []);
}

// ---------------------------------------------------------------------------
// Sign-out
// ---------------------------------------------------------------------------

/** How long sign-out waits for the flag clear before signing out anyway. */
export const SIGN_OUT_OFFLINE_TIMEOUT_MS = 4_000;

/**
 * Clear `looking_for_ranked` while the session still exists.
 *
 * The owner's unmount also goes offline, but it only unmounts AFTER
 * `supabase.auth.signOut()` has dropped the session, at which point the write
 * is refused by RLS and the athlete stays advertised as "Open to challenges"
 * with nobody signed in. Bounded, because a dead network must not trap the
 * athlete on a sign-out that never finishes.
 */
export async function takeArenaOfflineBeforeSignOut(
  timeoutMs = SIGN_OUT_OFFLINE_TIMEOUT_MS,
): Promise<void> {
  // Not gated on `isLive`: a go-live still in flight has not flipped it yet,
  // and the reconcile queue turns an already-offline call into a no-op.
  if (!controller) return;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });
  try {
    await Promise.race([controller.goOffline().then(() => undefined), timeout]);
  } catch (error: unknown) {
    console.warn("[arena] going offline before sign-out failed:", error);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Test-only: drop all module state between suites. */
export function __resetArenaStoreForTests(): void {
  state = IDLE_ARENA_STATE;
  controller = null;
  opponentUnavailableHandler = null;
  listeners.clear();
  matchScreens = 0;
  matchListeners.clear();
}

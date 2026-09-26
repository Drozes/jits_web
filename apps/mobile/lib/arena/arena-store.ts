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

/**
 * Stale outgoing challenges were withdrawn (jits-celf). The roster read its
 * "Pending" rows at load, so the same registered `refresh` re-reads them;
 * without it those athletes stay unchallengeable until the next pull.
 */
export function notifyStaleChallengesCancelled(): void {
  opponentUnavailableHandler?.("");
}

// ---------------------------------------------------------------------------
// In a match
// ---------------------------------------------------------------------------

/**
 * How many match screens are mounted. A count, not a boolean, so a
 * navigation that mounts the next match screen before the old one unmounts
 * (a match pushed from a match) cannot clear the bit early.
 *
 * Lives here rather than in the owner because the match screen can mount
 * BEFORE the owner (a launch straight into `/match/<id>`: the Stack's effects
 * run before its sibling's), and the owner must still see it.
 */
let matchScreens = 0;
/**
 * How many times the athlete has left a match: the in-match bit going from
 * true to false. Match exits pop back to tab screens that stayed mounted
 * underneath (exitMatchTo's dismissTo, jits-tlk3), so nothing remounts and
 * refetches on its own; screens whose data a match changes (the Arena roster,
 * Home, Profile) key a refresh off this instead.
 */
let matchExits = 0;
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

function getMatchExits(): number {
  return matchExits;
}

/** Bumps each time the last mounted match screen unmounts. */
export function useMatchExitCount(): number {
  return useSyncExternalStore(subscribeMatch, getMatchExits, getMatchExits);
}

/**
 * Mark a match screen as mounted for its lifetime. While any is mounted the
 * athlete is offline and no challenge prompt is raised; every exit path
 * (summary exits via `exitMatchTo`, abort, back gesture) removes the route and
 * unmounts the screen, which is what restores live.
 *
 * `matchId` (the match route passes it) is remembered on the way out, so
 * Home's Resume card does not offer a match the athlete just left on purpose
 * (jits-r9a). Only for this app process: a kill clears it, which is exactly
 * the case Resume exists for.
 */
export function useArenaMatchScreen(matchId?: string): void {
  React.useEffect(() => {
    matchScreens += 1;
    for (const l of matchListeners) l();
    return () => {
      // Before the listeners run, so a refresh keyed off the exit sees it.
      if (matchId) leftMatchIds.add(matchId);
      const wasInMatch = matchScreens > 0;
      matchScreens = Math.max(0, matchScreens - 1);
      if (wasInMatch && matchScreens === 0) matchExits += 1;
      for (const l of matchListeners) l();
    };
  }, [matchId]);
}

/** Match ids whose screen unmounted during this app process. */
const leftMatchIds = new Set<string>();

/** The matches the athlete has left (not a snapshot: read it when needed). */
export function getLeftMatchIds(): ReadonlySet<string> {
  return leftMatchIds;
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
  leftMatchIds.clear();
}

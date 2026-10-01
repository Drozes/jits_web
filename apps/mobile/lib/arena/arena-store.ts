/**
 * App-wide Arena state: "am I live?" and the live challenge handshake.
 *
 * Being live PERSISTS across tabs, so the live state machine
 * (`use-arena-live.ts`), the `lobby:online` channel (`use-lobby-presence.ts`)
 * and the incoming-challenge listener (`use-arena-challenge.ts`) are each
 * mounted exactly once, by `<ArenaBootstrap />` in `app/(app)/_layout.tsx`.
 * Everything else (the Arena screen, the header status chip) READS from here
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
import { isUuid } from "@jits/shared/utils";
import { LIVE_SWITCH_COOLDOWN_MS } from "./constants";
import type {
  IncomingChallenge,
  OutgoingChallenge,
} from "./use-arena-challenge";

export interface ArenaState {
  isLive: boolean;
  isSaving: boolean;
  /**
   * A live transition is in flight, and which way it is heading; null
   * otherwise. This INCLUDES ones the athlete did not start (restoring live on
   * return to the foreground or after a match, the arrival re-assert), which
   * `isSaving` does not, and may also be set during the athlete's own toggle.
   * The live switch reads both, so read it through `useLiveSwitchPhase()` /
   * `useLiveSwitchDirection()` rather than this field.
   */
  liveTransition: LiveSwitchDirection | null;
  incoming: IncomingChallenge | null;
  outgoing: OutgoingChallenge | null;
  /**
   * Fresh challenges waiting on me, the prompt's included (spec 5, F9). The
   * prompt shows one; the chip reads "! 3 WANT TO ROLL" off this.
   */
  incomingCount: number;
  /**
   * `incoming` was minimized with "Later": the sheet is down and the chip
   * carries it (`! ALEX · 8:41`). Always false while `incoming` is null.
   */
  incomingTucked: boolean;
  isBusy: boolean;
  capReached: boolean;
  /**
   * The last go-live attempt failed its flag write, from any path (the chip,
   * the Arena toggle, the popover, a foreground or post-match restore, the
   * arrival re-assert). The chip reads `○ OFFLINE · RETRY` off this (AC-H11).
   * Cleared by the next transition that lands, either way.
   */
  lastLiveWriteFailed: boolean;
  /**
   * Live, but the lobby channel is down or rejoining (`useLobbyKnown()` is
   * false), so the athlete's presence cannot be vouched for. The chip reads
   * `◌ RECONNECTING` off this (AC-H11). Always false while offline.
   */
  reconnecting: boolean;
}

export interface ArenaController {
  toggle: () => Promise<void>;
  /** Take the athlete offline; resolves true once the flag clear landed. */
  goOffline: () => Promise<boolean>;
  /**
   * Go live without reversing a live intent (unlike toggle). "ignored": the
   * athlete closed a Go Live location state (match_location_required), which
   * already said why, so callers stay silent.
   */
  goLive: () => Promise<boolean | LiveSwitchIgnored>;
  sendChallenge: (opponentId: string, opponentName: string) => Promise<void>;
  cancelOutgoing: () => Promise<void>;
  clearCap: () => void;
  /** "Later" on the prompt: minimize it into the chip. Sends nothing. */
  tuckIncoming: () => void;
  /** Bring a tucked prompt back up (the chip tap). */
  reopenIncoming: () => void;
  /**
   * The challenge was taken off the prompt for good without an answer (its
   * live window passed, or a manual go-offline dropped it from the chip,
   * decision Q3). Recovery never offers it again, so no surface may offer a
   * go-live for it either. Optional so a test controller may omit it.
   */
  isIncomingDismissed?: (challengeId: string) => boolean;
}

export const IDLE_ARENA_STATE: ArenaState = Object.freeze({
  isLive: false,
  isSaving: false,
  liveTransition: null,
  incoming: null,
  outgoing: null,
  incomingCount: 0,
  incomingTucked: false,
  isBusy: false,
  capReached: false,
  lastLiveWriteFailed: false,
  reconnecting: false,
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

/** Wake every subscriber (state, self id, controller or switch changed). */
function emitArena(): void {
  for (const l of listeners) l();
}

function getState(): ArenaState {
  return state;
}

function getIsLive(): boolean {
  return state.isLive;
}

function getIncomingCount(): number {
  return state.incomingCount;
}

/**
 * Replace the snapshot. A shallow-equal update is dropped so a re-render of
 * the owner that changed nothing does not wake every header in the app.
 */
export function publishArenaState(next: ArenaState): void {
  const keys = Object.keys(next) as (keyof ArenaState)[];
  if (keys.every((k) => next[k] === state[k])) return;
  state = next;
  emitArena();
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

/**
 * Just the incoming count, as a primitive, so the always-mounted tab bar
 * re-renders only when it changes (the Arena tab badge).
 */
export function useArenaIncomingCount(): number {
  return useSyncExternalStore(subscribe, getIncomingCount, getIncomingCount);
}

// ---------------------------------------------------------------------------
// Signed-in athlete
// ---------------------------------------------------------------------------

let selfId: string | null = null;

function getSelfId(): string | null {
  return selfId;
}

/**
 * The owner's athlete id (set by `<ArenaBootstrap />` while it is mounted,
 * null otherwise). The header chip needs it to leave self out of the lobby
 * count and to read the athlete's own result to confirm, and reads it here so
 * a header never needs the auth Provider.
 */
export function publishArenaSelfId(next: string | null): void {
  if (next === selfId) return;
  selfId = next;
  emitArena();
}

/** The signed-in athlete the Arena belongs to, or null (none mounted). */
export function useArenaSelfId(): string | null {
  return useSyncExternalStore(subscribe, getSelfId, getSelfId);
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

let controller: ArenaController | null = null;

/**
 * Called by the owner. Returns the matching unregister. Both notify, so a
 * control that depends on an owner being mounted (`useHasArenaController`)
 * re-renders when one arrives or leaves.
 */
export function registerArenaController(next: ArenaController): () => void {
  const changed = controller === null;
  controller = next;
  if (changed) emitArena();
  return () => {
    if (controller === next) {
      controller = null;
      emitArena();
    }
  };
}

function getHasController(): boolean {
  return controller !== null;
}

/**
 * Whether an owner (`<ArenaBootstrap />`) has registered its controller. With
 * none, every guarded action resolves "ignored" and does nothing, so a live
 * switch must not look actionable (the Arena skeleton, the window before the
 * owner mounts). A primitive, so it re-renders only when it flips.
 */
export function useHasArenaController(): boolean {
  return useSyncExternalStore(subscribe, getHasController, getHasController);
}

/**
 * Whether the owner's challenge hook dismissed this incoming challenge for
 * good (see `ArenaController.isIncomingDismissed`). False with no owner.
 */
export function isIncomingChallengeDismissed(challengeId: string): boolean {
  return controller?.isIncomingDismissed?.(challengeId) ?? false;
}

// ---------------------------------------------------------------------------
// Live switch guard (spec 4.3, F11)
// ---------------------------------------------------------------------------

/**
 * What the athlete-facing live switch (header chip, Arena toggle) may do now:
 *  - "saving": a transition is in flight (`isSaving`, a guarded call that
 *    has not settled, or a programmatic restore: `liveTransition`); the
 *    switch is disabled and the chip reads GOING LIVE when that is the way
 *    it is heading;
 *  - "cooldown": a guarded go-live or go-offline completed less than
 *    `LIVE_SWITCH_COOLDOWN_MS` ago; the switch is disabled;
 *  - "ready": a tap is honoured.
 * There is deliberately no undo: the realtime server closes the presence
 * channel past 5 track/untrack calls per 30s (jits-fa9x), and an undo is one
 * more of them.
 */
export type LiveSwitchPhase = "ready" | "saving" | "cooldown";

/**
 * Which way a "saving" switch is going, so the chip can say GOING LIVE only
 * when it is, and keep its live styling while a go-offline is in flight.
 */
export type LiveSwitchDirection = "going-live" | "going-offline";

/**
 * What a guarded call did. `"ignored"` means the tap was swallowed by the
 * guard ("saving" or "cooldown") and nothing was attempted: never report it
 * as a failure. Otherwise the call's own result (true once the transition
 * landed, false when it failed).
 */
export type LiveSwitchIgnored = "ignored";

let switchInFlight = false;
let switchDirection: LiveSwitchDirection | null = null;
let switchCooldown = false;
let cooldownTimer: ReturnType<typeof setTimeout> | null = null;

function getLiveSwitchPhase(): LiveSwitchPhase {
  if (state.isSaving || state.liveTransition || switchInFlight) return "saving";
  if (switchCooldown) return "cooldown";
  return "ready";
}

/** The switch phase, as a primitive (re-renders only when it changes). */
export function useLiveSwitchPhase(): LiveSwitchPhase {
  return useSyncExternalStore(subscribe, getLiveSwitchPhase, getLiveSwitchPhase);
}

/** True while the live switch must ignore taps ("saving" or "cooldown"). */
export function useLiveSwitchLocked(): boolean {
  return useLiveSwitchPhase() !== "ready";
}

function getLiveSwitchDirection(): LiveSwitchDirection | null {
  if (switchInFlight) return switchDirection;
  // A restore the app started knows where it is heading.
  if (state.liveTransition) return state.liveTransition;
  // A toggle outside the guard cannot happen (arenaActions.toggle is
  // guarded), but `isSaving` alone still has a direction: away from now.
  if (state.isSaving) return state.isLive ? "going-offline" : "going-live";
  return null;
}

/**
 * The direction of the transition in flight, or null when the switch is not
 * "saving". A primitive, so it re-renders only when it changes.
 */
export function useLiveSwitchDirection(): LiveSwitchDirection | null {
  return useSyncExternalStore(subscribe, getLiveSwitchDirection, getLiveSwitchDirection);
}

/**
 * Run one athlete-initiated live transition under the guard.
 *
 * The cooldown starts once the attempt settles, whether it landed, failed or
 * threw: a failed go-live may still have spent a presence track/untrack
 * (jits-fa9x), so a failure is not a free retry. The chip's
 * `OFFLINE · RETRY` (AC-H11) therefore reads phase "cooldown" for 2s after a
 * failure and must render DISABLED then (read `useLiveSwitchPhase()`), not as
 * a live button that swallows the tap. A call made
 * while the switch is not "ready" is IGNORED (resolves "ignored"), not
 * queued: a queued tap would fire after the athlete has already seen the
 * state they asked for. With no owner mounted (signed out, before
 * `<ArenaBootstrap />`) nothing was attempted either, so the tap is
 * "ignored" too (never a failure a caller would toast) and no cooldown
 * starts, so a harmless no-op tap never locks the switch.
 */
async function runGuarded<T>(
  direction: LiveSwitchDirection,
  work: (c: ArenaController) => Promise<T>,
): Promise<T | LiveSwitchIgnored> {
  if (!controller) return "ignored";
  if (getLiveSwitchPhase() !== "ready") return "ignored";
  const current = controller;
  switchInFlight = true;
  switchDirection = direction;
  emitArena();
  try {
    return await work(current);
  } finally {
    switchInFlight = false;
    switchDirection = null;
    switchCooldown = true;
    if (cooldownTimer) clearTimeout(cooldownTimer);
    cooldownTimer = setTimeout(() => {
      cooldownTimer = null;
      switchCooldown = false;
      emitArena();
    }, LIVE_SWITCH_COOLDOWN_MS);
    emitArena();
  }
}

/**
 * The athlete-facing live switch: the header chip and the Arena toggle go
 * through these (or the same guarded calls on `arenaActions`), so both share
 * one "disabled while saving" and one 2s cooldown (AC-H3, AC-H4).
 * `goOffline` here is a MANUAL go-offline, which also drops a challenge
 * tucked into the chip without declining it (decision Q3).
 */
export const liveSwitch = Object.freeze({
  /**
   * Resolves "ignored" for a swallowed tap; the toggle toasts its own failure.
   * The controller's toggle reverses the live INTENT, not the committed
   * `isLive`. The two differ only while a transition is in flight, and then
   * the phase is "saving" (`isSaving` or `liveTransition`) and the tap never
   * gets here, so the direction reported from `isLive` is what toggle does.
   */
  toggle: (): Promise<void | LiveSwitchIgnored> =>
    runGuarded(state.isLive ? "going-offline" : "going-live", (c) => c.toggle()),
  goLive: (): Promise<boolean | LiveSwitchIgnored> =>
    runGuarded("going-live", (c) => c.goLive()),
  goOffline: (): Promise<boolean | LiveSwitchIgnored> =>
    runGuarded("going-offline", (c) => c.goOffline()),
});

/**
 * What the rest of the app calls. `toggle`, `goLive` and `goOffline` are the
 * TAP-facing calls and run under the live switch guard, exactly like
 * `liveSwitch` (they are the same functions): a swallowed tap resolves
 * "ignored", never a failure. There is deliberately no unguarded go-offline:
 * a programmatic go-offline is sign-out, which uses
 * `takeArenaOfflineBeforeSignOut`.
 *
 * `toggle` has no UI caller since the Arena control bar moved to explicit
 * `goLiveWithFeedback` / `goOfflineWithFeedback`. It is kept, guarded, as the
 * one reversing entry point to the controller (the guard tests drive it, and
 * `useArenaLive.toggle` still owns the reversing semantics). New UI should
 * call `goLive` / `goOffline`, which say which way they go.
 */
export interface ArenaActions
  extends Omit<ArenaController, "goLive" | "goOffline"> {
  goLive: () => Promise<boolean | LiveSwitchIgnored>;
  goOffline: () => Promise<boolean | LiveSwitchIgnored>;
}

/**
 * Stable delegates; safe to hold across renders and across owner remounts.
 * The header chip, its popover and the Arena toggle may call `toggle`,
 * `goLive` and `goOffline` here or on `liveSwitch`: both share one "disabled
 * while saving" and one 2s cooldown (AC-H2, AC-H3, AC-H4).
 */
export const arenaActions: ArenaActions = Object.freeze({
  toggle: () => liveSwitch.toggle().then(() => undefined),
  goOffline: liveSwitch.goOffline,
  goLive: liveSwitch.goLive,
  sendChallenge: (opponentId: string, opponentName: string) =>
    controller?.sendChallenge(opponentId, opponentName) ?? Promise.resolve(),
  cancelOutgoing: () => controller?.cancelOutgoing() ?? Promise.resolve(),
  clearCap: () => controller?.clearCap(),
  tuckIncoming: () => controller?.tuckIncoming(),
  reopenIncoming: () => controller?.reopenIncoming(),
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

/** Clears the handler only if it is still `handler` (a newer owner keeps its own). */
export function clearOpponentUnavailableHandler(handler: (opponentId: string) => void): void {
  if (opponentUnavailableHandler === handler) opponentUnavailableHandler = null;
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
// An incoming challenge ended
// ---------------------------------------------------------------------------

const incomingEndedListeners = new Set<(challengeId: string) => void>();

/**
 * An incoming challenge stopped being pending and fresh for this athlete:
 * answered, withdrawn by its challenger, expired, or dropped by a read. Sent
 * by the challenge hook whether or not the challenge was on the prompt, so a
 * surface that shows one it is NOT on (the Arena's deep-link offer strip,
 * AC-A8) can drop it instead of offering a go-live for nothing.
 */
export function notifyIncomingChallengeEnded(challengeId: string): void {
  for (const l of [...incomingEndedListeners]) l(challengeId);
}

/** Subscribe to `notifyIncomingChallengeEnded`. Returns the unsubscribe. */
export function subscribeIncomingChallengeEnded(
  listener: (challengeId: string) => void,
): () => void {
  incomingEndedListeners.add(listener);
  return () => {
    incomingEndedListeners.delete(listener);
  };
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

/** Non-hook read of the in-match bit (notification routing, outside React). */
export function isInArenaMatch(): boolean {
  return getInMatch();
}

/** Non-hook subscription to the in-match bit and the exit count. */
export function subscribeArenaMatch(callback: () => void): () => void {
  return subscribeMatch(callback);
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
      // Only real ids: a malformed route param must never reach a filter.
      if (matchId && isUuid(matchId)) leftMatchIds.add(matchId);
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
// Incoming reopen surfaces (AC-S4)
// ---------------------------------------------------------------------------

/**
 * How many mounted surfaces can bring a challenge tucked away with "Later"
 * back up (the header chip's `! ALEX · 8:41` state, which calls
 * `arenaActions.reopenIncoming`). A count, like `matchScreens`, so a
 * navigation that mounts the next header before the old one unmounts never
 * reads zero in between.
 *
 * The prompt only offers Later while at least one is mounted, and a tucked
 * challenge comes straight back up if the last one goes away. Without that, a
 * build without the chip (or a screen that renders no header) would let Later
 * hide a challenge with no way to answer it until it lapsed.
 */
let reopenSurfaces = 0;
const reopenListeners = new Set<() => void>();

function subscribeReopen(callback: () => void): () => void {
  reopenListeners.add(callback);
  return () => {
    reopenListeners.delete(callback);
  };
}

function getHasReopenSurface(): boolean {
  return reopenSurfaces > 0;
}

/**
 * Declare, while `active` (default true), that the calling component can
 * reopen a tucked incoming challenge (it renders the tucked state and calls
 * `arenaActions.reopenIncoming` when tapped). The header chip mounts this and
 * passes its screen's focus: tab roots stay mounted under pushed screens, and
 * a chip hidden under one must not count as a way back to the challenge.
 */
export function useIncomingReopenSurface(active: boolean = true): void {
  React.useEffect(() => {
    if (!active) return;
    reopenSurfaces += 1;
    for (const l of reopenListeners) l();
    return () => {
      reopenSurfaces = Math.max(0, reopenSurfaces - 1);
      for (const l of reopenListeners) l();
    };
  }, [active]);
}

/** True while any surface that can reopen a tucked challenge is mounted. */
export function useHasIncomingReopenSurface(): boolean {
  return useSyncExternalStore(subscribeReopen, getHasReopenSurface, getHasReopenSurface);
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
  // Left matches belong to this athlete; the next one to sign in starts clean.
  leftMatchIds.clear();
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
  selfId = null;
  controller = null;
  opponentUnavailableHandler = null;
  listeners.clear();
  switchInFlight = false;
  switchDirection = null;
  switchCooldown = false;
  if (cooldownTimer) clearTimeout(cooldownTimer);
  cooldownTimer = null;
  matchScreens = 0;
  matchExits = 0;
  matchListeners.clear();
  leftMatchIds.clear();
  reopenSurfaces = 0;
  reopenListeners.clear();
  incomingEndedListeners.clear();
}

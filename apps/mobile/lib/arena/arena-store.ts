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
import { AppState } from "react-native";
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
  /**
   * The server state the owner has committed: `live`, and `settled` (nothing
   * in flight, the request matches it). The driver reads it to know whether
   * the athlete's choice is met. Optional: without it, `isLive` is used.
   */
  committed?: () => { live: boolean; settled: boolean };
  /**
   * Bring the server offline without the manual go-offline's side effects
   * (the app decided, not the athlete). Serialized behind any write in
   * flight. Optional: `goOffline` is used without it.
   */
  ensureOffline?: () => Promise<boolean>;
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
  if (next.isLive) {
    // Live landed: a display kept for it, or a stale OFFLINE · RETRY, goes.
    if (clearDisplayOnLive || goLiveDisplay === "retry") goLiveDisplay = null;
    clearDisplayOnLive = false;
    needsLocation = false;
  }
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
// Go-live display (UX 019, instant go-live)
// ---------------------------------------------------------------------------

/**
 * What the live surfaces DRAW while a go-live is resolving, on top of the
 * committed `isLive` (which stays the server truth, for everything that acts
 * on it). Null: draw `isLive` as is.
 *  - `hold`: the first `PENDING_REVEAL_MS` after a tap, before any pending
 *    state is drawn; looks offline, takes no taps;
 *  - `optimistic`: the device holds a valid location tag, the write is in
 *    flight; drawn exactly as live (UX 019, C1);
 *  - `going-live`: GOING LIVE pending (no connection at the tap, or the OS
 *    cache lookup still running at 240 ms);
 *  - `finding-you`: FINDING YOU pending (a fresh fix is running);
 *  - `recovering`: RECONNECTING (an optimistic write did not land at once);
 *  - `retry`: OFFLINE · RETRY after the recovery window ran out;
 *  - `restore-live` / `restore-finding`: an automatic restore (foreground,
 *    after a match, cold start), drawn live from the first frame when the
 *    device holds a valid tag, else FINDING YOU (UX 019, C2).
 */
export type GoLiveDisplay =
  | "hold"
  | "optimistic"
  | "going-live"
  | "finding-you"
  | "recovering"
  | "retry"
  | "restore-live"
  | "restore-finding"
  /**
   * A go-offline the athlete chose during the post-transition cooldown,
   * queued until it ends (QA D): drawn offline at once, takes no taps.
   */
  | "leaving";

/** Time after a tap before any pending state is drawn (`duration.fast`). */
export const PENDING_REVEAL_MS = 240;

let goLiveDisplay: GoLiveDisplay | null = null;
/** The last attempt ended for location (accessibility hint "Location needed to go live"). */
let needsLocation = false;
/** The go-live Moment (haptic + blade clash) of the current tapped attempt was spent. */
let goLiveMomentSpent = false;

export function getGoLiveDisplay(): GoLiveDisplay | null {
  return goLiveDisplay;
}

let revealTimer: ReturnType<typeof setTimeout> | null = null;

function cancelReveal(): void {
  if (revealTimer) clearTimeout(revealTimer);
  revealTimer = null;
}

/**
 * Set what the live surfaces draw. Any explicit set cancels a scheduled
 * reveal: the flow knows more than the timer did.
 */
export function setGoLiveDisplay(next: GoLiveDisplay | null): void {
  cancelReveal();
  if (next === goLiveDisplay) return;
  goLiveDisplay = next;
  emitArena();
}

/**
 * While the display is still `hold`, switch it to `kind` at `atMs` (ms
 * epoch): the 240 ms pending reveal (UX 019, 2.3). Replaces a reveal
 * already scheduled, keeping the flow's own clock. Already past: at once.
 */
export function scheduleGoLiveReveal(kind: GoLiveDisplay, atMs: number): void {
  cancelReveal();
  const fire = () => {
    revealTimer = null;
    if (goLiveDisplay !== "hold") return;
    goLiveDisplay = kind;
    emitArena();
  };
  const wait = atMs - Date.now();
  if (wait <= 0) fire();
  else revealTimer = setTimeout(fire, wait);
}

/** The display overlay, as a primitive. */
export function useGoLiveDisplay(): GoLiveDisplay | null {
  return useSyncExternalStore(subscribe, getGoLiveDisplay, getGoLiveDisplay);
}

/**
 * A go-live landed but the owner has not published `isLive` yet (it does in
 * an effect after the write): keep the display until it has, so no GO LIVE
 * frame slips between the pending (or optimistic) chip and LIVE.
 */
let clearDisplayOnLive = false;
let clearDisplayTimer: ReturnType<typeof setTimeout> | null = null;
/** Longest a landed go-live keeps its display waiting for `isLive` to publish. */
export const DISPLAY_LIVE_WAIT_MS = 1_000;

function keepDisplayUntilLive(): void {
  cancelReveal();
  clearDisplayOnLive = true;
  if (clearDisplayTimer) clearTimeout(clearDisplayTimer);
  // Safety net: the owner publishes within a render; never leave a stale
  // overlay up if it does not (unmounted, a test without an owner).
  clearDisplayTimer = setTimeout(() => {
    clearDisplayTimer = null;
    if (!clearDisplayOnLive) return;
    clearDisplayOnLive = false;
    setGoLiveDisplay(null);
  }, DISPLAY_LIVE_WAIT_MS);
}

/** Clear the display now if the store already says live, else as soon as it does. */
export function clearGoLiveDisplayWhenLive(): void {
  if (state.isLive) {
    clearDisplayOnLive = false;
    setGoLiveDisplay(null);
    return;
  }
  keepDisplayUntilLive();
}

/** Whether a display kind is drawn as live. */
export function displayDrawsLive(display: GoLiveDisplay | null, isLive: boolean): boolean {
  if (display === "optimistic" || display === "restore-live") return true;
  if (display === null) return isLive;
  // Every other overlay is a not-yet-live (or failed) state; a committed
  // live flag still wins (a late write that landed is the truth).
  return isLive && display !== "hold" && display !== "leaving";
}

function getDisplayLive(): boolean {
  // The athlete's (or the app's) offline choice is drawn at once, whatever
  // the server still says while the clear goes out (review round 3).
  if (intent.decided && !intent.live) return false;
  return displayDrawsLive(goLiveDisplay, state.isLive);
}

/**
 * Live as the athlete SEES it (the chip, the Arena bar, the tab dot and
 * icon): the committed flag, or an optimistic / restore overlay.
 */
export function useIsArenaDisplayLive(): boolean {
  return useSyncExternalStore(subscribe, getDisplayLive, getDisplayLive);
}

export function setNeedsLocation(next: boolean): void {
  if (next === needsLocation) return;
  needsLocation = next;
  emitArena();
}

function getNeedsLocation(): boolean {
  return needsLocation;
}

export function useNeedsLocation(): boolean {
  return useSyncExternalStore(subscribe, getNeedsLocation, getNeedsLocation);
}

/**
 * The go-live Moment (the `goLive` haptic and the tab icon's blade clash)
 * fires once per tapped attempt (UX 019, section 5): a RECONNECTING beat
 * followed by success must not fire it again. True the first time it is
 * claimed within the current attempt.
 */
export function claimGoLiveMoment(): boolean {
  if (goLiveMomentSpent) return false;
  goLiveMomentSpent = true;
  return true;
}

// ---------------------------------------------------------------------------
// The live menu's open state (the drift sheet waits for it to close)
// ---------------------------------------------------------------------------

let liveMenusOpen = 0;
const menuListeners = new Set<() => void>();

/** The header live menu registers itself while it is open. */
export function useRegisterLiveMenuOpen(open: boolean): void {
  React.useEffect(() => {
    if (!open) return;
    liveMenusOpen += 1;
    for (const l of [...menuListeners]) l();
    return () => {
      liveMenusOpen = Math.max(0, liveMenusOpen - 1);
      for (const l of [...menuListeners]) l();
    };
  }, [open]);
}

export function useLiveMenuOpen(): boolean {
  return useSyncExternalStore(
    (cb) => {
      menuListeners.add(cb);
      return () => {
        menuListeners.delete(cb);
      };
    },
    () => liveMenusOpen > 0,
    () => liveMenusOpen > 0,
  );
}

// ---------------------------------------------------------------------------
// Nearby On the mat count (jr_be 016 addendum)
// ---------------------------------------------------------------------------

/**
 * The Arena's On the mat count while it is in nearby mode (only the athletes
 * on my mat), or null in any fallback mode. The header chip's `· N` must be
 * the number of On the mat rows the Arena renders (spec 14, D2), so
 * `useOnMatCount` prefers this over the whole-lobby count. `count: null`:
 * nearby mode, but the rows are not known yet.
 */
export type NearbyOnMatCount = { count: number | null } | null;

let nearbyOnMat: NearbyOnMatCount = null;
const nearbyListeners = new Set<() => void>();

export function publishNearbyOnMatCount(next: NearbyOnMatCount): void {
  if (next === nearbyOnMat || (next && nearbyOnMat && next.count === nearbyOnMat.count)) return;
  nearbyOnMat = next;
  for (const l of nearbyListeners) l();
}

export function getNearbyOnMatCount(): NearbyOnMatCount {
  return nearbyOnMat;
}

export function subscribeNearbyOnMatCount(callback: () => void): () => void {
  nearbyListeners.add(callback);
  return () => {
    nearbyListeners.delete(callback);
  };
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
  if (changed) {
    // A new owner (sign-in, an athlete switch): its own intent, and writes
    // allowed again. (Its arrival frame may already be drawn: kept.) A
    // driver loop left from the last owner stops at its next step.
    driverGen += 1;
    driving = false;
    switchInFlight = false;
    switchDirection = null;
    liveWritesBlocked = false;
    settleAllWaiters("ignored");
    intent = Object.freeze({ live: false, seq: intent.seq + 1, decided: false, explicit: false });
  }
  controller = next;
  if (changed) emitArena();
  return () => {
    if (controller === next) {
      controller = null;
      // The owner left: nothing it drew (a stale OFFLINE · RETRY) outlives it (QA 3).
      settleAllWaiters("ignored");
      resetLiveOverlayState();
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
// The athlete's live intent: the single source of truth (review round 3)
// ---------------------------------------------------------------------------

/**
 * What the live surfaces may do now, for information only (a transition in
 * flight, or the throttle after one). Controls never lock on it any more:
 * every tap records the athlete's choice at once (see `LiveIntent`), and the
 * phase only paces SERVER writes.
 *  - "saving": a go-live attempt or a restore is running, or a write is in
 *    flight (`isSaving`, `liveTransition`);
 *  - "cooldown": the last server transition ended less than
 *    `LIVE_SWITCH_COOLDOWN_MS` ago; the next LIVE write waits (presence rate
 *    limit, jits-fa9x);
 *  - "ready".
 */
export type LiveSwitchPhase = "ready" | "saving" | "cooldown";

/** Which way a transition in flight is going. */
export type LiveSwitchDirection = "going-live" | "going-offline";

/**
 * A choice that did not run to its own result: a newer choice replaced it,
 * there is no owner (signed out), or the app is not in front. Never a
 * failure a caller would toast.
 */
export type LiveSwitchIgnored = "ignored";

/**
 * The athlete's last choice, live or offline (review round 3). Every tap (the
 * chip, the live menu, the Arena bar and rows, the drift prompt, a toast's
 * call to action) sets it at once and synchronously, whatever is in flight,
 * and the live surfaces draw it at once. One serialized driver then moves the
 * SERVER toward it; writes are serialized and the LIVE write is paced, but a
 * choice is never dropped, delayed or disabled.
 *  - `seq`: bumped by every choice, so work started for an older one can tell.
 *  - `decided`: some choice was made since this owner mounted (false on a
 *    cold start until the athlete or the app decides).
 *  - `explicit`: the athlete chose (a tap); false when the app decided: a
 *    go-live that could not be met, a tapped go-live abandoned by the
 *    background or a match, the server ending the session, sign-out.
 * Resume (background, a match, a kill and relaunch) is derived from it: an
 * athlete whose last choice is offline is never put back live.
 */
export interface LiveIntent {
  live: boolean;
  seq: number;
  decided: boolean;
  explicit: boolean;
}

let intent: LiveIntent = Object.freeze({ live: false, seq: 0, decided: false, explicit: false });
/** Persists the choice for the owner's athlete (a kill and relaunch honours it). */
let intentPersister: ((live: boolean) => void) | null = null;
/** Each choice's caller waits on its own result. */
const intentWaiters = new Map<number, (r: boolean | LiveSwitchIgnored) => void>();

export function getLiveIntent(): LiveIntent {
  return intent;
}

/** The intent, as a stable snapshot (re-renders only when it changes). */
export function useLiveIntent(): LiveIntent {
  return useSyncExternalStore(subscribe, getLiveIntent, getLiveIntent);
}

/** The owner registers how to persist the athlete's choice; returns the unregister. */
export function registerIntentPersister(persist: (live: boolean) => void): () => void {
  intentPersister = persist;
  return () => {
    if (intentPersister === persist) intentPersister = null;
  };
}

function settleWaiter(seq: number, r: boolean | LiveSwitchIgnored): void {
  const w = intentWaiters.get(seq);
  if (!w) return;
  intentWaiters.delete(seq);
  w(r);
}

function settleAllWaiters(r: boolean | LiveSwitchIgnored): void {
  const all = [...intentWaiters.values()];
  intentWaiters.clear();
  for (const w of all) w(r);
}

function waiterFor(seq: number): Promise<boolean | LiveSwitchIgnored> {
  return new Promise((resolve) => {
    intentWaiters.set(seq, resolve);
  });
}

function setIntent(live: boolean, explicit: boolean): LiveIntent {
  // Every older choice is over: never a result (or a toast) for it.
  settleAllWaiters("ignored");
  intent = Object.freeze({ live, seq: intent.seq + 1, decided: true, explicit });
  try {
    intentPersister?.(live);
  } catch {
    // Persisting is best effort.
  }
  emitArena();
  return intent;
}

/**
 * The app (not the athlete) decides the intent: a restore that could not be
 * met in front of the athlete, the server ending the session. Offline also
 * makes sure the server follows (a live write still in flight may land: the
 * clear is serialized behind it).
 */
export function setAppLiveIntent(live: boolean): void {
  setIntent(live, false);
  if (!live) ensureServerOffline();
}

/** The server follows an app-decided offline intent (never a manual go-offline). */
function ensureServerOffline(): void {
  const c = controller;
  if (!c) return;
  const k = c.committed?.();
  if (k && k.settled && !k.live) return;
  const run = c.ensureOffline ?? c.goOffline;
  void Promise.resolve()
    .then(() => run())
    .catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Pacing, restores, cancelling
// ---------------------------------------------------------------------------

/** When the athlete's last go-live attempt settled (ms epoch), or null. */
let athleteGoLiveSettledAt: number | null = null;

/** How long after a go-live attempt settles a live flip is still its doing. */
const ATHLETE_GO_LIVE_WINDOW_MS = 2000;

/**
 * Forget the athlete's last go-live, so whatever flips live next (a restore
 * on foreground, the next athlete's arrival) is never credited to it. Run on
 * background and on sign-out.
 */
function clearAthleteGoLive(): void {
  athleteGoLiveSettledAt = null;
}

try {
  AppState.addEventListener?.("change", (next) => {
    if (next === "background") clearAthleteGoLive();
  });
} catch {
  // No AppState (some test environments): nothing to clear on.
}

/** A go-live attempt for the athlete's choice is running (the driver). */
let switchInFlight = false;
let switchDirection: LiveSwitchDirection | null = null;
/** When the last server transition ended (the LIVE write waits the cooldown after it). */
let lastTransitionAt = 0;
let cooldownTimer: ReturnType<typeof setTimeout> | null = null;

function markTransition(): void {
  lastTransitionAt = Date.now();
  if (cooldownTimer) clearTimeout(cooldownTimer);
  cooldownTimer = setTimeout(() => {
    cooldownTimer = null;
    emitArena();
  }, LIVE_SWITCH_COOLDOWN_MS);
  emitArena();
}

function cooldownLeft(): number {
  return lastTransitionAt + LIVE_SWITCH_COOLDOWN_MS - Date.now();
}

/**
 * Automatic restores running their location ladder: a count owned by each run
 * (review round 2, SF1), so one run ending never clears another's.
 */
let restoreRuns = 0;
const restoreIdleWaiters = new Set<() => void>();

/** Mark a restore run as started; call the returned function once when it ends. */
export function beginRestoreRun(): () => void {
  restoreRuns += 1;
  emitArena();
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    restoreRuns = Math.max(0, restoreRuns - 1);
    if (restoreRuns === 0) {
      const waiting = [...restoreIdleWaiters];
      restoreIdleWaiters.clear();
      for (const w of waiting) w();
    }
    emitArena();
  };
}

function restoreInFlight(): boolean {
  return restoreRuns > 0;
}

function restoreIdle(): Promise<void> {
  if (!restoreInFlight()) return Promise.resolve();
  return new Promise((resolve) => restoreIdleWaiters.add(resolve));
}

/**
 * The go-live work in flight (a tapped attempt or a restore) registers how to
 * cancel itself; an offline choice, sign-out, the background or a match calls
 * it, and the work never sends a live write after that.
 */
let goLiveCanceller: (() => void) | null = null;

/** Register the cancel for the go-live now in flight; returns the unregister. */
export function registerGoLiveCanceller(cancel: () => void): () => void {
  goLiveCanceller = cancel;
  return () => {
    if (goLiveCanceller === cancel) goLiveCanceller = null;
  };
}

function cancelGoLiveWork(): void {
  const cancel = goLiveCanceller;
  goLiveCanceller = null;
  if (!cancel) return;
  try {
    cancel();
  } catch {
    // The work unwinds on its own.
  }
}

/**
 * Sign-out has started: no live write may go out until a new owner mounts
 * (review round 3). `useArenaLive` checks it before every live write.
 */
let liveWritesBlocked = false;

export function areLiveWritesBlocked(): boolean {
  return liveWritesBlocked;
}

/** Drop every go-live overlay (display, hint, kept display): sign-out, a new owner. */
export function resetLiveOverlayState(): void {
  cancelReveal();
  clearDisplayOnLive = false;
  if (clearDisplayTimer) clearTimeout(clearDisplayTimer);
  clearDisplayTimer = null;
  goLiveDisplay = null;
  needsLocation = false;
  emitArena();
}

// ---------------------------------------------------------------------------
// The driver: moves the server toward the athlete's intent, serialized
// ---------------------------------------------------------------------------

let driving = false;
/**
 * Bumped whenever the driver must stop being the one (a new owner, a reset):
 * a loop from an older generation exits at its next step and never touches
 * the new owner's intent or display.
 */
let driverGen = 0;

/** The server state the owner has committed: live, and whether anything is still moving. */
function committedLive(c: ArenaController): boolean | null {
  const k = c.committed?.();
  if (!k) return state.isLive;
  return k.settled ? k.live : null;
}

/**
 * One serialized loop. While the intent is live and not met: wait out a
 * restore or the cooldown, then run ONE go-live attempt (`controller.goLive`,
 * the location ladder) for it; re-read the intent after every await, so an
 * attempt that was overtaken never decides anything. An offline choice is not
 * driven here: it goes out at once (`chooseOffline`), serialized behind any
 * write in flight by `useArenaLive`.
 */
async function drive(): Promise<void> {
  if (driving) return;
  driving = true;
  const gen = driverGen;
  emitArena();
  try {
    for (;;) {
      if (gen !== driverGen) return;
      const c = controller;
      const target = intent;
      if (!c || !target.live || liveWritesBlocked) break;
      if (committedLive(c) === true) {
        settleWaiter(target.seq, true);
        if (goLiveDisplay === "going-live" || goLiveDisplay === "hold") setGoLiveDisplay(null);
        break;
      }
      // Never live unseen: the background / match handlers own resuming.
      // ("inactive" is a system sheet over the app, not the athlete leaving.)
      if (AppState.currentState === "background" || getInMatch()) {
        settleWaiter(target.seq, "ignored");
        break;
      }
      if (restoreInFlight()) {
        await restoreIdle();
        continue;
      }
      const wait = cooldownLeft();
      if (wait > 0) {
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      // One attempt for this choice. Nothing pending is drawn for the first
      // 240 ms (UX 019, 2.3), unless a pending ring is already up.
      switchInFlight = true;
      switchDirection = "going-live";
      goLiveMomentSpent = false;
      clearDisplayOnLive = false;
      if (goLiveDisplay !== "going-live") {
        cancelReveal();
        goLiveDisplay = "hold";
        scheduleGoLiveReveal("going-live", Date.now() + PENDING_REVEAL_MS);
      }
      emitArena();
      let r: boolean | LiveSwitchIgnored;
      try {
        r = await c.goLive();
      } catch {
        r = false;
      }
      // An older generation (the owner changed meanwhile): not ours to settle.
      if (gen !== driverGen) return;
      switchInFlight = false;
      switchDirection = null;
      athleteGoLiveSettledAt = Date.now();
      cancelReveal();
      markTransition();
      if (intent.seq !== target.seq) {
        // Overtaken: its caller already heard "ignored". An offline choice
        // draws offline by itself; a newer live choice loops on.
        if (!intent.live && getGoLiveDisplay() !== "retry") goLiveDisplay = null;
        emitArena();
        continue;
      }
      if (r === true) {
        if (!state.isLive) keepDisplayUntilLive();
        else goLiveDisplay = null;
        settleWaiter(target.seq, true);
        break;
      }
      // Not met (a failure, or a location sheet the athlete closed): the app
      // holds the athlete offline now, so nothing resumes it later.
      if (getGoLiveDisplay() !== "retry") goLiveDisplay = null;
      settleWaiter(target.seq, r);
      setIntent(false, false);
      ensureServerOffline();
      break;
    }
  } finally {
    if (gen === driverGen) {
      driving = false;
      emitArena();
    }
  }
}

/** The athlete chose live (the chip, the Arena, a CTA, RETRY). */
function chooseLive(): Promise<boolean | LiveSwitchIgnored> {
  const c = controller;
  if (!c || liveWritesBlocked) return Promise.resolve("ignored");
  // Already live and nothing moving: nothing to do.
  if (intent.live && intent.decided && !driving && committedLive(c) === true) return Promise.resolve("ignored");
  const busy = driving || restoreInFlight() || cooldownLeft() > 0;
  const next = setIntent(true, true);
  const result = waiterFor(next.seq);
  // Immediate feedback: the pending ring when the attempt must wait;
  // otherwise the driver starts right now (hold, then the ladder decides).
  if (busy) setGoLiveDisplay("going-live");
  void drive();
  return result;
}

/** The athlete chose offline: drawn at once, written at once (serialized). */
function chooseOffline(): Promise<boolean | LiveSwitchIgnored> {
  const c = controller;
  if (!c) return Promise.resolve("ignored");
  setIntent(false, true);
  // No live write after this choice: the go-live work in flight stops.
  cancelGoLiveWork();
  cancelReveal();
  clearDisplayOnLive = false;
  goLiveDisplay = null;
  emitArena();
  return c.goOffline().then(
    (r) => {
      markTransition();
      return r;
    },
    () => false,
  );
}

/**
 * The app abandons a tapped go-live that has not landed (the background, a
 * match: UX 019, 2.2): cancelled quietly, held offline, never resumed.
 */
export function abandonTappedGoLive(): void {
  if (!(switchInFlight && switchDirection === "going-live")) return;
  cancelGoLiveWork();
  setIntent(false, false);
  ensureServerOffline();
  cancelReveal();
  if (goLiveDisplay !== "retry") goLiveDisplay = null;
  emitArena();
}

function getLiveSwitchPhase(): LiveSwitchPhase {
  if (state.isSaving || state.liveTransition || switchInFlight || restoreInFlight()) return "saving";
  if (cooldownLeft() > 0) return "cooldown";
  return "ready";
}

/** The switch phase, as a primitive (re-renders only when it changes). For information only. */
export function useLiveSwitchPhase(): LiveSwitchPhase {
  return useSyncExternalStore(subscribe, getLiveSwitchPhase, getLiveSwitchPhase);
}

/** Kept for callers that read it; the switch never locks a choice now. */
export function useLiveSwitchLocked(): boolean {
  return !useHasArenaController();
}

function getLiveSwitchDirection(): LiveSwitchDirection | null {
  if (switchInFlight) return switchDirection;
  if (state.liveTransition) return state.liveTransition;
  if (restoreInFlight()) return "going-live";
  if (state.isSaving) return state.isLive ? "going-offline" : "going-live";
  return null;
}

/** The direction of the transition in flight, or null. */
export function useLiveSwitchDirection(): LiveSwitchDirection | null {
  return useSyncExternalStore(subscribe, getLiveSwitchDirection, getLiveSwitchDirection);
}

/** The athlete can choose offline (an owner is mounted). Always, otherwise. */
export function useCanGoOffline(): boolean {
  return useHasArenaController();
}

/** The athlete can choose live (an owner is mounted). Always, otherwise. */
export function useCanGoLive(): boolean {
  return useHasArenaController();
}

/** Kept for the chip's model input: an offline choice is always possible now. */
export function useGoLiveCancellable(): boolean {
  return useHasArenaController();
}

/** A tapped go-live attempt is running (not a restore). */
export function isTappedGoLiveInFlight(): boolean {
  return switchInFlight && switchDirection === "going-live";
}

/**
 * Whether a live flip happening NOW was caused by the athlete's own go-live
 * (an attempt in flight or settled in the last 2 s), as opposed to the app
 * restoring live on foreground, after a match, or on arrival. The Arena tab's
 * blade clash and its `goLive` haptic play only for the former.
 */
export function isAthleteGoLiveFlip(now: number = Date.now()): boolean {
  if (switchInFlight && switchDirection === "going-live") return true;
  return athleteGoLiveSettledAt !== null && now - athleteGoLiveSettledAt <= ATHLETE_GO_LIVE_WINDOW_MS;
}

/**
 * The athlete-facing live switch: every live surface goes through these.
 * Each records the athlete's choice at once and resolves with that choice's
 * own result: true once met, false when it failed (say so), "ignored" when a
 * newer choice replaced it or nothing could be attempted (stay silent).
 * `goOffline` is a MANUAL go-offline, which also drops a challenge tucked
 * into the chip without declining it (decision Q3).
 */
export const liveSwitch = Object.freeze({
  toggle: (): Promise<void | LiveSwitchIgnored> =>
    (getDisplayLive() ? chooseOffline() : chooseLive()).then((r) => (r === "ignored" ? "ignored" : undefined)),
  goLive: (): Promise<boolean | LiveSwitchIgnored> => chooseLive(),
  goOffline: (): Promise<boolean | LiveSwitchIgnored> => chooseOffline(),
});

/** What the rest of the app calls; `goLive` / `goOffline` are the switch above. */
export interface ArenaActions extends Omit<ArenaController, "goLive" | "goOffline" | "committed"> {
  goLive: () => Promise<boolean | LiveSwitchIgnored>;
  goOffline: () => Promise<boolean | LiveSwitchIgnored>;
}

/** Stable delegates; safe to hold across renders and across owner remounts. */
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
  // From here on no live write may go out (review round 3): the latch is
  // checked before every live write, the go-live work in flight is
  // cancelled, and the intent is offline (nothing resumes).
  liveWritesBlocked = true;
  cancelGoLiveWork();
  if (intent.decided && !intent.live) settleAllWaiters("ignored");
  else setIntent(false, false);
  // Left matches belong to this athlete; the next one to sign in starts clean.
  leftMatchIds.clear();
  clearAthleteGoLive();
  // No overlay (a stale OFFLINE · RETRY) survives into the next sign-in (QA 3).
  resetLiveOverlayState();
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

/** Test-only: the published snapshot, without a render. */
export function __peekArenaStateForTests(): ArenaState {
  return state;
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
  athleteGoLiveSettledAt = null;
  if (cooldownTimer) clearTimeout(cooldownTimer);
  cooldownTimer = null;
  lastTransitionAt = 0;
  driving = false;
  driverGen += 1;
  liveWritesBlocked = false;
  intentWaiters.clear();
  // Sequence numbers stay monotonic, so nothing from before the reset can
  // ever pass for a current choice.
  intent = Object.freeze({ live: false, seq: intent.seq + 1, decided: false, explicit: false });
  intentPersister = null;
  restoreIdleWaiters.clear();
  matchScreens = 0;
  matchExits = 0;
  matchListeners.clear();
  leftMatchIds.clear();
  reopenSurfaces = 0;
  reopenListeners.clear();
  incomingEndedListeners.clear();
  cancelReveal();
  goLiveDisplay = null;
  clearDisplayOnLive = false;
  needsLocation = false;
  goLiveMomentSpent = false;
  restoreRuns = 0;
  goLiveCanceller = null;
  liveMenusOpen = 0;
  menuListeners.clear();
}

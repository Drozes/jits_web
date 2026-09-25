/**
 * App-wide Arena state: "am I live?", how many others are in the lobby, and
 * the live challenge handshake.
 *
 * Being live PERSISTS across pages, so the live flag writer
 * (`hooks/use-arena-live.ts`), the `lobby:online` channel
 * (`hooks/use-lobby-presence.ts`) and the incoming-challenge listener
 * (`hooks/use-arena-challenge.ts`) are each mounted exactly once, by
 * `<ArenaBootstrap />` in `app/(app)/layout.tsx`. Everything else (the Arena
 * page, the nav items, the header LIVE signal) READS from here and never mounts
 * its own copy, which keeps a single presence track, a single flag writer and
 * a single challenge prompt. Web port of `apps/mobile/lib/arena/arena-store.ts`.
 *
 * Actions go through a registered controller rather than the snapshot, so the
 * functions consumers hold are stable for the life of the app and a call made
 * while no owner is mounted is a harmless no-op.
 */
import { useEffect, useSyncExternalStore } from "react";
import type {
  IncomingChallenge,
  OutgoingChallenge,
} from "@/hooks/use-arena-challenge";

export interface ArenaState {
  /** False until an owner has published; readers fall back to server props. */
  ready: boolean;
  isLive: boolean;
  isSaving: boolean;
  incoming: IncomingChallenge | null;
  outgoing: OutgoingChallenge | null;
  isBusy: boolean;
  /** Athletes in `lobby:online` other than the current athlete. */
  onlineCount: number;
}

export interface ArenaController {
  toggle: () => Promise<void>;
  goLive: () => Promise<void>;
  goOffline: () => Promise<void>;
  sendChallenge: (opponentId: string, opponentName: string) => Promise<void>;
  accept: () => Promise<void>;
  decline: () => Promise<void>;
  cancelOutgoing: () => Promise<void>;
}

export const IDLE_ARENA_STATE: ArenaState = Object.freeze({
  ready: false,
  isLive: false,
  isSaving: false,
  incoming: null,
  outgoing: null,
  isBusy: false,
  onlineCount: 0,
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

const getState = () => state;
const getIsLive = () => state.isLive;
const getOnlineCount = () => state.onlineCount;
// SSR and hydration always read idle, so server HTML never claims "live".
const getIdleState = () => IDLE_ARENA_STATE;
const getFalse = () => false;
const getZero = () => 0;

/**
 * Replace the snapshot. A shallow-equal update is dropped so a re-render of
 * the owner that changed nothing does not wake every nav item in the app.
 */
export function publishArenaState(next: ArenaState): void {
  const keys = Object.keys(next) as (keyof ArenaState)[];
  if (keys.every((k) => next[k] === state[k])) return;
  state = next;
  for (const l of listeners) l();
}

/** The full snapshot. For the Arena page. */
export function useArenaState(): ArenaState {
  return useSyncExternalStore(subscribe, getState, getIdleState);
}

/** Just the live bit, so nav and header re-render only on live changes. */
export function useIsArenaLive(): boolean {
  return useSyncExternalStore(subscribe, getIsLive, getFalse);
}

/** Other athletes currently in the Arena lobby (excludes the viewer). */
export function useArenaOnlineCount(): number {
  return useSyncExternalStore(subscribe, getOnlineCount, getZero);
}

// ---------------------------------------------------------------------------
// Inline challenge surface
// ---------------------------------------------------------------------------

// Kept outside ArenaState on purpose: the owner publishes whole snapshots, and
// this flag is written by the Arena page, not the owner.
let inlineSurfaces = 0;
const getInlineMounted = () => inlineSurfaces > 0;

function setInlineSurfaces(next: number) {
  inlineSurfaces = next;
  for (const l of listeners) l();
}

/**
 * Called by a page that renders the challenge plates inline (ArenaContent).
 * While any is mounted, the app-wide overlay stands down so the athlete never
 * sees the same challenge twice. Tied to mount, not to a pathname, so an Arena
 * that failed to load (no inline plate) still gets the overlay.
 */
export function useRegisterInlineChallengeSurface(): void {
  useEffect(() => {
    setInlineSurfaces(inlineSurfaces + 1);
    return () => setInlineSurfaces(inlineSurfaces - 1);
  }, []);
}

/** True while a page renders the challenge plates inline. */
export function useInlineChallengeSurfaceMounted(): boolean {
  return useSyncExternalStore(subscribe, getInlineMounted, getFalse);
}

/**
 * Lobby members other than the viewer that resolved to a real ACTIVE athlete.
 * `lobby:online` can hold keys from stale or foreign clients that are not
 * athletes at all, so presence alone over-counts.
 */
export function countActiveOthers(
  presenceIds: Set<string>,
  selfId: string,
  activeIds: ReadonlySet<string>,
): number {
  let n = 0;
  for (const id of presenceIds) if (id !== selfId && activeIds.has(id)) n++;
  return n;
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

const noop = () => Promise.resolve();

/** Stable delegates; safe to hold across renders and owner remounts. */
export const arenaActions: ArenaController = Object.freeze({
  toggle: () => controller?.toggle() ?? noop(),
  goLive: () => controller?.goLive() ?? noop(),
  goOffline: () => controller?.goOffline() ?? noop(),
  sendChallenge: (opponentId: string, opponentName: string) =>
    controller?.sendChallenge(opponentId, opponentName) ?? noop(),
  accept: () => controller?.accept() ?? noop(),
  decline: () => controller?.decline() ?? noop(),
  cancelOutgoing: () => controller?.cancelOutgoing() ?? noop(),
});

/** Test-only: drop all module state between suites. */
export function __resetArenaStoreForTests(): void {
  state = IDLE_ARENA_STATE;
  controller = null;
  inlineSurfaces = 0;
  listeners.clear();
}

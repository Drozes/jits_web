import * as React from "react";

/**
 * The single, app-wide bell (jits-dq85.7, supersedes jits-qx1z).
 *
 * The bell button renders in every tab-root header, and those headers stay
 * mounted together, so each one used to run its own pending-challenges
 * realtime channel and its own notification feed. Now `BellBootstrap`
 * (mounted once in `app/(app)/_layout.tsx`) owns the only channel, the only
 * feed and the only panel, and publishes here; every header button is a thin
 * view over this store.
 *
 * - `badgeCount`: fresh incoming challenges plus unseen highlight reels.
 * - `freshIncoming`: the fresh incoming challenges alone (the same
 *   10-minute rule, independent of live state). The Arena tab badge reads it
 *   so its red count agrees with the bell (AC-T1).
 * - `loaded`: the host's first full read of the pending list has landed, so
 *   `freshIncoming` is known rather than the empty starting value. The Arena
 *   tab's blade clash seeds from the first loaded count, so old challenges
 *   appearing on a slow cold start never read as one arriving.
 * - `open`: whether the one panel is showing. Any header button opens it.
 * - `focusCount`: bumped when a header with a bell gains focus, so the host
 *   re-reads the highlight half (a reel watched elsewhere stops counting).
 */

interface BellSnapshot {
  badgeCount: number;
  freshIncoming: number;
  loaded: boolean;
  open: boolean;
  focusCount: number;
}

const INITIAL: BellSnapshot = {
  badgeCount: 0,
  freshIncoming: 0,
  loaded: false,
  open: false,
  focusCount: 0,
};
let snapshot: BellSnapshot = INITIAL;
let onOpen: (() => void) | null = null;
const listeners = new Set<() => void>();

function set(patch: Partial<BellSnapshot>): void {
  const next = { ...snapshot, ...patch };
  if (
    next.badgeCount === snapshot.badgeCount &&
    next.freshIncoming === snapshot.freshIncoming &&
    next.loaded === snapshot.loaded &&
    next.open === snapshot.open &&
    next.focusCount === snapshot.focusCount
  ) {
    return;
  }
  snapshot = next;
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function useSelector<T>(select: (s: BellSnapshot) => T): T {
  return React.useSyncExternalStore(
    subscribe,
    () => select(snapshot),
    () => select(snapshot),
  );
}

function toCount(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/**
 * Host only: the badge it derived from the pending list and the feed, and
 * (optional, default unchanged) how many of those are fresh incoming
 * challenges, and (optional, default unchanged) whether the pending list has
 * had its first full read.
 */
export function publishBellBadge(count: number, freshIncoming?: number, loaded?: boolean): void {
  set({
    badgeCount: toCount(count),
    ...(freshIncoming === undefined ? {} : { freshIncoming: toCount(freshIncoming) }),
    ...(loaded === undefined ? {} : { loaded }),
  });
}

/**
 * Host only: what to run when a header opens the panel (a forced full
 * re-read). Returns the unregister function.
 */
export function registerBellHost(handler: () => void): () => void {
  onOpen = handler;
  return () => {
    // Only the current host clears state: a stale host unmounting after a
    // newer one registered must not wipe the newer host's badge or panel.
    if (onOpen !== handler) return;
    onOpen = null;
    // freshIncoming too: the Arena tab badge reads it, and the tab bar can
    // outlive the host (sign-out, an athlete switch before the next host
    // publishes), so it must not keep the last athlete's red count.
    set({ badgeCount: 0, freshIncoming: 0, loaded: false, open: false });
  };
}

/**
 * A header's bell was tapped: show the one panel and re-read the feed. A
 * no-op while no host is registered, so a tap can never leave `open` stuck
 * at true for a host that mounts later to pop open unprompted.
 */
export function openBell(): void {
  if (!onOpen) return;
  const handler = onOpen;
  set({ open: true });
  handler();
}

/** The panel closed (row tap, backdrop, pan down). */
export function closeBell(): void {
  set({ open: false });
}

/** A header with a bell gained focus. */
export function notifyBellFocused(): void {
  set({ focusCount: snapshot.focusCount + 1 });
}

export function useBellBadgeCount(): number {
  return useSelector((s) => s.badgeCount);
}

/** Fresh incoming challenges (no highlights), whatever the live state. */
export function useFreshIncomingCount(): number {
  return useSelector((s) => s.freshIncoming);
}

/** The pending list has had its first full read (see `loaded`). */
export function useBellLoaded(): boolean {
  return useSelector((s) => s.loaded);
}

export function useBellOpen(): boolean {
  return useSelector((s) => s.open);
}

export function useBellFocusCount(): number {
  return useSelector((s) => s.focusCount);
}

/** Tests only: the fresh incoming count, read outside React. */
export function getFreshIncomingCountForTests(): number {
  return snapshot.freshIncoming;
}

/** Tests only. */
export function resetBellStore(): void {
  snapshot = INITIAL;
  onOpen = null;
  for (const l of listeners) l();
}

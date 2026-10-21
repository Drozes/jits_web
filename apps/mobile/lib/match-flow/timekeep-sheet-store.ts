/**
 * Which timekeep sheets (`/match/<id>/timekeep`, timekeeper mode spec 4.2
 * Seat) are open, by match, and which requests have had their sheet shown.
 * A plain store with no reads and no navigation, so the notification
 * handlers and the Arena owner can read it without loading the data layer:
 *  - the Arena owner holds the incoming-challenge prompt while any sheet is
 *    open (spec 9.1);
 *  - the request listener opens a request's sheet at most once, and never
 *    over another sheet;
 *  - the notification handlers neither show a banner nor stack a second
 *    sheet for a TK-N1 push whose sheet is already up;
 *  - while the Arena owner's non-dismissable modal is up (the challenge
 *    prompt, a blocked start's sheet), a TK-N1 tap waits and opens the sheet
 *    once it closes (`useTimekeepTapHold`, spec 9.1).
 *
 * This store, not the arena store's match-screen suppression that spec 9.1
 * names, is the precedence mechanism: the sheet gates the challenge prompt
 * the way a match screen does, but it does NOT mount `useArenaMatchScreen`.
 * A mounted match screen takes the asked person offline, counts a match exit
 * on unmount, and makes the challenge hook decline a challenge that arrives
 * meanwhile as busy (`settleBusyInsert`) instead of holding its prompt.
 */
import * as React from "react";

/** Open sheets per match: a count, so a sheet replacing a sheet never reads zero in between. */
const openByMatch = new Map<string, number>();
let openTotal = 0;
const listeners = new Set<() => void>();
/** Requests whose sheet has been shown (by a push tap or by the listener). */
const shownRequests = new Set<string>();
/** The Arena owner's non-dismissable modal is up: a TK-N1 tap waits. */
let tapHeld = false;
const tapHoldListeners = new Set<() => void>();

function notify(): void {
  for (const l of [...listeners]) l();
}

/** Subscribe to sheets opening and closing. */
export function subscribeTimekeepSheets(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Non-hook read: is any timekeep sheet open? */
export function isTimekeepSheetOpen(): boolean {
  return openTotal > 0;
}

/** Non-hook read: is the timekeep sheet of this match open? */
export function isTimekeepSheetOpenFor(matchId: string): boolean {
  return (openByMatch.get(matchId) ?? 0) > 0;
}

/** True while any timekeep sheet is open. */
export function useIsTimekeepSheetOpen(): boolean {
  return React.useSyncExternalStore(subscribeTimekeepSheets, isTimekeepSheetOpen, isTimekeepSheetOpen);
}

/** A request's sheet has been shown: it never opens again by itself. */
export function markTimekeepRequestShown(requestId: string): void {
  shownRequests.add(requestId);
}

export function wasTimekeepRequestShown(requestId: string): boolean {
  return shownRequests.has(requestId);
}

/**
 * The timekeep sheet marks itself open for its lifetime, and its request
 * shown once it knows it (a push carries only the match).
 */
export function useTimekeepSheetScreen(matchId: string, requestId: string | null): void {
  React.useEffect(() => {
    openByMatch.set(matchId, (openByMatch.get(matchId) ?? 0) + 1);
    openTotal += 1;
    notify();
    return () => {
      const n = (openByMatch.get(matchId) ?? 1) - 1;
      if (n > 0) openByMatch.set(matchId, n);
      else openByMatch.delete(matchId);
      openTotal = Math.max(0, openTotal - 1);
      notify();
    };
  }, [matchId]);
  React.useEffect(() => {
    if (requestId) shownRequests.add(requestId);
  }, [requestId]);
}

function setTapHeld(held: boolean): void {
  if (tapHeld === held) return;
  tapHeld = held;
  for (const l of [...tapHoldListeners]) l();
}

/** Non-hook read: does a TK-N1 tap wait for the Arena owner's modal to close? */
export function isTimekeepTapHeld(): boolean {
  return tapHeld;
}

/** Subscribe to the tap hold changing. */
export function subscribeTimekeepTapHold(cb: () => void): () => void {
  tapHoldListeners.add(cb);
  return () => {
    tapHoldListeners.delete(cb);
  };
}

/**
 * The Arena owner reports whether its non-dismissable modal (the challenge
 * prompt, a blocked start's sheet) is up. While it is, a TK-N1 tap is held
 * by the notification handlers and opens the sheet once it closes (spec
 * 9.1: "the sheet opens after the prompt closes"). Released on unmount.
 */
export function useTimekeepTapHold(held: boolean): void {
  React.useEffect(() => {
    setTapHeld(held);
  }, [held]);
  React.useEffect(() => () => setTapHeld(false), []);
}

/** Test-only: forget every open sheet, shown request, tap hold and listener. */
export function __resetTimekeepSheetStoreForTests(): void {
  openByMatch.clear();
  openTotal = 0;
  listeners.clear();
  shownRequests.clear();
  tapHeld = false;
  tapHoldListeners.clear();
}

/**
 * The one way out of `match/[matchId]` (jits-tlk3).
 *
 * The match screen is pushed over `(tabs)` in the `(app)` Stack. Leaving it
 * with `router.replace(href)` swapped the match route for a SECOND `(tabs)`
 * route, so every match stacked another tab navigator beneath the new one:
 * the old tab screens stayed mounted (duplicate subscriptions and fetches),
 * and a back swipe landed in the stale tabs.
 *
 * `dismissTo` dispatches POP_TO on the `(app)` Stack instead (expo-router
 * 6.0.23 build/global-state/routing.js, @react-navigation/routers StackRouter
 * POP_TO): it pops back to the existing `(tabs)` route, which switches to the
 * target tab and hands it the href's params, and it replaces the current
 * route only when no `(tabs)` route is below it. Either way the match route is removed, so it
 * unmounts and `useArenaMatchScreen` restores live.
 */
import type { Href, Router } from "expo-router";

export interface ExitMatchOptions {
  /**
   * Let this exit through the match screen's remove guard (live, end,
   * result and confirm: `useMatchExitGuard`). Only a timekeeper-mode no
   * contest passes it (`use-wizard-sync.ts`): the clock can stop for good
   * mid-match there (the timekeeper left or went offline, a pause timed
   * out), and without it the guard swallowed the exit, so the athlete kept
   * a dead live screen (match-loop T6, T7, T16). Two-athlete exits never
   * pass it and stay exactly as they were.
   */
  pastGuard?: boolean;
}

/** Set by an `exitMatchTo` with `pastGuard` until the guard lets it through (`takeGuardedExit`). */
let guardedExitRequested = false;

export function exitMatchTo(router: Pick<Router, "dismissTo">, href: Href, options?: ExitMatchOptions): void {
  if (options?.pastGuard) guardedExitRequested = true;
  router.dismissTo(href);
}

/**
 * True once per `exitMatchTo` with `pastGuard`, then false until the next.
 * The guard asks at the moment it holds a removal back; expo-router
 * dispatches `dismissTo` from a queue after a render, so the request is kept
 * until then rather than for the length of the call.
 */
export function takeGuardedExit(): boolean {
  const requested = guardedExitRequested;
  guardedExitRequested = false;
  return requested;
}


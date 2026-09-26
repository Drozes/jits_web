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
 * target tab and hands it the href's params (`?rematch=<id>` reaches the
 * already-mounted Arena index), and it replaces the current route only when
 * no `(tabs)` route is below it. Either way the match route is removed, so it
 * unmounts and `useArenaMatchScreen` restores live.
 */
import type { Href, Router } from "expo-router";

export function exitMatchTo(router: Pick<Router, "dismissTo">, href: Href): void {
  router.dismissTo(href);
}

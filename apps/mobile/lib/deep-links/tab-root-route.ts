/**
 * Opening a tab root (`/`, `/arena`, `/matches`, `/leaderboard`, `/profile`) from outside
 * the tab bar without mounting a second copy of it.
 *
 * `router.push('/arena?challenge=<id>')` (the challenge push deep link, AC-A8)
 * mounts a second Arena in expo-router 6.0.23: `getNavigateAction`
 * (build/global-state/routing.js) ignores search params when it looks for the
 * navigator where the current and target routes diverge, so
 *  - on the Arena tab it PUSHes a second `arena/index` onto the Arena Stack;
 *  - on a pushed `(app)` screen (athlete/[id], settings, ...) it PUSHes a
 *    whole second `(tabs)` route, with its own tab bar and Arena.
 *
 * Instead:
 *  - while the `(app)` Stack's top route is `(tabs)`, `router.navigate`: the
 *    tab navigator switches tabs, and on the Arena itself the Stack's
 *    NAVIGATE reuses the current `index` route and hands it the new params;
 *  - on a pushed `(app)` screen, `router.dismissTo`: POP_TO on the `(app)`
 *    Stack pops back to the existing `(tabs)` route and passes the params
 *    down (the same path `exitMatchTo` uses, jits-tlk3). `dismissTo` is never
 *    used from the tabs themselves: the tab router does not handle POP_TO.
 *
 * Which of the two applies is tracked by `useTrackAppStackTop`, mounted once
 * in `app/(app)/_layout.tsx`.
 */
import { useEffect } from "react";
import { useSegments, type Router } from "expo-router";

/** The first path segment of every tab root ("" is Home). */
const TAB_ROOT_PATHS = new Set(["", "arena", "matches", "leaderboard", "profile"]);

/** True for an href that opens a tab root (query and hash ignored). */
export function isTabRootHref(href: string): boolean {
  if (!href.startsWith("/")) return false;
  const path = href.split(/[?#]/)[0].replace(/\/+$/, "").slice(1);
  return TAB_ROOT_PATHS.has(path);
}

/** Whether the `(app)` Stack's top route is `(tabs)` (no detail screen pushed). */
let appStackOnTabs = true;

export function isAppStackOnTabs(): boolean {
  return appStackOnTabs;
}

/** Test-only. */
export function __setAppStackOnTabsForTests(value: boolean): void {
  appStackOnTabs = value;
}

/**
 * Keeps `isAppStackOnTabs` current. Mounted in the `(app)` layout, whose
 * segments are `["(app)", "(tabs)", ...]` on any tab screen and
 * `["(app)", "athlete", "[id]"]` (and so on) on a pushed detail screen.
 */
export function useTrackAppStackTop(): void {
  const segments = useSegments() as string[];
  const onTabs = segments[0] !== "(app)" || segments.length < 2 || segments[1] === "(tabs)";
  useEffect(() => {
    appStackOnTabs = onTabs;
  }, [onTabs]);
}

/** Null-rendering wrapper so a layout can mount the tracker as a sibling. */
export function AppStackTopTracker(): null {
  useTrackAppStackTop();
  return null;
}

/**
 * Route a runtime href from outside the screen tree (a notification tap):
 * tab roots are opened in place, every other href is pushed as before.
 */
export function openHref(
  router: Pick<Router, "push" | "navigate" | "dismissTo">,
  href: string,
  onTabs: boolean = isAppStackOnTabs(),
): void {
  // Cast: expo-router's typed routes don't know about runtime strings.
  if (!isTabRootHref(href)) {
    router.push(href as never);
  } else if (onTabs) {
    router.navigate(href as never);
  } else {
    router.dismissTo(href as never);
  }
}

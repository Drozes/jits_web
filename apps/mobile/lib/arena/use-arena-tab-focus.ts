/**
 * "Is the Arena tab the selected tab?", which is NOT the same question as
 * "is the Arena screen focused?".
 *
 * `athlete/[id]` and `match/[matchId]` are registered in `(app)/_layout.tsx`,
 * so they push OVER the tab navigator. React Navigation computes focus
 * through the whole tree, which means the Arena screen blurs the moment
 * either of them is pushed, even though the Arena tab is still the selected
 * tab and the athlete has not left the Arena at all. Keying "you have left"
 * on screen focus therefore drops people out of the lobby for reading a
 * profile or playing the match they just accepted.
 *
 * The tab navigator's own index survives a push, so that is what gets read.
 */
import { useRootNavigationState } from "expo-router";

export interface NavigatorState {
  type?: string;
  index?: number;
  routes?: { name: string; state?: NavigatorState }[];
}

/**
 * The name of the route the tab navigator currently has selected, or null
 * when the tree holds no tab navigator (which is every state before the app
 * has finished mounting its navigators).
 */
export function selectedTabName(
  state: NavigatorState | null | undefined,
): string | null {
  if (!state) return null;

  if (state.type === "tab" && state.routes && state.routes.length > 0) {
    const index = state.index ?? 0;
    return state.routes[index]?.name ?? null;
  }

  for (const route of state.routes ?? []) {
    const found = selectedTabName(route.state);
    if (found) return found;
  }
  return null;
}

/**
 * Whether `tabName` is the selected tab.
 *
 * Fails OPEN. An unrecognised or not-yet-built navigation tree reads as "yes,
 * still on this tab", because the cost of a false negative is dropping a live
 * athlete out of the lobby with no way to notice, while the cost of a false
 * positive is staying live a little longer than intended, which backgrounding
 * and the next Arena visit both correct.
 */
export function useIsTabSelected(tabName: string): boolean {
  const state = useRootNavigationState();
  const selected = selectedTabName(state as NavigatorState | undefined);
  return selected === null || selected === tabName;
}

import * as React from "react";
import { useNavigation, usePreventRemove } from "@react-navigation/native";
import { takeGuardedExit } from "./exit-to";

/**
 * The match screen's remove guard: while `guarded` (a match in flight: live,
 * end, result, confirm), no back gesture, Android back or other removal
 * leaves the match screen, because leaving there would orphan the match
 * `in_progress` with no resume path. The one removal it lets through is the
 * wizard's own exit that asked for it (`exitMatchTo` with `pastGuard`, the
 * `POP_TO` its `dismissTo` dispatches), which it re-dispatches, as React
 * Navigation's `usePreventRemove` expects (the re-dispatched action skips
 * this screen's guard).
 *
 * A request left over from an exit the guard never had to hold (the screen
 * was not guarded then) is dropped when a match screen mounts and unmounts,
 * so it can never open a later match screen's guard.
 */
export function useMatchExitGuard(guarded: boolean): void {
  const navigation = useNavigation();
  React.useEffect(() => {
    takeGuardedExit();
    return () => {
      takeGuardedExit();
    };
  }, []);
  usePreventRemove(guarded, ({ data }) => {
    if (data.action.type === "POP_TO" && takeGuardedExit()) navigation.dispatch(data.action);
  });
}

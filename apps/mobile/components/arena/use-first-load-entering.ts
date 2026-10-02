/**
 * List enter stagger (Adding Flare [10.4]; Motion Rule, Moment), LOCAL copy
 * for the Arena. Slice E1 ships the shared `useFirstLoadEntering()` in
 * `lib/motion/use-first-load-entering.ts` with this exact name and
 * signature; this file is swapped for it at merge.
 *
 * `useFirstLoadEntering()` returns `(index) => entering | undefined`: on the
 * FIRST load of a list, rows 0 to 7 rise 8 px and fade in, 60 ms apart.
 * After that load (so on refetch, pull-to-refresh, pagination, a row that
 * joins later, or list recycling), under Reduce Motion, and for index >= 8 it
 * returns undefined (no entering animation).
 *
 * "First load" is the first commit in which the list asked for a row: a
 * mount with no rows yet (still loading, empty mat) does not spend it.
 */
import * as React from "react";
import {
  withDelay,
  withTiming,
  type EntryExitAnimationFunction,
} from "react-native-reanimated";
import { duration, easing, useReduceMotion } from "@/lib/motion";

/** Rows staggered on a first load; the rest appear at once. */
export const FIRST_LOAD_STAGGER_ROWS = 8;
/** Gap between two rows' starts. */
export const FIRST_LOAD_STAGGER_MS = 60;
/** How far a row rises. */
export const FIRST_LOAD_RISE_PX = 8;

function riseIn(delay: number): EntryExitAnimationFunction {
  return () => {
    "worklet";
    const config = { duration: duration.slow, easing: easing.brandOut };
    return {
      initialValues: { opacity: 0, transform: [{ translateY: FIRST_LOAD_RISE_PX }] },
      animations: {
        opacity: withDelay(delay, withTiming(1, config)),
        transform: [{ translateY: withDelay(delay, withTiming(0, config)) }],
      },
    };
  };
}

export function useFirstLoadEntering(): (index: number) => EntryExitAnimationFunction | undefined {
  const reduceMotion = useReduceMotion();
  const spent = React.useRef(false);
  const asked = React.useRef(false);

  // After the commit that drew rows, the first load is over.
  React.useEffect(() => {
    if (asked.current) spent.current = true;
  });

  return React.useCallback(
    (index: number) => {
      if (spent.current) return undefined;
      asked.current = true;
      if (reduceMotion || index < 0 || index >= FIRST_LOAD_STAGGER_ROWS) return undefined;
      return riseIn(index * FIRST_LOAD_STAGGER_MS);
    },
    [reduceMotion],
  );
}

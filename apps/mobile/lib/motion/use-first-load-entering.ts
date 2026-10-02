import * as React from "react";
import type Animated from "react-native-reanimated";
import { Keyframe } from "react-native-reanimated";
import { useReduceMotion } from "./use-reduce-motion";
import { duration, easing } from "./tokens";

/** The `entering` prop of an `Animated.View`. */
export type EnteringAnimation = React.ComponentProps<typeof Animated.View>["entering"];

/** Rows rise this far (px) as they fade in. */
export const FIRST_LOAD_RISE_PX = 8;
/** Delay between consecutive rows, ms. */
export const FIRST_LOAD_STAGGER_MS = 60;
/** Only the first rows stagger; later rows appear at once. */
export const FIRST_LOAD_MAX_ROWS = 8;

const riseCache = new Map<number, EnteringAnimation>();

/** The rise for row `index`, built once per index and reused. */
function riseFor(index: number): EnteringAnimation {
  let anim = riseCache.get(index);
  if (!anim) {
    anim = new Keyframe({
      0: { opacity: 0, transform: [{ translateY: FIRST_LOAD_RISE_PX }] },
      100: { opacity: 1, transform: [{ translateY: 0 }], easing: easing.brandOut },
    })
      .duration(duration.slow)
      .delay(index * FIRST_LOAD_STAGGER_MS) as unknown as EnteringAnimation;
    riseCache.set(index, anim);
  }
  return anim;
}

/**
 * List enter stagger (Motion Rule registry, Moment tier): on the FIRST load
 * of a list, rows rise 8px and fade in, 60ms apart, capped at the first 8.
 *
 * Returns `(index) => entering | undefined` for an `Animated.View` row. It is
 * armed until the first render in which any row asks for its animation; after
 * that render commits it returns `undefined` for good, so a refetch,
 * pull-to-refresh, pagination, a filter change or a virtualized row mounting
 * later never replays the rise. Call the hook in a component that outlives
 * the list's loading state (the screen), and pass the function down: the
 * stagger then plays when the rows first appear, not when the screen mounts.
 *
 * Also `undefined` under Reduce Motion and for `index >= 8`.
 */
export function useFirstLoadEntering(): (index: number) => EnteringAnimation | undefined {
  const reduceMotion = useReduceMotion();
  const consumed = React.useRef(false);
  const requested = React.useRef(false);
  const reduceRef = React.useRef(reduceMotion);
  reduceRef.current = reduceMotion;

  // Runs after every commit: once a render asked for a row animation, the
  // first load is over.
  React.useEffect(() => {
    if (requested.current) consumed.current = true;
  });

  return React.useCallback((index: number) => {
    if (consumed.current) return undefined;
    requested.current = true;
    if (reduceRef.current) return undefined;
    if (index < 0 || index >= FIRST_LOAD_MAX_ROWS) return undefined;
    return riseFor(index);
  }, []);
}

import {
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { duration, easing, moment } from "@/lib/motion";

/**
 * The reel tiles' three motions (DESIGN.md Motion registry: "Reel ring
 * pulse", "Reel reveal", "Reel building shimmer"). Callers check Reduce
 * Motion first; under it none of these run (the ring alone marks a new reel).
 * Kept in one module so tests can observe them without driving Reanimated.
 */

/** Peak scale of the ring pulse (spec 7.2: 1.0 to 1.04 and back). */
export const RING_PULSE_SCALE = 1.04;

/** One ring pulse: up and back over `moment.reelRingPulse` (600ms) in total. */
export function runRingPulse(scale: SharedValue<number>): void {
  const half = moment.reelRingPulse / 2;
  scale.value = withSequence(
    withTiming(RING_PULSE_SCALE, { duration: half, easing: easing.brandOut }),
    withTiming(1, { duration: half, easing: easing.brandOut }),
  );
}

/** The building-to-ready cross-fade: the ready tile fades in over `duration.fast`. */
export function runReveal(opacity: SharedValue<number>): void {
  opacity.value = 0;
  opacity.value = withTiming(1, { duration: duration.fast, easing: easing.brandOut });
}

/** The building tile's shimmer sweep: 0 to 1, linear, repeating on the skeleton cadence. */
export function runShimmer(progress: SharedValue<number>): void {
  progress.value = 0;
  progress.value = withRepeat(withTiming(1, { duration: duration.shimmer, easing: easing.linear }), -1, false);
}

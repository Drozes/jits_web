/**
 * `@/lib/motion`: the mobile Motion Rule toolkit (DESIGN.md, "Motion").
 * Import motion primitives from here, not from their files.
 *
 * Tokens
 * - `duration`: `{ instant 100, fast 240, base 480 (rating tick),
 *   slow 720, pulse 1400 (fixed LIVE pulse cycle), ember 2400 (ember cycle),
 *   shimmer 1400 (skeleton sweep) }`, ms.
 * - `tempo`: `{ quiet 3000, normal 1600, busy 800 }`, ms, the LIVE pulse
 *   cycle by how many athletes are live in the lobby (one shared clock).
 * - `easing`: `{ brandOut, outCubic }`, Reanimated easings for `withTiming`.
 * - `BRAND_EASE_OUT_CURVE`: `[0.22, 1, 0.36, 1]`, the brand curve as a tuple.
 * - `spring`: `{ press: { damping 18, stiffness 300 }, select: { damping 14,
 *   stiffness 260 } }`, configs for `withSpring`.
 * - `PRESS_SCALE`: `0.97`, the held scale of a pressable.
 *
 * Haptics (one vocabulary; never for ambient motion, never on a loss)
 * - `haptics.press()`, `.accept()`, `.select()`, `.goLive()`,
 *   `.challengeArrived()` (already fired by the challenge prompt sheet; do
 *   not fire it again), `.ratingGain()`, `.countdownTick()`,
 *   `.countdownGo()`, `.tapTick()` (winner only), plus the match-flow events
 *   `.matchStart()`, `.matchEnd()`, `.resultRecorded()`, `.error()`,
 *   `.timeWarning()`. Each returns a promise that never rejects.
 * - `HapticEvent`: the union of event names.
 *
 * Hooks
 * - `useReduceMotion(): boolean`: the OS Reduce Motion setting, correct on
 *   the first frame. Every animation needs a still end state for `true`.
 * - `useAppActive(): boolean`: the app is in the foreground. Ambient loops
 *   run only while their state is true AND this is true.
 *
 * Tests only: `__setReduceMotionForTests(next)`, `__resetAppActiveForTests()`.
 */
export {
  duration,
  easing,
  spring,
  tempo,
  BRAND_EASE_OUT_CURVE,
  PRESS_SCALE,
  type DurationToken,
  type TempoToken,
} from "./tokens";
export { haptics, type HapticEvent } from "./haptics";
export { useAppActive, __resetAppActiveForTests } from "./use-app-active";
export { useReduceMotion, __setReduceMotionForTests } from "@/lib/match-flow/use-reduce-motion";

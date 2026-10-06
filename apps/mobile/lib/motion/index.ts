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
 * - `moment`: named durations of single Moments, ms: `goFade` 700,
 *   `confettiFall` 1800, `confettiFadeDelay` 1200, `confettiFade` 600,
 *   `slamIn` 520, `slamInFade` 300, `riseInDelay` 500, `riseIn` 400,
 *   `tapMarkFill` 80, `tapNudge` 50, `angleDip` 80, `reelRingPulse` 600,
 *   `milestoneBurstFall` 900, `milestoneBurstStagger` 180,
 *   `milestoneBurstFadeDelay` 600, `milestoneBurstFade` 300.
 * - `easing`: `{ brandOut, outCubic, inQuad, linear }`, Reanimated easings
 *   for `withTiming`.
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
 *   `.timeWarning()`, `.reelRevealed()`, `.milestone()` (never on a loss). Each returns a promise that never rejects.
 * - `HapticEvent`: the union of event names.
 *
 * Hooks
 * - `useReduceMotion(): boolean`: the OS Reduce Motion setting, correct on
 *   the first frame. Every animation needs a still end state for `true`.
 * - `useAppActive(): boolean`: the app is in the foreground. Ambient loops
 *   run only while their state is true AND this is true.
 * - `useFirstLoadEntering(): (index) => entering | undefined`: the list
 *   enter stagger (rows rise 8px and fade, 60ms apart, first 8 rows) for the
 *   FIRST load only; `undefined` afterwards, under Reduce Motion, and for
 *   index >= 8. Call it in the screen and pass the function to the rows.
 * - `useModalAnimation("slide" | "fade")`: the RN `Modal` `animationType`
 *   ("Sheet / modal present"), `"none"` under Reduce Motion.
 * - `useSheetAnimationConfigs()`: gorhom `animationConfigs` for the same
 *   row (`fast` brand ease-out; lands at once under Reduce Motion).
 *
 * Tests only: `__setReduceMotionForTests(next)`, `__resetAppActiveForTests()`.
 */
export {
  duration,
  easing,
  spring,
  tempo,
  moment,
  BRAND_EASE_OUT_CURVE,
  PRESS_SCALE,
  type DurationToken,
  type MomentToken,
  type TempoToken,
} from "./tokens";
export { haptics, type HapticEvent } from "./haptics";
export { useAppActive, __resetAppActiveForTests } from "./use-app-active";
export { useReduceMotion, __setReduceMotionForTests } from "./use-reduce-motion";
export {
  useFirstLoadEntering,
  FIRST_LOAD_MAX_ROWS,
  FIRST_LOAD_RISE_PX,
  FIRST_LOAD_STAGGER_MS,
  type EnteringAnimation,
} from "./use-first-load-entering";
export {
  useModalAnimation,
  modalAnimationFor,
  useSheetAnimationConfigs,
  sheetAnimationConfigsFor,
  type ModalPresentation,
} from "./use-modal-animation";

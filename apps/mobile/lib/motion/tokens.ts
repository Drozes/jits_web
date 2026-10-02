import { Easing } from "react-native-reanimated";

/**
 * Motion tokens for the Motion Rule (DESIGN.md, "Motion"). Every animated
 * duration, curve and spring in the mobile app comes from here, so the app
 * keeps one rhythm. The first four durations mirror the web
 * `--duration-*` tokens in apps/web/app/design-system/tokens.css.
 */
export const duration = {
  /** Reactive feedback: press-in, hover, focus. */
  instant: 100,
  /** Short moments: chip pop, blade clash, small state flips. */
  fast: 240,
  /** The brand rating tick. */
  base: 480,
  /** Longer moments: list enter, settle. */
  slow: 720,
  /** One full LIVE pulse cycle (the app's one pulse rhythm). */
  pulse: 1400,
  /** One full Arena ember cycle (Ambient tier, Arena heat only). */
  ember: 2400,
  /** One full skeleton shimmer sweep (one shared module-level clock). */
  shimmer: 1400,
} as const;

export type DurationToken = keyof typeof duration;

/**
 * LIVE pulse tempo: the full cycle of every live dot, chosen by how many
 * athletes are live in the lobby. One shared clock drives every live dot, so
 * they never beat out of step. `duration.pulse` stays the fixed cycle for
 * surfaces that do not follow the lobby.
 */
export const tempo = {
  /** Few athletes live. */
  quiet: 3000,
  /** A normal lobby. */
  normal: 1600,
  /** A busy lobby. */
  busy: 800,
} as const;

export type TempoToken = keyof typeof tempo;

/**
 * The brand ease-out as cubic-bezier control points (no bounce). Exposed as a
 * tuple for code that builds its own `Easing.bezier(...)`, such as
 * `FIGHT_EASING` in components/match-flow/fight/fight-tokens.ts.
 */
export const BRAND_EASE_OUT_CURVE = [0.22, 1, 0.36, 1] as const;

/** Reanimated easings, ready to pass to `withTiming({ easing })`. */
export const easing = {
  /** Brand ease-out, `cubic-bezier(0.22, 1, 0.36, 1)`. The default. */
  brandOut: Easing.bezier(...BRAND_EASE_OUT_CURVE),
  /** Out-cubic, the rating tick's count curve. */
  outCubic: Easing.out(Easing.cubic),
} as const;

/** Reanimated spring configs, ready to pass to `withSpring(to, config)`. */
export const spring = {
  /** Release of a pressed control back to rest (Reactive tier). */
  press: { damping: 18, stiffness: 300 },
  /** Tab select bounce back to rest (Reactive tier). */
  select: { damping: 14, stiffness: 260 },
} as const;

/** Scale a pressable shrinks to while held (Reactive tier). */
export const PRESS_SCALE = 0.97;

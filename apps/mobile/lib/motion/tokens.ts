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
 * Named durations of single registered Moments whose timing is their own
 * rather than one of the shared steps above (R3 MF-11). The values are the
 * ones the moments shipped with; naming them changed no timing.
 */
export const moment = {
  /** Countdown: "GRAPPLE" (GO) fades off the live screen. */
  goFade: 700,
  /** Verdict confetti: one piece falls and turns. */
  confettiFall: 1800,
  /** Verdict confetti: a piece starts fading this long after it starts to fall... */
  confettiFadeDelay: 1200,
  /** ...and fades out over this long. */
  confettiFade: 600,
  /** Verdict SlamIn ("YOU WON"): the scale lands. */
  slamIn: 520,
  /** Verdict SlamIn: the fade in. */
  slamInFade: 300,
  /** Verdict RiseIn (the rank strip): the default wait after the verdict... */
  riseInDelay: 500,
  /** ...then the rise and fade. */
  riseIn: 400,
  /** "The tap": one tick mark fills. */
  tapMarkFill: 80,
  /** "The tap": each mark's micro-nudge out (it settles over the rest of the stagger). */
  tapNudge: 50,
  /** Angle dip (match player): an approximate angle switch lands; black in, then out, this long each way. */
  angleDip: 80,
  /**
   * Reel ring pulse (specs/matches-tab 7.2, 10.5): the first unseen reel tile
   * of a session, or a building tile landing as ready, scales 1.0 to 1.04 and
   * back over this long, once. Skipped under Reduce Motion.
   */
  reelRingPulse: 600,
  /**
   * Milestone burst (specs/matches-tab 10.6): one piece falls and turns over
   * this long. Pieces start up to `milestoneBurstStagger` apart, so the whole
   * burst ends within 1.2 s.
   */
  milestoneBurstFall: 900,
  /** Milestone burst: the latest a piece starts after the first. */
  milestoneBurstStagger: 180,
  /** Milestone burst: a piece starts fading this long after it starts to fall... */
  milestoneBurstFadeDelay: 600,
  /** ...and fades out over this long (ends with its fall). */
  milestoneBurstFade: 300,
} as const;

export type MomentToken = keyof typeof moment;

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
  /** Out-cubic, the rating tick's count curve (and the splash odometer). */
  outCubic: Easing.out(Easing.cubic),
  /** In-quad: a fall or a fade off (confetti falling, GO fading). */
  inQuad: Easing.in(Easing.quad),
  /** Linear: a readout of elapsed time (the hold-to-end fill, the time-up drain, the skeleton clock). */
  linear: Easing.linear,
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

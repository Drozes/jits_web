/** Match type: casual (no ELO) or ranked (ELO at stake) */
export const MATCH_TYPE = {
  CASUAL: "casual",
  RANKED: "ranked",
} as const;

export type MatchType = (typeof MATCH_TYPE)[keyof typeof MATCH_TYPE];

/** Challenge status values */
export const CHALLENGE_STATUS = {
  PENDING: "pending",
  ACCEPTED: "accepted",
  DECLINED: "declined",
  EXPIRED: "expired",
  CANCELLED: "cancelled",
} as const;

export type ChallengeStatus =
  (typeof CHALLENGE_STATUS)[keyof typeof CHALLENGE_STATUS];

/** Match outcome for a participant */
export const MATCH_OUTCOME = {
  WIN: "win",
  LOSS: "loss",
  DRAW: "draw",
} as const;

export type MatchOutcome =
  (typeof MATCH_OUTCOME)[keyof typeof MATCH_OUTCOME];

/** Athlete status */
export const ATHLETE_STATUS = {
  PENDING: "pending",
  ACTIVE: "active",
  INACTIVE: "inactive",
} as const;

export type AthleteStatus =
  (typeof ATHLETE_STATUS)[keyof typeof ATHLETE_STATUS];

/** Match status lifecycle */
export const MATCH_STATUS = {
  PENDING: "pending",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  DISPUTED: "disputed",
} as const;

export type MatchStatus = (typeof MATCH_STATUS)[keyof typeof MATCH_STATUS];

/** Match result type */
export const MATCH_RESULT = {
  SUBMISSION: "submission",
  DRAW: "draw",
} as const;

export type MatchResult = (typeof MATCH_RESULT)[keyof typeof MATCH_RESULT];

/**
 * "The Climb" launch reveal — timing + sequence (single source of truth so the
 * mobile overlay, and a future web intro, stay in lockstep). All values in ms.
 * Colors are NOT here; they come from the platform token files (Void palette).
 * Easing is the brand ease-out curve (no overshoot), shared as bezier control
 * points so each platform can build its own easing fn.
 */
export const SPLASH_REVEAL = {
  /** Fallback rating when no cached ELO exists on device (pre-auth cold start). */
  DEFAULT_ELO: 1481,

  /** Brand ease-out, mirrors --easing-default in the web design tokens. */
  EASING_BEZIER: [0.22, 1, 0.36, 1] as const,

  /** Bars rise one-by-one, left → right, like a rating climbing. */
  BAR_COUNT: 5,
  BAR_FIRST_DELAY_MS: 100,
  BAR_STAGGER_MS: 90,
  BAR_RISE_MS: 420,

  /** Gold "breakthrough" peak pops after the tallest bar lands. */
  PEAK_DELAY_MS: 700,
  PEAK_POP_MS: 340,

  /** ELO number fades in, then rolls up (odometer) alongside the bars. */
  NUMBER_DELAY_MS: 250,
  NUMBER_FADE_MS: 300,
  NUMBER_ROLL_MS: 900,

  /** ELO RATED wordmark fades/locks in (hard stop, no bounce). */
  WORDMARK_DELAY_MS: 950,
  WORDMARK_MS: 450,

  /** Signal-Red accent rule wipes left → right under the wordmark. */
  RULE_DELAY_MS: 1180,
  RULE_MS: 500,

  /** "EARN YOUR RANK" tagline fades in just after the rule starts. */
  TAG_DELAY_AFTER_RULE_MS: 120,
  TAG_MS: 400,

  /** Beat to hold the locked frame before dismissing to the app. */
  HOLD_AFTER_MS: 260,

  /** Reduced-motion: show the resting frame, hold briefly, dismiss. No motion. */
  REDUCED_MOTION_HOLD_MS: 260,

  /** Total time from mount to onDone() in the full-motion path. */
  /** = RULE_DELAY_MS (1180) + RULE_MS (500) + HOLD_AFTER_MS (260). */
  TOTAL_MS: 1940,
} as const;

/** Which launch splash plays. 'climb' = the data-viz rating climb (parked, on
 * TestFlight); 'statement' = the cinematic 'WE ARE / ELO RATED / ARE YOU?' reveal. */
export const SPLASH_VARIANT = {
  CLIMB: "climb",
  STATEMENT: "statement",
} as const;

export type SplashVariant = (typeof SPLASH_VARIANT)[keyof typeof SPLASH_VARIANT];

/** Default splash on a fresh device (no local override). */
export const DEFAULT_SPLASH_VARIANT: SplashVariant = SPLASH_VARIANT.STATEMENT;

/**
 * "The Statement" launch reveal — timing + sequence (single source of truth).
 * All values in ms. Reuses SPLASH_REVEAL.EASING_BEZIER for the brand ease-out.
 * Sequence: WE ARE eyebrow fades up; ELO RATED ignites (opacity+scale 1.04->1,
 * no flash); ARE YOU? fades up on the beat + a Heavy haptic; then ELO RATED
 * settles into a gentle, even glow breathe loop. Reduced-motion shows the resting
 * frame and dismisses after a short hold.
 */
export const SPLASH_STATEMENT = {
  /** "WE ARE" gray eyebrow fades up first. Kept tight to the native-splash
   *  hand-off so the F-logo dissolve flows straight into this with no dead-black
   *  gap between them. */
  WEARE_DELAY_MS: 150,
  WEARE_MS: 680,

  /** "ELO RATED" locks/ignites in (opacity 0->1 + scale 1.04->1), no bright flash. */
  IGNITE_DELAY_MS: 330,
  IGNITE_MS: 900,

  /** "ARE YOU?" (Signal Red) fades up on the ignite beat. */
  AREYOU_DELAY_MS: 1080,
  AREYOU_MS: 700,

  /** Felt "lock" — Heavy haptic on the ARE YOU beat (suppressed under reduced-motion). */
  HAPTIC_DELAY_MS: 1080,

  /** Gentle even glow breathe on ELO RATED — full up-and-back cycle, loops forever
   * until the overlay unmounts at handoff. Low amplitude (a calm glow, not a pulse). */
  GLOW_BREATHE_MS: 6000,

  /** Hold the landed frame before the cross-fade out. */
  HOLD_AFTER_MS: 260,

  /** Cross-dissolve the whole overlay (incl. its Void backdrop) into the live app
   *  underneath instead of a hard cut. onDone() fires when this completes. */
  FADEOUT_MS: 300,

  /** Reduced-motion: gently fade the resting frame IN (opacity only — no
   *  transform/scale/glow motion, which is what reduce-motion actually forbids),
   *  dwell long enough to read, then cross-fade out. Dismiss begins at
   *  REDUCED_MOTION_FADEIN_MS + REDUCED_MOTION_HOLD_MS. */
  REDUCED_MOTION_FADEIN_MS: 260,
  REDUCED_MOTION_HOLD_MS: 700,

  /** Time from mount until the cross-fade BEGINS in the full-motion path.
   *  = AREYOU_DELAY_MS (1080) + AREYOU_MS (700) + HOLD_AFTER_MS (260).
   *  onDone() fires FADEOUT_MS (300) later, once the dissolve finishes. */
  TOTAL_MS: 2040,
} as const;

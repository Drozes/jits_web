/**
 * The ELO RATED type scale (WP5, jits-3eeg.6; R3 TY-1, TY-2, TY-6).
 *
 * One source for every text size and letter-spacing on mobile:
 *
 * - `tailwind.config.js` `theme.extend.fontSize` / `letterSpacing` carry the
 *   same steps as classes (`text-body`, `text-display-72`, `tracking-caps-l`).
 * - Style-prop call sites (Reanimated, palette-driven match-flow and Film Room
 *   screens) spread `typeStep("body")` and read `TRACKING["caps-l"]`.
 * - `cn()` (lib/cn.ts) registers every step and tracking name with
 *   tailwind-merge, so `cn("text-micro", "text-ink")` keeps both classes.
 * - The kit mirror (`design/system/project/tokens.json`, Typography.md and
 *   DESIGN.md "Typography") uses the same names; `typography-drift.test.ts`
 *   fails if any of them disagree with this file.
 *
 * The steps are the sizes the app already uses (R1 section 2.3), so a site
 * moves to its step with no pixel change; the few off-scale sizes (9, 15) move
 * by one pixel (see the migration table in Typography.md).
 *
 * Text steps are copy, labels and inline data (any family). Display steps are
 * pinned brand moments and hero numerals (Bebas Neue 40px and up, or mono hero
 * numbers); each one has an owner and they never move to fit a layout.
 *
 * 10px is the floor: no step is smaller (the CountPill digit at 9px is the one
 * sanctioned exception and stays a literal, see the typography guard test).
 */
export interface TypeStepValue {
  /** Device px (literal on native; not affected by NativeWind rem). */
  readonly fontSize: number;
  /** Device px. */
  readonly lineHeight: number;
}

/** The smallest text size the app may render. */
export const TEXT_FLOOR = 10;

/** Copy, labels and inline data. Line heights are about 1.3x up to 16px, 1.2x above. */
export const TEXT_STEPS = {
  /** 10: caps meta labels, tab labels, chips, strip labels (the floor). */
  micro: { fontSize: 10, lineHeight: 13 },
  /** 11: small actions (ROLL), small data, captions. */
  caption: { fontSize: 11, lineHeight: 14 },
  /** 12: secondary body, header titles, small buttons, inline data. */
  small: { fontSize: 12, lineHeight: 16 },
  /** 13: body copy (the most common size), toast titles. */
  body: { fontSize: 13, lineHeight: 17 },
  /** 14: large body, button labels, athlete names. */
  callout: { fontSize: 14, lineHeight: 18 },
  /** 16: plate titles, subheads, the large delta. */
  subhead: { fontSize: 16, lineHeight: 21 },
  /** 18: screen, step and sheet titles. */
  title: { fontSize: 18, lineHeight: 22 },
  /** 20: compare-stats figures, feedback sheet title. */
  "title-l": { fontSize: 20, lineHeight: 24 },
  /** 22: the rating-moment odometer, stat figures, the BrandHeader wordmark. */
  "title-xl": { fontSize: 22, lineHeight: 26 },
  /** 24: profile and competitor names and records. */
  headline: { fontSize: 24, lineHeight: 29 },
  /** 26: the rating-moment delta chip, fight delta, Home greeting. */
  "headline-l": { fontSize: 26, lineHeight: 31 },
  /** 28: stat figures, invite code input, practice titles. */
  "headline-xl": { fontSize: 28, lineHeight: 34 },
  /** 30: match-flow step headers, the result score input. */
  "headline-2xl": { fontSize: 30, lineHeight: 36 },
} as const satisfies Record<string, TypeStepValue>;

/**
 * Display steps: brand moments and hero numerals, named by their px so the
 * owner is obvious. Line height is 1.1x (Bebas and JetBrains Mono clip at 1.0
 * on RN); a pinned moment that tunes its own line height keeps it.
 */
export const DISPLAY_STEPS = {
  /** Face-off weights (Bebas, D-3), EloTile small, share-card ELO, practice verdict. */
  "display-36": { fontSize: 36, lineHeight: 40 },
  /** Film Room title, invite code, opponent-ended plate (the 40px Bebas threshold). */
  "display-40": { fontSize: 40, lineHeight: 44 },
  /** EloTile medium, the challenge prompt rating. */
  "display-44": { fontSize: 44, lineHeight: 48 },
  /** Wordmark lg, result-waiting headline. */
  "display-48": { fontSize: 48, lineHeight: 53 },
  /** Match-detail verdict. */
  "display-52": { fontSize: 52, lineHeight: 57 },
  /** Confirm-step result. */
  "display-60": { fontSize: 60, lineHeight: 66 },
  /** EloTile large. */
  "display-64": { fontSize: 64, lineHeight: 70 },
  /** Wordmark hero, the splash statement, profile and competitor ELO. */
  "display-72": { fontSize: 72, lineHeight: 79 },
  /** Live clock (landscape), the LOSS / DRAW verdict. */
  "display-80": { fontSize: 80, lineHeight: 88 },
  /** Live clock (portrait). */
  "display-88": { fontSize: 88, lineHeight: 97 },
  /** EloTile hero, the WIN verdict, the countdown numeral's minimum. */
  "display-96": { fontSize: 96, lineHeight: 106 },
  /** The GO slam (Adding Flare countdown). */
  "display-116": { fontSize: 116, lineHeight: 128 },
  /** The face-off countdown numeral (Adding Flare). */
  "display-240": { fontSize: 240, lineHeight: 264 },
} as const satisfies Record<string, TypeStepValue>;

export const TYPE_SCALE = { ...TEXT_STEPS, ...DISPLAY_STEPS } as const;

export type TextStep = keyof typeof TEXT_STEPS;
export type DisplayStep = keyof typeof DISPLAY_STEPS;
export type TypeStep = keyof typeof TYPE_SCALE;

/** Step names in scale order (smallest first). */
export const TYPE_STEP_NAMES = Object.keys(TYPE_SCALE) as TypeStep[];

/** `{ fontSize, lineHeight }` for a style prop: `style={[typeStep("body"), ...]}`. */
export function typeStep(step: TypeStep): { fontSize: number; lineHeight: number } {
  const value = TYPE_SCALE[step];
  return { fontSize: value.fontSize, lineHeight: value.lineHeight };
}

/** The step whose size is exactly `px`, if any (used by the guard and drift tests). */
export function stepForSize(px: number): TypeStep | undefined {
  return TYPE_STEP_NAMES.find((name) => TYPE_SCALE[name].fontSize === px);
}

/**
 * Letter-spacing steps in device px. Mobile tracking is a fixed px computed at
 * a 14px baseline (web uses em), so the same step is proportionally wider on
 * small text. `code` (WP5, R3 ST-4) is the one addition: one-time codes.
 */
export const TRACKING = {
  /** -0.02em at 14px. Avoid. */
  tight: -0.28,
  /** The wordmark. */
  mark: -0.07,
  normal: 0,
  /** 0.04em at 14px: loose caps on headings 13px and up. */
  loose: 0.56,
  /** 0.08em at 14px: buttons, chips, display caps. */
  caps: 1.12,
  /** 0.12em at 14px: section and meta labels, tab labels (the default caps label). */
  "caps-l": 1.68,
  /** 0.18em at 14px: strip headers, the LIVE pill. */
  "caps-xl": 2.52,
  /** 0.24em at 14px: the smallest caps. */
  "caps-xxl": 3.36,
  /** One-time code digits (invite codes). */
  code: 4,
} as const;

export type TrackingStep = keyof typeof TRACKING;
export const TRACKING_NAMES = Object.keys(TRACKING) as TrackingStep[];

/** Caps tracking steps: a caps label must use one of these (R3 TY-3). */
export const CAPS_TRACKING = ["caps", "caps-l", "caps-xl", "caps-xxl"] as const;
export type CapsTracking = (typeof CAPS_TRACKING)[number];

/**
 * Hero-numeral tracking: -0.04em of the size (EloTile, the live clock, the
 * profile ELO). Proportional, so it is a function rather than a step.
 */
export const NUMERAL_TRACKING_EM = -0.04;
export function numeralTracking(fontSize: number): number {
  return Math.round(fontSize * NUMERAL_TRACKING_EM * 100) / 100;
}

/**
 * Tabular figures for a style prop (R3 TY-6: the one export; the old copies in
 * `lib/theme/palette.ts` and `broadcast-tokens.ts` re-export this). Prefer the
 * `tabular-nums` class where `className` is available.
 */
export const TABULAR = { fontVariant: ["tabular-nums" as const] };

/** RN font family names (each weight is its own family; RN cannot synthesize weights). */
export const FONT_FAMILY = {
  display: "BebasNeue_400Regular",
  heading: "DMSans_700Bold",
  "heading-medium": "DMSans_500Medium",
  "heading-regular": "DMSans_400Regular",
  body: "Inter_400Regular",
  "body-medium": "Inter_500Medium",
  mono: "JetBrainsMono_400Regular",
  "mono-medium": "JetBrainsMono_500Medium",
  "mono-bold": "JetBrainsMono_700Bold",
} as const;

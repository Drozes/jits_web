import { BRAND_EASE_OUT_CURVE } from "@/lib/motion/tokens";

/**
 * Shape and motion constants for the match-flow screens around the live
 * screen (face-off, countdown, result, confirm, verdict). Colors are not
 * here: the themed steps read `usePalette()` and the chrome over camera or a
 * photo reads `ON_MEDIA` (both in lib/theme/palette.ts).
 */
export const FIGHT_RADIUS = { tag: 2, button: 3, plate: 4 } as const;

export { TABULAR } from "@/lib/theme/palette";

/** The brand ease-out (Motion Rule), used by the countdown and verdict celebration. */
export const FIGHT_EASING = BRAND_EASE_OUT_CURVE;

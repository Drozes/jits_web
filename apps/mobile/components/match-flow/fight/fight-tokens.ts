/**
 * Shape and motion constants for the match-flow screens around the live
 * screen (face-off, countdown, result, confirm, verdict). Colors are not
 * here: the themed steps read `usePalette()` and the chrome over camera or a
 * photo reads `ON_MEDIA` (both in lib/theme/palette.ts).
 */
export const FIGHT_RADIUS = { tag: 2, button: 3, plate: 4 } as const;

export { TABULAR } from "@/lib/theme/palette";

/** Approved easing for the countdown and verdict celebration. */
export const FIGHT_EASING = [0.22, 1, 0.36, 1] as const;

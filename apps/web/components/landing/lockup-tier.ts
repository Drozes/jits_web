/** A lockup set's drawings: [minimum device px, tier], largest first. */
export type TierList = ReadonlyArray<readonly [number, string]>;

/** Float noise guard, so a width computed to land on a threshold counts. */
const EPSILON = 1e-6;

/**
 * Thomas's device-pixel tier pick (section 1.1): the measured part (the
 * whole block lockup, or the one-line lockup's crown, `frac` of the set's
 * width) in device px chooses the first tier whose minimum it reaches.
 */
export function pickTier(setWidthCss: number, frac: number, dpr: number, tiers: TierList): string {
  const px = setWidthCss * frac * dpr;
  const hit = tiers.find(([min]) => px + EPSILON >= min);
  return (hit ?? tiers[tiers.length - 1])[1];
}

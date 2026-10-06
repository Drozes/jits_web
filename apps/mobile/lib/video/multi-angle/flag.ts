/**
 * Dev flag for the multi-angle player v1 (one expo-video player per angle,
 * stacked views, a JS sync loop). OFF by default and OFF in every release
 * bundle: it turns on only in a development build (`__DEV__`) whose bundle
 * was started with `EXPO_PUBLIC_MULTI_ANGLE_PLAYER=1`. With it off the match
 * player is the single-player screen (the P0 in-place switch).
 *
 * Mobile has no runtime flag layer; this is a plain constant on purpose
 * (no backend `feature_flags` row) until the device prototype passes its
 * gate (docs/spikes/2026-10-multi-angle-player.md).
 */
let override: boolean | null = null;

export function isMultiAnglePlayerEnabled(): boolean {
  if (override != null) return override;
  return typeof __DEV__ !== "undefined" && __DEV__ === true && process.env.EXPO_PUBLIC_MULTI_ANGLE_PLAYER === "1";
}

/** Tests only. */
export function __setMultiAnglePlayerForTests(next: boolean | null): void {
  override = next;
}

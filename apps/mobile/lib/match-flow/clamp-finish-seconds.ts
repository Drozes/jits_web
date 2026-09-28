/**
 * The match clock at the end moment, clamped to what `record_match_result`
 * accepts: above 0 and at most the duration (auto-end fires a beat after
 * 00:00, so the raw elapsed can overshoot).
 */
export function clampFinishSeconds(elapsed: number, durationSeconds: number): number {
  return Math.min(durationSeconds, Math.max(1, elapsed));
}

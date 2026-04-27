import * as Haptics from "expo-haptics";

/**
 * Match-flow haptic vocabulary. Centralised so we can swap individual
 * mappings (e.g. tone down `matchStart` from Heavy to Medium) without
 * grepping through step components.
 *
 * Each method returns the underlying promise; callers are free to
 * `await` (rare) or fire-and-forget (typical). All failures are
 * silently swallowed since haptics are pure feedback.
 */
function safe(p: Promise<void>) {
  return p.catch(() => undefined);
}

export const matchHaptics = {
  /** Match has just transitioned into `live` (timer started). */
  matchStart: () => safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  /** End-match button confirmed; final whistle. */
  matchEnd: () => safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** Result successfully recorded server-side. */
  resultRecorded: () => safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** Mutation / network error. */
  error: () => safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
  /** Timer has crossed the low-time-remaining threshold (e.g. 10s). */
  timeWarning: () => safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
};

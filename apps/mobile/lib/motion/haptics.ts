import * as Haptics from "expo-haptics";

/**
 * The app's ONE haptic vocabulary (Motion Rule, DESIGN.md "Motion"). Call a
 * semantic event, never `expo-haptics` directly in new code, so a mapping can
 * be retuned in one place.
 *
 * Rules:
 * - One haptic per event. Before wiring a new call site, check nothing else
 *   already buzzes for the same event (see `challengeArrived`).
 * - Never a haptic for ambient motion (embers, the LIVE pulse, skeletons).
 * - Never a haptic on a loss. There is deliberately no `ratingLoss`, and a
 *   draw is silent too. Only a rating gain buzzes.
 * - Haptics stay on under Reduce Motion; only the visuals go still.
 *
 * Each event returns a promise that never rejects (and the call never throws),
 * since haptics are pure feedback. Fire and forget: `void haptics.press()`.
 */
function safe(fire: () => Promise<void> | void): Promise<void> {
  // Never throws and never rejects: a synchronous throw (no native module, a
  // partial jest mock of expo-haptics) or a non-promise return is swallowed
  // the same way as a rejected promise.
  try {
    return Promise.resolve(fire()).then(
      () => undefined,
      () => undefined,
    );
  } catch {
    return Promise.resolve();
  }
}

export const haptics = {
  /** A commit action was tapped (Challenge, Accept, Confirm result, Go live). Light impact. */
  press: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** The waiting-on-you Accept (incoming challenge) was tapped. Medium impact. */
  accept: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** A tab that was not already active was selected. Selection tick. */
  select: () => safe(() => Haptics.selectionAsync()),
  /** The athlete just went live in the Arena (live false to true). Light impact. */
  goLive: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /**
   * A new incoming challenge arrived. Warning notification, matching the
   * buzz the incoming challenge prompt sheet
   * (components/arena/challenge-prompt-sheet.tsx) already fires once per
   * challenge id. Because that prompt already buzzes, no other surface (the
   * Arena tab clash, countable embers) may fire this for the same challenge.
   */
  challengeArrived: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  /** A rating gain landed (once per confirmed result). Success notification. */
  ratingGain: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** Match has just transitioned into `live` (timer started). Heavy impact. */
  matchStart: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  /** End-match button confirmed; final whistle. Success notification. */
  matchEnd: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** Result successfully recorded server-side. Success notification. */
  resultRecorded: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** Mutation or network error. Error notification. */
  error: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
  /** One numeral of the 3-2-1 face-off countdown slamming in. Heavy impact. */
  countdownTick: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  /** "GO" at the end of the face-off countdown. Success notification. */
  countdownGo: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /**
   * One of the three tick marks of "the tap" on a submission win. Light
   * impact, fired three times, for the WINNER only (never the athlete who
   * tapped: no haptic on a loss).
   */
  tapTick: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Timer has crossed the low-time-remaining threshold (e.g. 10s). Medium impact. */
  timeWarning: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
} as const;

export type HapticEvent = keyof typeof haptics;

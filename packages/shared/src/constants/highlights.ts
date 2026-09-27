/**
 * Highlight reel feedback vocabulary (jr_be spec 014 sections 5.5 and 9.5).
 *
 * The chip codes are a DB CHECK enum on `video_highlight_feedback.chips`
 * (`not_me`, `missed_best_moment`, `too_long`, `too_short`, `slow_start`,
 * `wrong_label`) and the regenerate prompt expands each one to an
 * instruction, so a code here must never be renamed without a migration.
 * The order is the order the chips render in.
 */
export type HighlightFeedbackChip =
  | "not_me"
  | "missed_best_moment"
  | "too_long"
  | "too_short"
  | "slow_start"
  | "wrong_label";

export const HIGHLIGHT_FEEDBACK_CHIPS: ReadonlyArray<{
  code: HighlightFeedbackChip;
  label: string;
}> = [
  { code: "not_me", label: "That's not me" },
  { code: "missed_best_moment", label: "Missed my best moment" },
  { code: "too_long", label: "Too long" },
  { code: "too_short", label: "Too short" },
  { code: "slow_start", label: "Slow start" },
  { code: "wrong_label", label: "Wrong moment labelled" },
];

/**
 * Max length of the athlete's free-text feedback in the UI. The DB allows
 * 500 after trim; the product cap is 280.
 */
export const HIGHLIGHT_FREE_TEXT_MAX = 280;

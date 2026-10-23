/**
 * Every Admin > Timekeeper reviews string (A27, spec 9.2), keyed by its copy
 * deck id (`design/native-screens/proposals/2026-10-15-timekeeper/COPY-DECK.md`
 * Round 5, "Admin review (A27)"; clean-code rule M-R4: the admin screen's own
 * copy module, slice M10). No string has an em dash, an exclamation mark or
 * an emoji.
 *
 * Placeholders, as the deck names them: `{A}` and `{B}` the athletes' short
 * names (challenger first), `{name}` the timekeeper's short name, `{time}`
 * the device's short local time (as TK-H8), `{mm:ss}` the final clock.
 */
import { SHIPPED_COPY, TIMEKEEPER_COPY, type TimekeeperAlert } from "@/lib/match-flow/timekeeper-copy";

/** TK-AD3's values. */
export interface ReviewMetaValues {
  name: string;
  time: string;
  clock: string;
}

export const TIMEKEEPER_REVIEWS_COPY = {
  /** The admin hub row and the screen title. */
  "TK-AD1": "Timekeeper reviews",
  /** The empty state. */
  "TK-AD2": "No matches waiting for review.",
  /** The row meta under the matchup. */
  "TK-AD3": (v: ReviewMetaValues) => `Timekeeper ${v.name} · clock ended ${v.time} · ${v.clock} on the clock`,
  /** The row actions. */
  "TK-AD4": { record: "Record result", void: "Void" },
  /** The Void confirmation alert: Keep is the safe button. */
  "TK-AD5": {
    title: "Void this match?",
    body: "It becomes a no contest and won't count for either athlete.",
    cancel: "Keep",
    confirm: "Void",
  } as TimekeeperAlert,
  /** The toasts after Record result and Void. */
  "TK-AD6": { recorded: "Result recorded", voided: "Match voided", failed: "Couldn't update the match" },
} as const;

export type TimekeeperReviewsCopyId = keyof typeof TIMEKEEPER_REVIEWS_COPY;

/**
 * Strings this screen reuses rather than adds: the matchup as the deck writes
 * it for the timekeeper's own card (TK-H2, `{A} vs {B}`), and shipped words.
 */
export const REVIEWS_REUSED_COPY = {
  /** TK-H2: `{A} vs {B}`. */
  matchup: TIMEKEEPER_COPY["TK-H2"],
  /** Shipped: the admin list screens' buttons (`app/(app)/settings/admin/no-match.tsx`). */
  retry: "Retry",
  refresh: "Refresh",
  /** Shipped (deck A4): the dispute form's way back (`steps/dispute-form.tsx`), also the record form's. */
  back: SHIPPED_COPY.back,
  /** Shipped (deck A4): the empty value and the empty clock (`steps/result-waiting.tsx`). */
  noValue: SHIPPED_COPY.noValue,
  noClock: SHIPPED_COPY.noClock,
} as const;

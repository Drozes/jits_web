/**
 * "No match detected" (jr_be-0qf). The video analysis says whether the
 * footage shows jiu-jitsu at all, as a tri-state:
 *
 *   true   grappling between two athletes was found
 *   false  none was found: the analysis carries no match data and no reel
 *          will be made
 *   null   unknown (analysed before the verdict existed, a chunk that did
 *          not answer, not analysed yet, or an older backend)
 *
 * Only an explicit JSON `false` means "no match". The reason is a short
 * model-written sentence; render it as plain text, never as markup.
 */

/** Longest reason the backend stores (CHECK constraint). */
export const NO_MATCH_REASON_MAX = 500;

/** A JSON boolean stays itself; anything else (absent, null, junk) is unknown. */
export function toMatchDetected(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

/** The trimmed reason, only when the verdict is an explicit false; else null. */
export function toNoMatchReason(matchDetected: boolean | null, value: unknown): string | null {
  if (matchDetected !== false || typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, NO_MATCH_REASON_MAX).trim();
  return trimmed ? trimmed : null;
}

/** The "no match detected" empty state, shared by the web and mobile analysis UIs. */
export const NO_MATCH_COPY = {
  title: "We didn't see a match in this video",
  /** Shown when the backend gave no reason. */
  fallbackReason: "The analysis found no jiu-jitsu in this recording.",
  explainer: "There's no breakdown, key moments or highlight reel for it.",
  tipsHeading: "Filming tips",
  /** One-line note for compact surfaces (the player). */
  short: "No match detected in this video",
} as const;

/** True only for an explicit "no match" verdict (never for unknown). */
export function isNoMatch(analysis: { match_detected?: boolean | null } | null | undefined): boolean {
  return analysis?.match_detected === false;
}

import type { DomainError, DomainErrorCode } from "@jits/shared/api/errors";

/**
 * Every string the "Your highlight" card and the feedback sheet show
 * (jr_be spec 014 section 10), in one place so tests assert the exact copy.
 */
export const HIGHLIGHT_COPY = {
  title: "Your highlight",
  waitingForAnalysis: "Your highlight reel will be made after your match video is analysed.",
  generatingChip: "GENERATING",
  stepFind: "Finding your best moments",
  stepCut: "Cutting your reel",
  eta: "Usually 1 to 3 minutes. You can leave this screen.",
  lastAttemptFailed: "We couldn't make the new version. Your previous reel is still here.",
  improve: "Improve this reel",
  failed: "We couldn't make your highlight reel.",
  tryAgain: "Try again",
  noRetries: "No retries left for this reel.",
  planFailed: "We couldn't find highlights in this video.",
  none: "We couldn't find a clear highlight of you in this video.",
  invalidated: "Your match video was replaced. A new reel will be made once it's analysed.",
  cannotPlay: "We couldn't play this reel right now. Pull down to refresh.",
  goodReel: "Good reel",
  badReel: "Bad reel",
  fullscreen: "Watch full screen",
  sheetTitle: "Improve your reel",
  howWasIt: "How was it?",
  whatsOff: "What's off?",
  placeholder: "Tell us what to change, e.g. 'add the sweep near the end'",
  justSend: "Just send feedback",
  working: "Working out a new cut…",
  paused: "Regeneration is paused right now.",
  regenerateToast: "Making a new version.",
  feedbackSentToast: "Thanks, feedback sent.",
  feedbackFailedToast: "Couldn't save your rating.",
} as const;

export function metaLine(durationS: number, version: number): string {
  return `${Math.round(durationS)}s · Version ${version}`;
}

export function whatChanged(summary: string): string {
  return `What changed: ${summary}`;
}

export function regeneratingBanner(renderTotal: number): string {
  return `Making version ${renderTotal}… You can keep watching this one.`;
}

export function regenerateLabel(rendersRemaining: number): string {
  return `Regenerate (${rendersRemaining} left)`;
}

export function versionsExhausted(renderMax: number): string {
  return `You've used all ${renderMax} versions of this reel.`;
}

export function playerLabel(durationS: number): string {
  return `Your highlight reel, ${Math.round(durationS)} seconds`;
}

export function counterLabel(length: number, max: number): string {
  return `${length}/${max}`;
}

/** DomainError -> copy for highlight actions (spec 9.5 table). */
const ERROR_COPY: Partial<Record<DomainErrorCode, string>> = {
  ATHLETE_NOT_FOUND: "Sign in to see your highlight.",
  NOT_PARTICIPANT: "You are not in this match.",
  HIGHLIGHTS_DISABLED: "Highlight reels are paused right now.",
  HIGHLIGHT_NOT_FOUND: "That highlight no longer exists.",
  HIGHLIGHT_NOT_READY: "Your highlight isn't ready yet.",
  HIGHLIGHT_SOURCE_NOT_READY: "Your match video isn't available for a highlight right now.",
  HIGHLIGHT_RENDER_IN_PROGRESS: "A new version is already being made.",
  HIGHLIGHT_RENDER_LIMIT: "You've used all versions for this reel.",
  HIGHLIGHT_REGEN_UNAVAILABLE: "This reel can't be regenerated.",
  HIGHLIGHT_REGEN_FAILED: "We couldn't work out a better cut. Try different feedback.",
  HIGHLIGHT_REGEN_TIMEOUT: "Still working on it. Check back in a minute.",
  HIGHLIGHT_NOT_RETRYABLE: "This reel doesn't need a retry.",
  HIGHLIGHT_FEEDBACK_INVALID: "We couldn't save that feedback.",
  HIGHLIGHT_FEEDBACK_LIMIT: "You've sent a lot of feedback on this reel. Try again later.",
  HIGHLIGHT_BAD_SEGMENTS: "Those moments can't make a reel.",
};

export const HIGHLIGHT_ERROR_FALLBACK = "Something went wrong. Try again.";

/** Never shows a raw server / network message: unknown codes get the fallback. */
export function highlightErrorCopy(error: Pick<DomainError, "code">): string {
  return ERROR_COPY[error.code] ?? HIGHLIGHT_ERROR_FALLBACK;
}

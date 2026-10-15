/**
 * Every string of report, block and AI consent (jits-rog5.11). DESIGN.md
 * voice: short, active, second person, no exclamation marks, no em dashes.
 */
import type { ReportReason, ReportTargetType } from "@jits/shared/api/moderation";

/** The five report reasons, in sheet order. */
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  inappropriate: "Inappropriate content",
  harassment: "Harassment or bullying",
  impersonation: "Impersonation",
  spam: "Spam",
  other: "Something else",
};

/** The address elorated.com/support publishes. */
export const SUPPORT_EMAIL = "info@elorated.com";

export const MODERATION_COPY = {
  more: "More actions",
  reportAthlete: "Report athlete",
  blockAthlete: "Block athlete",
  unblockAthlete: "Unblock",
  report: "Report",
  reportVideo: "Report video",
  reportReel: "Report reel",
  reportTitle: {
    athlete: "Report athlete",
    match_video: "Report video",
    highlight: "Report reel",
  } satisfies Record<ReportTargetType, string>,
  reportLede: "Tell us what's wrong. Our team reviews it.",
  reasonLabel: "Reason",
  detailsLabel: "Details (optional)",
  detailsPlaceholder: "Add anything that helps us review it",
  submit: "Submit",
  cancel: "Cancel",
  reportThanks: "Thanks. We review every report within 24 hours.",
  blockTitle: (name: string) => `Block ${name}?`,
  blockBody:
    "They won't be able to challenge you, and you won't see each other in the Arena or your lists. You can unblock in Settings.",
  blockConfirm: "Block",
  blocked: (name: string) => `You blocked ${name}.`,
  unblocked: (name: string) => `You unblocked ${name}.`,
  blockedStateTitle: "Blocked",
  blockedStateBody: (name: string) =>
    `You blocked ${name}. They can't challenge you, and you won't see each other in the Arena or your lists.`,
  unavailableTitle: "Not available",
  unavailableBody: "You can't see this athlete's profile.",
  blockedListTitle: "Blocked athletes",
  blockedListEmpty: "You haven't blocked anyone.",
  blockedListEmptyHint: "To block an athlete, open their profile and tap More.",
  blockedListError: "Couldn't load blocked athletes. Check your connection.",
  blockedSince: (date: string) => `Blocked ${date}`,
  tryAgain: "Try again",
} as const;

/** Server HINTs (jr_be-m2s) to what the athlete reads. */
const HINT_COPY: Record<string, string> = {
  cannot_block_self: "You can't block yourself.",
  athlete_not_found: "This athlete isn't available anymore.",
  invalid_target: "This can't be reported anymore.",
  invalid_reason: "Pick a reason and try again.",
  cannot_report_self: "You can't report your own profile or content.",
  report_rate_limited: "You've sent a lot of reports. Try again later.",
  not_authenticated: "Sign in again, then try again.",
  invalid_arguments: "Something went wrong. Try again.",
};

export const BLOCK_FAILED = "Couldn't block. Check your connection and try again.";
export const UNBLOCK_FAILED = "Couldn't unblock. Check your connection and try again.";
export const REPORT_FAILED = "Couldn't send your report. Check your connection and try again.";

/** A HINT's copy, else the action's own fallback. */
export function moderationErrorCopy(hint: string | null | undefined, fallback: string): string {
  if (hint && Object.prototype.hasOwnProperty.call(HINT_COPY, hint)) return HINT_COPY[hint];
  return fallback;
}

/** AI processing consent (5.1.2(i)), the sheet and the Settings screen. */
export const AI_CONSENT_COPY = {
  title: "Before you film",
  body:
    "Your match video, with your display name, rating and weight division, is sent to Google Gemini to find key moments and cut your highlights. Stills from the video may be sent to OpenAI to make your avatar (or the video to Google Gemini if OpenAI is unavailable). Video and results are stored on our servers.",
  privacyLink: "Read the Privacy Policy",
  allow: "Allow and film",
  uploadTitle: "Before you upload",
  allowUpload: "Allow and upload",
  uploadParked: "Your clip stays on this phone until you allow it.",
  notNow: "Not now",
  declinedNote: "No film this time. Your match still counts.",
  failed: "Couldn't save your choice. Check your connection and try again.",
  settingsRow: "AI processing",
  settingsTitle: "AI processing",
  statusLabel: "Status",
  given: (date: string) => `Given ${date}`,
  notGiven: "Not given",
  settingsNotGivenHint: "You're asked before your first filmed match. Matches without film still count.",
  withdrawNote: `To withdraw your consent, email ${SUPPORT_EMAIL}.`,
} as const;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Oct 14, 2026" in the device's zone; "" for an unreadable date. */
export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** "Given Oct 14, 2026" / "Not given" (the Settings row and the AI processing screen). */
export function aiConsentStatus(consentAt: string | null): string {
  if (!consentAt) return AI_CONSENT_COPY.notGiven;
  const date = formatShortDate(consentAt);
  return date ? AI_CONSENT_COPY.given(date) : "Given";
}

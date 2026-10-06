import * as tracking from "@/lib/error-tracking/sentry";

/**
 * Sentry funnel events for the Matches tab and Home empty states
 * (specs/matches-tab section 13), the same pattern as
 * `lib/video/upload-telemetry.ts`: one `captureMessage` per event with tags
 * only (no free text, no user data; `scrubTelemetryUser` strips the user in
 * `beforeSend`). Telemetry never throws into a tap handler.
 */

export type EmptyCtaSurface = "matches" | "home";
export type EmptyCtaState = "zero" | "low_data" | "no_reels";
/** `invite` is C-Z7 Challenge a friend, `practice` C-Z5, `arena` every Find a match. */
export type EmptyCta = "arena" | "practice" | "invite";

export const EMPTY_CTA_EVENT = "matches.empty_cta";

/** One tap on an empty or low-data CTA (spec 10.8, AC 6.14). */
export function logEmptyCta(tags: { surface: EmptyCtaSurface; state: EmptyCtaState; cta: EmptyCta }): void {
  try {
    tracking.captureMessage(EMPTY_CTA_EVENT, { level: "info", tags: { ...tags } });
  } catch {
    /* telemetry is never allowed to fail a tap */
  }
}

export type MilestoneTag = "first_match" | "first_win" | "first_highlight";
export const MILESTONE_SHOWN_EVENT = "matches.milestone_shown";

/** A celebration started (spec 13, AC 6.14). */
export function logMilestoneShown(milestone: MilestoneTag): void {
  try {
    tracking.captureMessage(MILESTONE_SHOWN_EVENT, { level: "info", tags: { milestone } });
  } catch {
    /* never fails the celebration */
  }
}

/** How the Matches tab was reached (spec 13). `redirect` is reserved for the Film Room redirect, which does not tag itself yet. */
export type TabOpenedEntry = "tab" | "redirect" | "see_all";
export const TAB_OPENED_BREADCRUMB = "matches.tab_opened";

/** A breadcrumb, not an event, to keep volume low (spec 13). */
export function logTabOpened(entry: TabOpenedEntry): void {
  try {
    tracking.addBreadcrumb({ category: "matches", message: TAB_OPENED_BREADCRUMB, data: { entry } });
  } catch {
    /* telemetry never throws */
  }
}

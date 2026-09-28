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

/**
 * Share-funnel telemetry steps (jr_be spec 014 section 16.3.6). A DB CHECK
 * enum on `video_highlight_share_events.step`: never rename one without a
 * migration. `log_highlight_share_event` rejects anything else.
 */
export const HIGHLIGHT_SHARE_STEPS = [
  "viewer_opened",
  "share_tapped",
  "caption_copied",
  "download_ok",
  "download_failed",
  "reels_handoff_ok",
  "reels_handoff_failed",
  "returned_from_instagram",
  "share_sheet_opened",
  "share_sheet_failed",
  "saved_to_photos",
  "save_failed",
  "save_permission_denied",
  "improve_tapped",
  "home_card_tapped",
  "home_card_dismissed",
  "notification_opened",
  "profile_row_tapped",
] as const;

export type HighlightShareStep = (typeof HIGHLIGHT_SHARE_STEPS)[number];

/** Where the athlete entered the viewer from (the `source` detail key). */
export const HIGHLIGHT_SHARE_SOURCES = [
  "push",
  "bell",
  "home",
  "profile",
  "match_detail",
  "summary",
] as const;

export type HighlightShareSourceTag = (typeof HIGHLIGHT_SHARE_SOURCES)[number];

/**
 * TTL of the signed URL the share download is fetched from. Short on
 * purpose: it only has to outlive one download, never a session.
 */
export const HIGHLIGHT_DOWNLOAD_URL_TTL_S = 300;

/**
 * The `detail` keys the client sends with a share event (all optional; the
 * server only enforces "a JSON object of at most 2048 bytes"):
 *
 * - `source`: a `HighlightShareSourceTag`.
 * - `path`: `reels` | `share_sheet`.
 * - `failure`: a Reels failure value from the mobile Reels module, or
 *   `download_timeout` | `download_http` | `permission` | `unknown`.
 * - `elapsed_ms`, `byte_count`, `http_status`: numbers. `oversize`,
 *   `reused` (the download reused a complete cached file): booleans.
 * - `platform`, `os_version`, `app_version`, `runtime_version`: added by the
 *   mobile telemetry wrapper on every event.
 * - `clipboard`: `button` | `press_and_hold`.
 */
export type HighlightShareEventDetail = Record<string, string | number | boolean | null>;

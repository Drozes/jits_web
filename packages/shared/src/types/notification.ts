export type NotificationType = "message" | "challenge" | "match_result";

export interface NotificationPayload {
  type: NotificationType;
  title: string;
  body: string;
  href?: string;
  avatarUrl?: string | null;
  avatarFallback?: string;
}

// ---------------------------------------------------------------------------
// Notification center items (built from existing tables, no backend migration)
// ---------------------------------------------------------------------------

export type NotificationItemType =
  | "challenge_received"
  | "challenge_accepted"
  | "challenge_declined"
  | "match_result"
  | "session_joined";

export interface NotificationItem {
  id: string;
  type: NotificationItemType;
  title: string;
  body: string;
  // No route field: a shared route once carried the retired `/session/<id>`
  // path. Each platform maps `challengeId` / `matchId` to its own screens.
  /** The challenge behind a `challenge_*` row. */
  challengeId?: string;
  /** The completed match behind a `match_result` row. */
  matchId?: string;
  createdAt: string;
}

/** Group label for date-based sections */
export type NotificationDateGroup = "Today" | "Yesterday" | "Earlier";

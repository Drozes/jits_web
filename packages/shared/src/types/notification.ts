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
  route?: string;
  createdAt: string;
}

/** Group label for date-based sections */
export type NotificationDateGroup = "Today" | "Yesterday" | "Earlier";

export type NotificationType = "message" | "challenge" | "match_result";

export interface NotificationPayload {
  type: NotificationType;
  title: string;
  body: string;
  href?: string;
  avatarUrl?: string | null;
  avatarFallback?: string;
}

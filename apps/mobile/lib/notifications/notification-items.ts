import type { NotificationItem } from "@jits/shared/types/notification";
import type { MyHighlightItem } from "@jits/shared/api/highlight-share";
import { bellBody, bellTitle, highlightHref } from "@/lib/highlight/discovery";

/**
 * A ready-reel row in the bell feed (jr_be spec 015 section 16.6.4). Mobile
 * only: the shared `NotificationItemType` is NOT widened, since web renders
 * that union and would have to change with it.
 */
export interface HighlightNotificationItem {
  type: "highlight_ready";
  id: string;
  title: string;
  body: string;
  route: string;
  createdAt: string;
  unread: boolean;
}

/** Everything the mobile bell lists. */
export type BellItem = NotificationItem | HighlightNotificationItem;

export function isHighlightItem(item: BellItem): item is HighlightNotificationItem {
  return item.type === "highlight_ready";
}

/** Bell rows for the reels the athlete was notified about (a ledger row exists). */
export function toHighlightNotificationItems(items: MyHighlightItem[]): HighlightNotificationItem[] {
  return items.flatMap((h) =>
    h.notifiedAt
      ? [
          {
            type: "highlight_ready" as const,
            id: `highlight-${h.highlightId}-v${h.version}`,
            title: bellTitle(h.origin),
            body: bellBody(h.opponentName),
            route: highlightHref(h.highlightId, "bell"),
            createdAt: h.notifiedAt,
            unread: h.unseen,
          },
        ]
      : [],
  );
}

/** Newest first, the order the panel groups by date in. */
export function mergeBellItems(
  base: NotificationItem[],
  highlights: HighlightNotificationItem[],
): BellItem[] {
  return [...base, ...highlights].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

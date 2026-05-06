"use client";

import { Swords, Zap, CheckCircle, XCircle } from "lucide-react";
import { formatRelativeDate, getDateGroup } from "@jits/shared/utils";
import type {
  NotificationItem,
  NotificationDateGroup,
} from "@jits/shared/types/notification";

const iconMap: Record<
  NotificationItem["type"],
  { Icon: typeof Swords; className: string }
> = {
  match_result: { Icon: Swords, className: "bg-primary/10 text-primary" },
  challenge_received: {
    Icon: Zap,
    className: "bg-yellow-500/10 text-yellow-500",
  },
  challenge_accepted: {
    Icon: CheckCircle,
    className: "bg-success/10 text-success",
  },
  challenge_declined: {
    Icon: XCircle,
    className: "bg-muted text-muted-foreground",
  },
  session_joined: { Icon: Swords, className: "bg-blue-500/10 text-blue-500" },
};

function NotificationRow({ item }: { item: NotificationItem }) {
  const { Icon, className } = iconMap[item.type];
  return (
    <div className="flex items-start gap-3 rounded-lg p-3 transition-colors hover:bg-accent/50">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${className}`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{item.title}</p>
        <p className="truncate text-xs text-muted-foreground">{item.body}</p>
      </div>
      <span className="whitespace-nowrap pt-0.5 font-mono text-[11px] text-muted-foreground">
        {formatRelativeDate(item.createdAt)}
      </span>
    </div>
  );
}

function DateGroupHeader({ label }: { label: NotificationDateGroup }) {
  return (
    <p className="px-3 pb-1 pt-4 font-heading text-xs uppercase tracking-wider text-muted-foreground">
      {label}
    </p>
  );
}

export function NotificationList({ items }: { items: NotificationItem[] }) {
  if (items.length === 0) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        No notifications yet. Start a session to get rolling.
      </div>
    );
  }

  const groups: { label: NotificationDateGroup; items: NotificationItem[] }[] =
    [];
  let current: (typeof groups)[number] | null = null;

  for (const item of items) {
    const label = getDateGroup(item.createdAt);
    if (!current || current.label !== label) {
      current = { label, items: [] };
      groups.push(current);
    }
    current.items.push(item);
  }

  return (
    <div className="flex flex-col">
      {groups.map((g) => (
        <div key={g.label}>
          <DateGroupHeader label={g.label} />
          {g.items.map((item) => (
            <NotificationRow key={item.id} item={item} />
          ))}
        </div>
      ))}
    </div>
  );
}

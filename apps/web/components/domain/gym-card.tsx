import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";
import type { GymListItem } from "@jits/shared/types/session";

interface GymCardProps {
  gym: GymListItem;
  isMyGym: boolean;
}

/**
 * Format an ISO timestamp as "Sun 11AM" or "Tue 7PM" (no minutes when :00).
 * Wireframe E1 line ~1364-1365 expects this short schedule label on each row.
 */
function formatNextSession(iso: string): string {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date);
  const minutes = date.getMinutes();
  const timeOpts: Intl.DateTimeFormatOptions =
    minutes === 0
      ? { hour: "numeric", hour12: true }
      : { hour: "numeric", minute: "2-digit", hour12: true };
  const time = new Intl.DateTimeFormat("en-US", timeOpts)
    .format(date)
    .replace(/\s/g, "")
    .toUpperCase();
  return `${day} ${time}`;
}

export function GymCard({ gym, isMyGym }: GymCardProps) {
  return (
    <Link href={`/gyms/${gym.id}`}>
      <Card variant="interactive" className="p-4 active:scale-[0.98]">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-semibold truncate">{gym.name}</span>
              {isMyGym && (
                <Badge variant="outline" className="text-[10px] shrink-0">
                  My Gym
                </Badge>
              )}
              {gym.hasActiveSession && (
                <Badge variant="success" className="text-[10px] shrink-0">
                  Live
                </Badge>
              )}
            </div>
            {gym.city && (
              <span className="text-xs text-muted-foreground">{gym.city}</span>
            )}
          </div>
        </div>

        <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            {gym.memberCount} {gym.memberCount === 1 ? "member" : "members"}
          </span>
          {gym.activeSessions > 0 ? (
            <span className="text-green-500 font-medium">
              {gym.activeSessions} active
            </span>
          ) : gym.nextSessionStart ? (
            <span className="font-mono tabular-nums">
              {formatNextSession(gym.nextSessionStart)}
            </span>
          ) : (
            <span className="font-mono uppercase tracking-[0.16em] text-muted-foreground">
              No sessions
            </span>
          )}
        </div>
      </Card>
    </Link>
  );
}

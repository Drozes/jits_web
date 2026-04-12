import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";
import type { GymListItem } from "@/types/session";

interface GymCardProps {
  gym: GymListItem;
  isMyGym: boolean;
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
          {gym.activeSessions > 0 && (
            <span className="text-green-500 font-medium">
              {gym.activeSessions} active
            </span>
          )}
          {gym.upcomingSessions > 0 && (
            <span>{gym.upcomingSessions} upcoming</span>
          )}
        </div>
      </Card>
    </Link>
  );
}

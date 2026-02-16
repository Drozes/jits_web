import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { EloBadge } from "@/components/domain/elo-badge";
import { getInitials } from "@/lib/utils";
import type { Athlete } from "@/types/athlete";

interface ProfileHeaderProps {
  athlete: Athlete;
  gymName?: string | null;
  lookingForCasual?: boolean;
  lookingForRanked?: boolean;
  stats: {
    wins: number;
    losses: number;
    winRate: number;
  };
}

export function ProfileHeader({ athlete, gymName, lookingForCasual, lookingForRanked, stats }: ProfileHeaderProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          <Avatar className="h-20 w-20 bg-gradient-to-br from-primary to-red-600 text-white border-2 border-muted shadow-md">
            <AvatarFallback className="text-xl bg-gradient-to-br from-primary to-red-600 text-white">
              {getInitials(athlete.display_name)}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold tracking-tight truncate">
              {athlete.display_name}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-muted-foreground">
                ELO <EloBadge elo={athlete.current_elo} variant="compact" />
              </span>
            </div>
            {athlete.highest_elo > athlete.current_elo && (
              <p className="text-sm text-primary mt-0.5">
                Peak: {athlete.highest_elo}
              </p>
            )}
            {gymName && (
              <p className="text-sm text-muted-foreground mt-0.5 truncate">
                {gymName}
              </p>
            )}
            {athlete.current_weight && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {athlete.current_weight} lbs
              </p>
            )}
            {(lookingForCasual || lookingForRanked) && (
              <div className="flex items-center gap-1.5 mt-1">
                <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs font-medium text-green-600">
                  Looking for {[lookingForCasual && "casual", lookingForRanked && "ranked"].filter(Boolean).join(" & ")}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 pt-4 border-t grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-green-500 tabular-nums">
              {stats.wins}
            </p>
            <p className="text-xs text-muted-foreground">Wins</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-red-500 tabular-nums">
              {stats.losses}
            </p>
            <p className="text-xs text-muted-foreground">Losses</p>
          </div>
          <div>
            <p className="text-2xl font-bold tabular-nums">{stats.winRate}%</p>
            <p className="text-xs text-muted-foreground">Win Rate</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

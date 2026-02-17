import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getInitials, getEloTierClass } from "@/lib/utils";
import { OnlineIndicator } from "./online-indicator";
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
  const metaParts = [gymName, athlete.current_weight ? `${athlete.current_weight} lbs` : null].filter(Boolean);
  const lookingFor = [lookingForCasual && "Casual", lookingForRanked && "Ranked"].filter(Boolean).join(" & ");

  return (
    <section className="flex flex-col items-center text-center">
      {/* Avatar with ELO tier ring */}
      <div className={`rounded-full outline outline-3 outline-offset-2 ${getEloTierClass(athlete.current_elo)}`}>
        <OnlineIndicator athleteId={athlete.id}>
          <Avatar className="h-24 w-24 bg-gradient-to-br from-primary to-red-600 text-white border-2 border-muted shadow-md">
            <AvatarFallback className="text-2xl bg-gradient-to-br from-primary to-red-600 text-white">
              {getInitials(athlete.display_name)}
            </AvatarFallback>
          </Avatar>
        </OnlineIndicator>
      </div>

      {/* Name */}
      <h2 className="mt-4 text-2xl font-bold tracking-tight">
        {athlete.display_name}
      </h2>

      {/* ELO */}
      <div className="mt-1">
        <span className="text-3xl font-bold tabular-nums">{athlete.current_elo}</span>
        <span className="text-sm text-muted-foreground ml-1.5">ELO</span>
      </div>
      {athlete.highest_elo > athlete.current_elo && (
        <p className="text-xs text-primary">Peak: {athlete.highest_elo}</p>
      )}

      {/* Metadata: gym + weight */}
      {metaParts.length > 0 && (
        <p className="mt-2 text-sm text-muted-foreground truncate max-w-full">
          {metaParts.join(" · ")}
        </p>
      )}

      {/* Looking-for badge */}
      {lookingFor && (
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-green-500/10 px-3 py-1 border border-green-500/20">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs font-medium text-green-600">
            Open to {lookingFor}
          </span>
        </div>
      )}

      {/* Stats */}
      <div className="mt-4 grid w-full grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-2xl font-bold text-green-500 tabular-nums">{stats.wins}</p>
          <p className="text-xs text-muted-foreground">Wins</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-red-500 tabular-nums">{stats.losses}</p>
          <p className="text-xs text-muted-foreground">Losses</p>
        </div>
        <div>
          <p className="text-2xl font-bold tabular-nums">{stats.winRate}%</p>
          <p className="text-xs text-muted-foreground">Win Rate</p>
        </div>
      </div>
    </section>
  );
}

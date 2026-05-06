import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { getEloTierClass, getProfilePhotoUrl } from "@/lib/utils";
import { getInitials } from "@jits/shared/utils";
import { OnlineIndicator } from "./online-indicator";
import type { Athlete } from "@jits/shared/types/athlete";

interface ProfileHeaderProps {
  athlete: Athlete;
  gymName?: string | null;
  stats: {
    wins: number;
    losses: number;
    winRate: number;
  };
}

export function ProfileHeader({ athlete, gymName, stats }: ProfileHeaderProps) {
  const metaParts = [gymName, athlete.current_weight ? `${athlete.current_weight} lbs` : null].filter(Boolean);

  return (
    <section className="flex flex-col items-center text-center">
      {/* Avatar with ELO tier ring */}
      <div className={`rounded-full outline outline-3 outline-offset-4 ${getEloTierClass(athlete.current_elo)} transition-all`}>
        <OnlineIndicator athleteId={athlete.id}>
          <Avatar className="h-24 w-24 bg-gradient-to-br from-primary to-red-600 text-white border-4 border-background shadow-lg">
            {athlete.profile_photo_url && (
              <AvatarImage
                src={getProfilePhotoUrl(athlete.profile_photo_url)!}
                alt={athlete.display_name}
                className="object-cover"
              />
            )}
            <AvatarFallback className="text-2xl bg-gradient-to-br from-primary to-red-600 text-white">
              {getInitials(athlete.display_name)}
            </AvatarFallback>
          </Avatar>
        </OnlineIndicator>
      </div>

      {/* Name */}
      <h2 className="mt-5 text-2xl font-bold tracking-tight">
        {athlete.display_name}
      </h2>

      {/* ELO */}
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="text-3xl font-bold tabular-nums">{athlete.current_elo}</span>
        <span className="text-sm font-medium text-muted-foreground">ELO</span>
      </div>
      {athlete.highest_elo > athlete.current_elo && (
        <p className="text-xs text-muted-foreground mt-0.5">Peak: {athlete.highest_elo}</p>
      )}

      {/* Metadata: gym + weight */}
      {metaParts.length > 0 && (
        <p className="mt-2 text-sm text-muted-foreground truncate max-w-full">
          {metaParts.join(" · ")}
        </p>
      )}

      {/* Stats */}
      <div className="mt-5 grid w-full grid-cols-3 gap-2">
        <div className="rounded-2xl bg-green-500/5 border border-green-500/10 py-3 px-2">
          <p className="text-2xl font-bold text-success tabular-nums">{stats.wins}</p>
          <p className="text-[11px] font-medium text-muted-foreground mt-0.5">Wins</p>
        </div>
        <div className="rounded-2xl bg-red-500/5 border border-red-500/10 py-3 px-2">
          <p className="text-2xl font-bold text-destructive tabular-nums">{stats.losses}</p>
          <p className="text-[11px] font-medium text-muted-foreground mt-0.5">Losses</p>
        </div>
        <div className="rounded-2xl bg-muted/50 border border-border py-3 px-2">
          <p className="text-2xl font-bold tabular-nums">{stats.winRate}%</p>
          <p className="text-[11px] font-medium text-muted-foreground mt-0.5">Win Rate</p>
        </div>
      </div>
    </section>
  );
}

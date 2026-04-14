import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Crown, Medal, Award, TrendingUp, TrendingDown } from "lucide-react";
import { getInitials, getProfilePhotoUrl } from "@/lib/utils";
import { ChallengeBadge } from "./challenge-badge";
import { OnlineIndicator } from "./online-indicator";

function getRankDisplay(rank: number) {
  if (rank === 1) return <Crown className="h-5 w-5 text-yellow-500 drop-shadow-sm" />;
  if (rank === 2) return <Medal className="h-5 w-5 text-gray-400" />;
  if (rank === 3) return <Award className="h-5 w-5 text-amber-600" />;
  return <span className="text-sm font-semibold text-muted-foreground">#{rank}</span>;
}

interface AthleteCardProps {
  id?: string;
  rank: number;
  displayName: string;
  currentElo: number;
  wins: number;
  losses: number;
  gymName?: string;
  profilePhotoUrl?: string;
  isCurrentUser?: boolean;
  hasPendingChallenge?: boolean;
  eloTrend?: "up" | "down" | "neutral";
}

export function AthleteCard({
  id,
  rank,
  displayName,
  currentElo,
  wins,
  losses,
  gymName,
  profilePhotoUrl,
  isCurrentUser,
  hasPendingChallenge,
  eloTrend,
}: AthleteCardProps) {
  const card = (
    <Card
      variant={id && !isCurrentUser ? "interactive" : undefined}
      className={`p-4 ${isCurrentUser ? "ring-2 ring-primary/20 bg-primary/[0.03]" : ""}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <div className="flex w-8 justify-center">{getRankDisplay(rank)}</div>
          <OnlineIndicator athleteId={id ?? ""}>
            <Avatar className="h-11 w-11 border-2 border-border bg-gradient-to-br from-primary to-primary/80 text-white">
              {profilePhotoUrl && (
                <AvatarImage src={getProfilePhotoUrl(profilePhotoUrl)!} alt={displayName} className="object-cover" />
              )}
              <AvatarFallback className="bg-gradient-to-br from-primary to-primary/80 font-bold text-white text-sm">
                {getInitials(displayName)}
              </AvatarFallback>
            </Avatar>
          </OnlineIndicator>
          <div>
            <div className="flex items-center gap-2 font-semibold">
              <span className="text-[15px]">{displayName}</span>
              {isCurrentUser && (
                <Badge variant="outline" className="border-primary/30 bg-primary/5 text-[10px] text-primary">
                  You
                </Badge>
              )}
              {hasPendingChallenge && <ChallengeBadge />}
            </div>
            {gymName && (
              <span className="text-xs text-muted-foreground">{gymName}</span>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="flex items-center justify-end gap-1">
            {eloTrend === "up" && <TrendingUp className="h-3 w-3 text-success" />}
            {eloTrend === "down" && <TrendingDown className="h-3 w-3 text-destructive" />}
            <span className="text-lg font-bold tabular-nums">{currentElo}</span>
          </div>
          <div className="text-xs text-muted-foreground tabular-nums">
            <span className="text-success">{wins}W</span>
            <span className="mx-0.5">·</span>
            <span className="text-destructive">{losses}L</span>
          </div>
        </div>
      </div>
    </Card>
  );

  if (id && !isCurrentUser) {
    return <Link href={`/athlete/${id}`}>{card}</Link>;
  }
  return card;
}

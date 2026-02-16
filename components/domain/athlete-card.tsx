import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Crown, Medal, Award } from "lucide-react";
import { getInitials } from "@/lib/utils";
import { ChallengeBadge } from "./challenge-badge";
import { OnlineIndicator } from "./online-indicator";

function getRankDisplay(rank: number) {
  if (rank === 1) return <Crown className="h-5 w-5 text-yellow-500" />;
  if (rank === 2) return <Medal className="h-5 w-5 text-gray-400" />;
  if (rank === 3) return <Award className="h-5 w-5 text-amber-600" />;
  return <span className="text-sm font-medium text-muted-foreground">#{rank}</span>;
}

interface AthleteCardProps {
  id?: string;
  rank: number;
  displayName: string;
  currentElo: number;
  wins: number;
  losses: number;
  gymName?: string;
  isCurrentUser?: boolean;
  hasPendingChallenge?: boolean;
}

export function AthleteCard({
  id,
  rank,
  displayName,
  currentElo,
  wins,
  losses,
  gymName,
  isCurrentUser,
  hasPendingChallenge,
}: AthleteCardProps) {
  const card = (
    <Card
      variant={id && !isCurrentUser ? "interactive" : undefined}
      className={`p-4 ${isCurrentUser ? "ring-2 ring-accent bg-accent/5" : ""}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex w-8 justify-center">{getRankDisplay(rank)}</div>
          <OnlineIndicator athleteId={id ?? ""}>
            <Avatar className="h-12 w-12 border-2 border-accent/20 bg-gradient-to-br from-primary to-primary/80 text-white">
              <AvatarFallback className="bg-gradient-to-br from-primary to-primary/80 font-bold text-white">
                {getInitials(displayName)}
              </AvatarFallback>
            </Avatar>
          </OnlineIndicator>
          <div>
            <div className="flex items-center gap-2 font-semibold">
              <span>{displayName}</span>
              {isCurrentUser && (
                <Badge variant="outline" className="border-accent text-xs text-accent">
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
          <div className="text-lg font-bold text-primary">{currentElo}</div>
          <div className="text-sm text-muted-foreground">
            {wins}W - {losses}L
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

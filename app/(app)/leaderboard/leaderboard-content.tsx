"use client";

import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { AthleteCard } from "@/components/domain/athlete-card";
import { Crown, Medal, Award, Trophy, Users } from "lucide-react";
import { getInitials, getProfilePhotoUrl } from "@/lib/utils";

interface RankedAthlete {
  id: string;
  rank: number;
  displayName: string;
  currentElo: number;
  gymName?: string;
  profilePhotoUrl?: string;
  wins: number;
  losses: number;
  isCurrentUser: boolean;
}

interface RankedGym {
  id: string;
  rank: number;
  name: string;
  totalElo: number;
  averageElo: number;
  memberCount: number;
}

function getRankIcon(rank: number) {
  if (rank === 1) return <Crown className="h-5 w-5 text-yellow-500 drop-shadow-sm" />;
  if (rank === 2) return <Medal className="h-5 w-5 text-gray-400" />;
  if (rank === 3) return <Award className="h-5 w-5 text-amber-600" />;
  return <span className="text-sm font-semibold text-muted-foreground">#{rank}</span>;
}

function PodiumSlot({
  athlete,
  place,
}: {
  athlete: RankedAthlete;
  place: 1 | 2 | 3;
}) {
  const sizeMap = {
    1: { avatar: "h-16 w-16", text: "text-sm", elo: "text-base", height: "pt-6 pb-4" },
    2: { avatar: "h-14 w-14", text: "text-xs", elo: "text-sm", height: "pt-5 pb-3" },
    3: { avatar: "h-12 w-12", text: "text-xs", elo: "text-xs", height: "pt-4 pb-3" },
  };
  const s = sizeMap[place];

  const podiumBg = {
    1: "from-yellow-400/20 to-yellow-600/10 border-yellow-500/30",
    2: "from-gray-300/20 to-gray-400/10 border-gray-400/30",
    3: "from-amber-400/20 to-amber-600/10 border-amber-500/30",
  };

  const trophyBg = {
    1: "bg-gradient-to-br from-yellow-400 to-yellow-600 shadow-glow-gold",
    2: "bg-gradient-to-br from-gray-300 to-gray-400",
    3: "bg-gradient-to-br from-amber-400 to-amber-700",
  };

  const maxW = { 1: "max-w-[120px]", 2: "max-w-[110px]", 3: "max-w-[100px]" };

  return (
    <div className={`flex-1 text-center ${maxW[place]}`}>
      <div
        className={`${place === 1 ? "h-14 w-14" : place === 2 ? "h-11 w-11" : "h-10 w-10"} mx-auto mb-2 ${trophyBg[place]} flex items-center justify-center rounded-2xl`}
      >
        <Trophy className={`${place === 1 ? "h-7 w-7" : place === 2 ? "h-5 w-5" : "h-4 w-4"} text-white`} />
      </div>
      <div className={`rounded-2xl border bg-gradient-to-b ${podiumBg[place]} ${s.height} shadow-sm`}>
        <Avatar className={`${s.avatar} mx-auto mb-2 border-2 border-background bg-gradient-to-br from-primary to-primary/80 text-white shadow-md`}>
          {athlete.profilePhotoUrl && (
            <AvatarImage src={getProfilePhotoUrl(athlete.profilePhotoUrl)!} alt={athlete.displayName} className="object-cover" />
          )}
          <AvatarFallback className="bg-gradient-to-br from-primary to-primary/80 font-bold text-white">
            {getInitials(athlete.displayName)}
          </AvatarFallback>
        </Avatar>
        <div className={`${s.text} truncate px-1.5 font-semibold`}>
          {athlete.displayName}
        </div>
        <div className={`${s.elo} font-bold tabular-nums mt-0.5`}>
          {athlete.currentElo}
        </div>
      </div>
    </div>
  );
}

export function LeaderboardContent({
  athletes,
  gyms,
  challengedIds = [],
}: {
  athletes: RankedAthlete[];
  gyms: RankedGym[];
  challengedIds?: string[];
}) {
  const [isAthleteMode, setIsAthleteMode] = useState(true);
  const challengedSet = new Set(challengedIds);

  return (
    <div className="flex flex-col gap-6 animate-page-in">
      {/* Mode Toggle */}
      <div className="flex items-center justify-center gap-3">
        <span className={`text-sm font-medium transition-colors ${isAthleteMode ? "text-foreground" : "text-muted-foreground"}`}>
          Fighters
        </span>
        <Switch
          checked={!isAthleteMode}
          onCheckedChange={(checked) => setIsAthleteMode(!checked)}
        />
        <span className={`text-sm font-medium transition-colors ${!isAthleteMode ? "text-foreground" : "text-muted-foreground"}`}>
          Gyms
        </span>
      </div>

      {isAthleteMode ? (
        <>
          {/* Top 3 Podium */}
          {athletes.length >= 3 && (
            <div className="flex items-end justify-center gap-3">
              <PodiumSlot athlete={athletes[1]} place={2} />
              <PodiumSlot athlete={athletes[0]} place={1} />
              <PodiumSlot athlete={athletes[2]} place={3} />
            </div>
          )}

          {/* Full Rankings */}
          <div className="flex flex-col gap-2.5">
            {athletes.map((a) => (
              <AthleteCard
                key={a.id}
                id={a.id}
                rank={a.rank}
                displayName={a.displayName}
                currentElo={a.currentElo}
                wins={a.wins}
                losses={a.losses}
                gymName={a.gymName}
                profilePhotoUrl={a.profilePhotoUrl}
                isCurrentUser={a.isCurrentUser}
                hasPendingChallenge={challengedSet.has(a.id)}
              />
            ))}
          </div>

          {athletes.length === 0 && (
            <p className="text-center text-sm text-muted-foreground">
              No athletes found
            </p>
          )}
        </>
      ) : (
        <>
          {/* Gym Rankings */}
          <div className="flex flex-col gap-2.5">
            {gyms.map((gym) => (
              <Card key={gym.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3.5">
                    <div className="flex w-8 justify-center">
                      {getRankIcon(gym.rank)}
                    </div>
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-border bg-gradient-to-br from-primary to-primary/80">
                      <Users className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <div className="font-semibold text-[15px]">{gym.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {gym.memberCount} {gym.memberCount === 1 ? "athlete" : "athletes"} · Avg: <span className="tabular-nums">{gym.averageElo}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold tabular-nums">{gym.totalElo}</div>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {gyms.length === 0 && (
            <p className="text-center text-sm text-muted-foreground">
              No gyms found
            </p>
          )}
        </>
      )}

      <p className="text-center text-xs text-muted-foreground pb-2">
        {isAthleteMode
          ? "Rankings based on current ELO"
          : "Gym rankings based on total member ELO"}
      </p>
    </div>
  );
}

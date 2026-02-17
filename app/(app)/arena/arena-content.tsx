"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Swords, Circle, Activity, Clock } from "lucide-react";
import { getInitials, getProfilePhotoUrl } from "@/lib/utils";
import { ChallengeBadge } from "@/components/domain/challenge-badge";
import { OnlineIndicator } from "@/components/domain/online-indicator";
import { LobbyActiveIndicator } from "@/components/domain/lobby-active-indicator";
import { useLobbyIds } from "@/hooks/use-lobby-presence";
import { LookingForMatchToggle } from "./looking-for-match-toggle";

interface Competitor {
  id: string;
  displayName: string;
  currentElo: number;
  gymName?: string;
  weight?: number;
  profilePhotoUrl?: string;
  eloDiff: number;
  lookingForCasual: boolean;
  lookingForRanked: boolean;
}

interface ActivityItem {
  id: string;
  winnerName: string;
  loserName: string;
  result: string;
  date: string;
}

function timeAgo(dateStr: string) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function CompetitorCard({ competitor, hasPendingChallenge }: { competitor: Competitor; hasPendingChallenge?: boolean }) {
  return (
    <Link href={`/athlete/${competitor.id}`}>
      <Card variant="interactive" className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <OnlineIndicator athleteId={competitor.id}>
              <Avatar className="h-12 w-12 border-2 border-accent/20 bg-gradient-to-br from-primary to-primary/80 text-white">
                {competitor.profilePhotoUrl && (
                  <AvatarImage src={getProfilePhotoUrl(competitor.profilePhotoUrl)!} alt={competitor.displayName} className="object-cover" />
                )}
                <AvatarFallback className="bg-gradient-to-br from-primary to-primary/80 font-bold text-white">
                  {getInitials(competitor.displayName)}
                </AvatarFallback>
              </Avatar>
            </OnlineIndicator>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-semibold">{competitor.displayName}</h4>
                {hasPendingChallenge && <ChallengeBadge />}
              </div>
              <div className="text-sm text-muted-foreground">
                ELO: {competitor.currentElo}
                {competitor.eloDiff !== 0 && (
                  <span className={competitor.eloDiff > 0 ? "text-red-500" : "text-green-500"}>
                    {" "}({competitor.eloDiff > 0 ? "+" : ""}{competitor.eloDiff})
                  </span>
                )}
              </div>
              {(competitor.gymName || competitor.weight) && (
                <div className="text-xs text-muted-foreground">
                  {[competitor.gymName, competitor.weight ? `${competitor.weight} lbs` : null].filter(Boolean).join(" · ")}
                </div>
              )}
              {(competitor.lookingForCasual || competitor.lookingForRanked) && (
                <div className="flex gap-1 mt-1">
                  {competitor.lookingForCasual && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Casual</Badge>}
                  {competitor.lookingForRanked && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Ranked</Badge>}
                </div>
              )}
              <LobbyActiveIndicator athleteId={competitor.id} />
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}

export function ArenaContent({
  lookingCompetitors,
  activityItems,
  currentAthleteId,
  currentAthleteCasual,
  currentAthleteRanked,
  challengedIds = [],
}: {
  lookingCompetitors: Competitor[];
  activityItems: ActivityItem[];
  currentAthleteId: string;
  currentAthleteCasual: boolean;
  currentAthleteRanked: boolean;
  challengedIds?: string[];
}) {
  const challengedSet = new Set(challengedIds);
  const lobbyIds = useLobbyIds();

  const readyToFight = lookingCompetitors.filter((c) => lobbyIds.has(c.id));
  const lookingOffline = lookingCompetitors.filter((c) => !lobbyIds.has(c.id));

  return (
    <div className="flex flex-col gap-6 animate-page-in">
      <LookingForMatchToggle
        athleteId={currentAthleteId}
        initialCasual={currentAthleteCasual}
        initialRanked={currentAthleteRanked}
      />

      {/* Athletes in lobby — online and looking */}
      {readyToFight.length > 0 && (
        <section className="flex flex-col gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Swords className="h-4 w-4 text-green-500" />
              <h2 className="text-lg font-semibold">Ready to Fight</h2>
              <Badge variant="success" className="text-xs">
                {readyToFight.length}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 ml-6">Online athletes looking for a match</p>
          </div>
          <div className="flex flex-col gap-2">
            {readyToFight.map((c) => (
              <CompetitorCard key={c.id} competitor={c} hasPendingChallenge={challengedSet.has(c.id)} />
            ))}
          </div>
        </section>
      )}

      {/* Athletes looking but not currently online */}
      {lookingOffline.length > 0 && (
        <section className="flex flex-col gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Circle className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Looking for Match</h2>
              <Badge variant="secondary" className="text-xs">
                {lookingOffline.length}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 ml-6">Athletes open to challenges but currently offline</p>
          </div>
          <div className="flex flex-col gap-2">
            {lookingOffline.map((c) => (
              <CompetitorCard key={c.id} competitor={c} hasPendingChallenge={challengedSet.has(c.id)} />
            ))}
          </div>
        </section>
      )}

      {readyToFight.length === 0 && lookingOffline.length === 0 && (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-sm text-muted-foreground">No one is looking for a match right now</p>
        </div>
      )}

      {/* Recent Activity Feed */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Recent Activity</h2>
        </div>

        {activityItems.length > 0 ? (
          <Card className="divide-y">
            {activityItems.map((item) => (
              <div key={item.id} className="flex items-start gap-3 p-4">
                <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                  <Swords className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-sm">
                    <span className="font-medium">{item.winnerName}</span>{" "}
                    defeated{" "}
                    <span className="font-medium">{item.loserName}</span>{" "}
                    by <span className="font-medium text-green-600">{item.result}</span>
                  </p>
                  {item.date && (
                    <div className="mt-1 flex items-center text-xs text-muted-foreground">
                      <Clock className="mr-1 h-3 w-3" />
                      {timeAgo(item.date)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </Card>
        ) : (
          <p className="text-sm text-muted-foreground">
            No recent activity
          </p>
        )}
      </section>
    </div>
  );
}

"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Swords, Circle } from "lucide-react";
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

function CompetitorCard({ competitor, hasPendingChallenge }: { competitor: Competitor; hasPendingChallenge?: boolean }) {
  return (
    <Link href={`/athlete/${competitor.id}`}>
      <Card variant="interactive" className="p-4 active:scale-[0.98] active:opacity-90">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <OnlineIndicator athleteId={competitor.id}>
              <Avatar className="h-12 w-12 border-2 border-border bg-gradient-to-br from-primary to-primary/80 text-white">
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
                <h4 className="font-semibold text-[15px]">{competitor.displayName}</h4>
                {hasPendingChallenge && <ChallengeBadge />}
              </div>
              <div className="text-sm text-muted-foreground">
                ELO: <span className="font-medium tabular-nums">{competitor.currentElo}</span>
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
                  {competitor.lookingForCasual && <Badge variant="secondary" className="text-[10px] px-1.5 py-0 rounded-full">Casual</Badge>}
                  {competitor.lookingForRanked && <Badge variant="secondary" className="text-[10px] px-1.5 py-0 rounded-full">Ranked</Badge>}
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
  currentAthleteId,
  currentAthleteCasual,
  currentAthleteRanked,
  challengedIds = [],
}: {
  lookingCompetitors: Competitor[];
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
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-green-500/10">
                <Swords className="h-4 w-4 text-green-500" />
              </div>
              <h2 className="text-lg font-semibold">Ready to Fight</h2>
              <Badge variant="success" className="text-xs rounded-full">
                {readyToFight.length}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 ml-9">Online athletes looking for a match</p>
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
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted">
                <Circle className="h-4 w-4 text-muted-foreground" />
              </div>
              <h2 className="text-lg font-semibold">Looking for Match</h2>
              <Badge variant="secondary" className="text-xs rounded-full">
                {lookingOffline.length}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 ml-9">Athletes open to challenges but currently offline</p>
          </div>
          <div className="flex flex-col gap-2">
            {lookingOffline.map((c) => (
              <CompetitorCard key={c.id} competitor={c} hasPendingChallenge={challengedSet.has(c.id)} />
            ))}
          </div>
        </section>
      )}

      {readyToFight.length === 0 && lookingOffline.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">No one is looking for a match right now</p>
        </div>
      )}
    </div>
  );
}

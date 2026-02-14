"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Swords, Users, Activity, Clock } from "lucide-react";
import { getInitials } from "@/lib/utils";
import { LookingForMatchToggle } from "./looking-for-match-toggle";

interface Competitor {
  id: string;
  displayName: string;
  currentElo: number;
  gymName?: string;
  eloDiff: number;
  lookingForMatch: boolean;
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

function CompetitorCard({ competitor }: { competitor: Competitor }) {
  return (
    <Link href={`/athlete/${competitor.id}`}>
      <Card variant="interactive" className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12 border-2 border-accent/20 bg-gradient-to-br from-primary to-primary/80 text-white">
              <AvatarFallback className="bg-gradient-to-br from-primary to-primary/80 font-bold text-white">
                {getInitials(competitor.displayName)}
              </AvatarFallback>
            </Avatar>
            <div>
              <h4 className="font-semibold">{competitor.displayName}</h4>
              <div className="text-sm text-muted-foreground">
                ELO: {competitor.currentElo}
                {competitor.eloDiff !== 0 && (
                  <span className={competitor.eloDiff > 0 ? "text-red-500" : "text-green-500"}>
                    {" "}({competitor.eloDiff > 0 ? "+" : ""}{competitor.eloDiff})
                  </span>
                )}
              </div>
              {competitor.gymName && (
                <div className="text-xs text-muted-foreground">
                  {competitor.gymName}
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}

export function ArenaContent({
  competitors,
  activityItems,
  currentAthleteId,
  currentAthleteLooking,
}: {
  competitors: Competitor[];
  activityItems: ActivityItem[];
  currentAthleteId: string;
  currentAthleteLooking: boolean;
}) {
  const lookingCompetitors = competitors.filter((c) => c.lookingForMatch);
  const otherCompetitors = competitors.filter((c) => !c.lookingForMatch);

  return (
    <div className="flex flex-col gap-6">
      <LookingForMatchToggle
        athleteId={currentAthleteId}
        initialLooking={currentAthleteLooking}
      />

      {/* Athletes Looking for Match */}
      {lookingCompetitors.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Swords className="h-4 w-4 text-green-500" />
            <h2 className="text-lg font-semibold">Looking for Match</h2>
            <Badge variant="secondary" className="text-xs">
              {lookingCompetitors.length}
            </Badge>
          </div>
          <div className="flex flex-col gap-2">
            {lookingCompetitors.map((c) => (
              <CompetitorCard key={c.id} competitor={c} />
            ))}
          </div>
        </section>
      )}

      {/* All Competitors */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Competitors</h2>
        </div>

        {otherCompetitors.length > 0 ? (
          <div className="flex flex-col gap-2">
            {otherCompetitors.map((c) => (
              <CompetitorCard key={c.id} competitor={c} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No competitors found nearby
          </p>
        )}
      </section>

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

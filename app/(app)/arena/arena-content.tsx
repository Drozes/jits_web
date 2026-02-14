"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Swords, Users, Activity, Clock, CheckCircle2 } from "lucide-react";

interface Competitor {
  id: string;
  displayName: string;
  currentElo: number;
  gymName?: string;
  eloDiff: number;
}

interface ActivityItem {
  id: string;
  winnerName: string;
  loserName: string;
  result: string;
  date: string;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
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

export function ArenaContent({
  competitors,
  activityItems,
}: {
  competitors: Competitor[];
  activityItems: ActivityItem[];
}) {
  const [isLooking, setIsLooking] = useState(false);
  const [matchPrefs, setMatchPrefs] = useState<string[]>(["Casual"]);

  function togglePref(pref: string) {
    setMatchPrefs((prev) => {
      if (prev.includes(pref)) {
        return prev.length > 1 ? prev.filter((p) => p !== pref) : prev;
      }
      return [...prev, pref];
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Looking for Match Toggle */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-semibold uppercase tracking-wide">
              Looking for Match
            </h4>
            <p className="text-sm text-muted-foreground">
              Let others know you&apos;re ready to compete
            </p>
          </div>
          <Switch checked={isLooking} onCheckedChange={setIsLooking} />
        </div>

        {isLooking && (
          <div className="mt-3 border-t pt-3">
            <div className="mb-2 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-sm font-medium text-green-700">
                You&apos;re visible to potential opponents
              </span>
            </div>
            <div className="flex gap-2">
              <Badge
                variant={matchPrefs.includes("Casual") ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => togglePref("Casual")}
              >
                Casual
              </Badge>
              <Badge
                variant={matchPrefs.includes("Ranked") ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => togglePref("Ranked")}
              >
                Ranked
              </Badge>
            </div>
            <div className="mt-3 space-y-1 border-t pt-2 text-xs text-muted-foreground">
              <p><span className="font-medium">Casual:</span> Practice sessions · No ELO changes</p>
              <p><span className="font-medium">Ranked:</span> Competitive matches · ELO at stake</p>
            </div>
          </div>
        )}
      </Card>

      {/* Nearby Competitors */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Competitors</h2>
        </div>

        {competitors.length > 0 ? (
          <div className="flex flex-col gap-2">
            {competitors.map((c) => (
              <Card key={c.id} variant="interactive" className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Avatar className="h-12 w-12 border-2 border-accent/20 bg-gradient-to-br from-primary to-primary/80 text-white">
                        <AvatarFallback className="bg-gradient-to-br from-primary to-primary/80 font-bold text-white">
                          {getInitials(c.displayName)}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                    <div>
                      <h4 className="font-semibold">{c.displayName}</h4>
                      <div className="text-sm text-muted-foreground">
                        ELO: {c.currentElo}
                        {c.eloDiff !== 0 && (
                          <span className={c.eloDiff > 0 ? "text-red-500" : "text-green-500"}>
                            {" "}({c.eloDiff > 0 ? "+" : ""}{c.eloDiff})
                          </span>
                        )}
                      </div>
                      {c.gymName && (
                        <div className="text-xs text-muted-foreground">
                          {c.gymName}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
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

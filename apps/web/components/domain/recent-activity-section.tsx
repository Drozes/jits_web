"use client";

import { useState } from "react";
import Link from "next/link";
import { Activity, Swords } from "lucide-react";
import { Card } from "@/components/ui/card";
import { MatchCard } from "@/components/domain/match-card";
import { cn } from "@/lib/utils";
import { formatRelativeDate } from "@jits/shared/utils";
import type { MatchOutcome } from "@jits/shared/constants";

interface MyMatch {
  id: string;
  opponentName: string;
  result: MatchOutcome;
  matchType: "ranked" | "casual";
  eloDelta: number;
  date: string;
}

interface ActivityItem {
  id: string;
  winnerName: string;
  loserName: string;
  result: string;
  matchType: string;
  date: string;
}

type Scope = "me" | "all";

const scopeOptions: { value: Scope; label: string }[] = [
  { value: "all", label: "All" },
  { value: "me", label: "Me" },
];

function FilterPill<T extends string>({ value, label, active, onSelect }: { value: T; label: string; active: boolean; onSelect: (v: T) => void }) {
  return (
    <button
      onClick={() => onSelect(value)}
      className={cn(
        "rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-200",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "bg-muted/60 text-muted-foreground hover:bg-muted",
      )}
    >
      {label}
    </button>
  );
}

export function RecentActivitySection({ myMatches, allActivity }: { myMatches: MyMatch[]; allActivity: ActivityItem[] }) {
  const [scope, setScope] = useState<Scope>("all");

  const hasContent = scope === "me" ? myMatches.length > 0 : allActivity.length > 0;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <Activity className="h-4 w-4 text-primary" />
          </div>
          <h2 className="text-lg font-semibold">Recent Activity</h2>
        </div>
        {scope === "me" && myMatches.length > 0 && (
          <Link href="/profile/stats" className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
            View all
          </Link>
        )}
      </div>

      <div className="flex items-center gap-2.5">
        <div className="flex gap-1">
          {scopeOptions.map((o) => (
            <FilterPill key={o.value} value={o.value} label={o.label} active={scope === o.value} onSelect={setScope} />
          ))}
        </div>
      </div>

      {scope === "me" ? (
        hasContent ? (
          <div className="flex flex-col gap-2">
            {myMatches.map((m) => (
              <MatchCard key={m.id} type="match" opponentName={m.opponentName} result={m.result} eloDelta={m.eloDelta} date={m.date} />
            ))}
          </div>
        ) : (
          <EmptyState message="No matches yet" hint="Join a session at a nearby gym to start competing." showLink />
        )
      ) : hasContent ? (
        <Card className="divide-y divide-border">
          {allActivity.map((item) => (
            <ActivityFeedItem key={item.id} item={item} />
          ))}
        </Card>
      ) : (
        <EmptyState message="No recent activity" hint="Matches from all athletes at your gym will appear here." />
      )}
    </section>
  );
}

function ActivityFeedItem({ item }: { item: ActivityItem }) {
  const isDraw = item.result === "draw";
  return (
    <div className="flex items-start gap-3 p-4">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10">
        <Swords className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1">
        <p className="text-sm">
          <span className="font-medium">{item.winnerName}</span>{" "}
          {isDraw ? "drew with" : "defeated"}{" "}
          <span className="font-medium">{item.loserName}</span>
          {!isDraw && <> by <span className="font-medium text-green-600">{item.result}</span></>}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatRelativeDate(item.date)}
        </p>
      </div>
    </div>
  );
}

function EmptyState({ message, hint, showLink }: { message: string; hint?: string; showLink?: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-border p-8 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
      {hint && <p className="text-xs text-muted-foreground/70 mt-1">{hint}</p>}
      {showLink && (
        <Link href="/gyms" className="text-xs font-medium text-primary hover:underline mt-2 inline-block">
          Find a session
        </Link>
      )}
    </div>
  );
}

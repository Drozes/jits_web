"use client";

import { useState } from "react";
import Link from "next/link";
import { Activity, Swords } from "lucide-react";
import { Card } from "@/components/ui/card";
import { MatchCard } from "@/components/domain/match-card";
import { cn, formatRelativeDate } from "@/lib/utils";
import type { MatchOutcome } from "@/lib/constants";

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
type TypeFilter = "all" | "ranked" | "casual";

const scopeOptions: { value: Scope; label: string }[] = [
  { value: "me", label: "Me" },
  { value: "all", label: "All" },
];

const typeOptions: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "ranked", label: "Ranked" },
  { value: "casual", label: "Casual" },
];

function FilterPill<T extends string>({ value, label, active, onSelect }: { value: T; label: string; active: boolean; onSelect: (v: T) => void }) {
  return (
    <button
      onClick={() => onSelect(value)}
      className={cn(
        "rounded-full px-3 py-1 text-xs font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80",
      )}
    >
      {label}
    </button>
  );
}

export function RecentActivitySection({ myMatches, allActivity }: { myMatches: MyMatch[]; allActivity: ActivityItem[] }) {
  const [scope, setScope] = useState<Scope>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  const filteredMatches = typeFilter === "all" ? myMatches : myMatches.filter((m) => m.matchType === typeFilter);
  const filteredActivity = typeFilter === "all" ? allActivity : allActivity.filter((a) => a.matchType === typeFilter);

  const hasContent = scope === "me" ? filteredMatches.length > 0 : filteredActivity.length > 0;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Recent Activity</h2>
        </div>
        {scope === "me" && myMatches.length > 0 && (
          <Link href="/profile/stats" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            View all
          </Link>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex gap-1">
          {scopeOptions.map((o) => (
            <FilterPill key={o.value} value={o.value} label={o.label} active={scope === o.value} onSelect={setScope} />
          ))}
        </div>
        <div className="h-4 w-px bg-border" />
        <div className="flex gap-1">
          {typeOptions.map((o) => (
            <FilterPill key={o.value} value={o.value} label={o.label} active={typeFilter === o.value} onSelect={setTypeFilter} />
          ))}
        </div>
      </div>

      {scope === "me" ? (
        hasContent ? (
          <div className="flex flex-col gap-2">
            {filteredMatches.map((m) => (
              <MatchCard key={m.id} type="match" opponentName={m.opponentName} result={m.result} matchType={m.matchType} eloDelta={m.eloDelta} date={m.date} href={`/match/${m.id}/results`} />
            ))}
          </div>
        ) : (
          <EmptyState message={typeFilter === "all" ? "No matches yet" : `No ${typeFilter} matches yet`} showLink />
        )
      ) : hasContent ? (
        <Card className="divide-y">
          {filteredActivity.map((item) => (
            <ActivityFeedItem key={item.id} item={item} />
          ))}
        </Card>
      ) : (
        <EmptyState message={typeFilter === "all" ? "No recent activity" : `No recent ${typeFilter} activity`} />
      )}
    </section>
  );
}

function ActivityFeedItem({ item }: { item: ActivityItem }) {
  const isDraw = item.result === "draw";
  return (
    <div className="flex items-start gap-3 p-4">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
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
          {item.matchType && <> · {item.matchType === "ranked" ? "Ranked" : "Casual"}</>}
        </p>
      </div>
    </div>
  );
}

function EmptyState({ message, showLink }: { message: string; showLink?: boolean }) {
  return (
    <div className="rounded-lg border border-dashed p-6 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
      {showLink && (
        <Link href="/arena" className="text-xs text-primary hover:underline mt-1.5 inline-block">
          Head to the Arena
        </Link>
      )}
    </div>
  );
}

import { Suspense } from "react";
import Link from "next/link";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { StatOverview } from "@/components/domain/stat-overview";
import { RecentActivitySection } from "@/components/domain/recent-activity-section";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeaderActions } from "@/components/layout/page-header-actions";
import { getDashboardSummary } from "@/lib/api/queries";
import { ChevronRight, Radio, MapPin } from "lucide-react";

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="h-10 w-48 bg-muted rounded-xl" />
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[88px] bg-muted rounded-2xl" />
        ))}
      </div>
      <div className="flex flex-col gap-3">
        <div className="h-5 w-28 bg-muted rounded" />
        <div className="h-[52px] bg-muted rounded-2xl" />
        <div className="h-[52px] bg-muted rounded-2xl" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <>
      <AppHeader title="Jits Arena" rightAction={<PageHeaderActions />} />
      <PageContainer className="pt-6">
        <Suspense fallback={<DashboardSkeleton />}>
          <DashboardContent />
        </Suspense>
      </PageContainer>
    </>
  );
}

async function DashboardContent() {
  const { athlete } = await requireAthlete();
  const supabase = await createClient();

  // Single RPC call for all dashboard data
  const summary = await getDashboardSummary(supabase);

  const recentMatches = summary.recent_matches.map((m) => ({
    id: m.match_id,
    opponentName: m.opponent_name,
    result: m.outcome,
    matchType: m.match_type as "ranked" | "casual",
    eloDelta: m.elo_delta,
    date: m.completed_at,
  }));

  const recentActivity = summary.recent_activity.map((a) => ({
    id: a.match_id,
    winnerName: a.winner_name,
    loserName: a.loser_name,
    result: a.result,
    matchType: a.match_type,
    date: a.completed_at,
  }));

  return (
    <div className="flex flex-col gap-6 animate-page-in">
      {/* Hero greeting */}
      <div className="rounded-2xl -mx-4 px-4 pt-2 pb-4">
        <h1 className="text-2xl font-bold tracking-tight">
          Hey, <span className="text-gradient-primary">{athlete.display_name}</span>
        </h1>
        <HeroSubtitle
          lookingForCasual={athlete.looking_for_casual}
          lookingForRanked={athlete.looking_for_ranked}
        />
      </div>

      <StatOverview
        athlete={athlete}
        stats={{
          wins: summary.stats.wins,
          losses: summary.stats.losses,
          draws: summary.stats.draws,
          winStreak: summary.stats.win_streak,
          rank: summary.rank.current,
          bestRank: summary.rank.best,
          bestWinStreak: summary.stats.best_win_streak,
        }}
      />

      <RecentActivitySection myMatches={recentMatches} allActivity={recentActivity} />
    </div>
  );
}

function HeroSubtitle({ lookingForCasual, lookingForRanked }: { lookingForCasual: boolean; lookingForRanked: boolean }) {
  const isLooking = lookingForCasual || lookingForRanked;

  if (isLooking) {
    const label = lookingForCasual && lookingForRanked
      ? "Ranked & Casual matches"
      : lookingForRanked ? "Ranked matches" : "Casual matches";
    return (
      <div className="flex items-center gap-2 mt-1">
        <Radio className="h-3.5 w-3.5 text-green-500 animate-pulse" />
        <p className="text-sm font-medium text-green-600 dark:text-green-400">
          Looking for {label}
        </p>
      </div>
    );
  }

  return (
    <Link
      href="/gyms"
      className="mt-2 flex items-center justify-between rounded-xl bg-primary/10 px-3.5 py-2.5 group w-full transition-colors hover:bg-primary/15 active:scale-[0.98]"
    >
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Find a session</span>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
    </Link>
  );
}

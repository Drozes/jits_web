import { Suspense } from "react";
import Link from "next/link";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { StatOverview } from "@/components/domain/stat-overview";
import { MatchCard } from "@/components/domain/match-card";
import { RecentActivitySection } from "@/components/domain/recent-activity-section";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeaderActions } from "@/components/layout/page-header-actions";
import { getDashboardSummary } from "@/lib/api/queries";
import { Zap, ChevronRight, Radio, Swords } from "lucide-react";

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

  // Map accepted challenges (opponent already resolved by RPC)
  const acceptedChallenges = summary.accepted_challenges.map((c) => ({
    id: c.id,
    created_at: c.created_at,
    status: "accepted" as const,
    matchType: c.match_type as "ranked" | "casual",
    opponentName: c.opponent_name,
    opponentPhotoUrl: c.opponent_photo_url,
    href: `/match/lobby/${c.id}`,
  }));

  // Map pending challenges (photos now included in RPC)
  const pendingChallenges = [
    ...summary.pending_challenges.incoming.map((c) => ({
      id: c.id,
      created_at: c.created_at,
      status: "pending" as const,
      direction: "incoming" as const,
      matchType: c.match_type as "ranked" | "casual",
      opponentName: c.challenger_name,
      opponentPhotoUrl: c.challenger_photo_url,
      href: `/match/lobby/${c.id}`,
    })),
    ...summary.pending_challenges.sent.map((c) => ({
      id: c.id,
      created_at: c.created_at,
      status: "pending" as const,
      direction: "sent" as const,
      matchType: c.match_type as "ranked" | "casual",
      opponentName: c.opponent_name,
      opponentPhotoUrl: c.opponent_photo_url,
      href: `/match/lobby/${c.id}`,
    })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const allChallenges = [...acceptedChallenges, ...pendingChallenges];

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

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-yellow-500/10">
              <Zap className="h-4 w-4 text-yellow-500" />
            </div>
            <h2 className="text-lg font-semibold">Challenges</h2>
          </div>
          {allChallenges.length > 0 && (
            <Link href="/match/pending" className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
              View all
            </Link>
          )}
        </div>
        {allChallenges.length > 0 ? (
          <div className="flex flex-col gap-2">
            {allChallenges.map((c) => (
              <MatchCard
                key={c.id}
                type="challenge"
                opponentName={c.opponentName}
                opponentPhotoUrl={c.opponentPhotoUrl}
                direction={"direction" in c ? c.direction : undefined}
                status={c.status === "accepted" ? "Accepted" : undefined}
                matchType={c.matchType}
                date={c.created_at}
                href={c.href}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">No active challenges</p>
            <Link href="/arena" className="text-xs font-medium text-primary hover:underline mt-2 inline-block">
              Find an opponent
            </Link>
          </div>
        )}
      </section>

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
      href="/arena"
      className="mt-2 flex items-center justify-between rounded-xl bg-primary/10 px-3.5 py-2.5 group w-full transition-colors hover:bg-primary/15 active:scale-[0.98]"
    >
      <div className="flex items-center gap-2">
        <Swords className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Start looking for matches</span>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
    </Link>
  );
}

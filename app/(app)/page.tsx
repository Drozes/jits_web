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
import { getDashboardSummary, getRecentActivity } from "@/lib/api/queries";
import { Zap } from "lucide-react";

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

  const [summary, { data: acceptedRows }, activityItems] = await Promise.all([
    getDashboardSummary(supabase),
    supabase
      .from("challenges")
      .select(
        "id, created_at, match_type, challenger_id, challenger:athletes!fk_challenges_challenger(display_name, profile_photo_url), opponent:athletes!fk_challenges_opponent(display_name, profile_photo_url)",
      )
      .or(`challenger_id.eq.${athlete.id},opponent_id.eq.${athlete.id}`)
      .eq("status", "accepted")
      .order("created_at", { ascending: false }),
    getRecentActivity(supabase, 10),
  ]);

  // Map accepted challenges
  const acceptedChallenges = (acceptedRows ?? []).map((c) => {
    const isChallenger = c.challenger_id === athlete.id;
    const challenger = c.challenger as unknown as { display_name: string; profile_photo_url: string | null } | null;
    const opponent = c.opponent as unknown as { display_name: string; profile_photo_url: string | null } | null;
    return {
      id: c.id,
      created_at: c.created_at,
      status: "accepted" as const,
      matchType: c.match_type as "ranked" | "casual",
      opponentName: isChallenger
        ? (opponent?.display_name ?? "Unknown")
        : (challenger?.display_name ?? "Unknown"),
      opponentPhotoUrl: isChallenger
        ? (opponent?.profile_photo_url ?? null)
        : (challenger?.profile_photo_url ?? null),
      href: `/match/lobby/${c.id}`,
    };
  });

  // Batch query photos for pending challenge opponents
  const pendingAthleteIds = [
    ...summary.pending_challenges.incoming.map((c) => c.challenger_id),
    ...summary.pending_challenges.sent.map((c) => c.opponent_id),
  ];
  const photoMap = new Map<string, string | null>();
  if (pendingAthleteIds.length > 0) {
    const { data: photoRows } = await supabase
      .from("athletes")
      .select("id, profile_photo_url")
      .in("id", pendingAthleteIds);
    for (const row of photoRows ?? []) {
      photoMap.set(row.id, row.profile_photo_url);
    }
  }

  // Merge accepted + incoming + sent challenges; accepted first, then by date
  const pendingChallenges = [
    ...summary.pending_challenges.incoming.map((c) => ({
      id: c.id,
      created_at: c.created_at,
      status: "pending" as const,
      direction: "incoming" as const,
      matchType: c.match_type as "ranked" | "casual",
      opponentName: c.challenger_name,
      opponentPhotoUrl: photoMap.get(c.challenger_id) ?? null,
      href: `/match/lobby/${c.id}`,
    })),
    ...summary.pending_challenges.sent.map((c) => ({
      id: c.id,
      created_at: c.created_at,
      status: "pending" as const,
      direction: "sent" as const,
      matchType: c.match_type as "ranked" | "casual",
      opponentName: c.opponent_name,
      opponentPhotoUrl: photoMap.get(c.opponent_id) ?? null,
      href: `/match/lobby/${c.id}`,
    })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Accepted challenges always on top
  const allChallenges = [...acceptedChallenges, ...pendingChallenges];

  const recentMatches = summary.recent_matches.map((m) => ({
    id: m.match_id,
    opponentName: m.opponent_name,
    result: m.outcome,
    matchType: m.match_type as "ranked" | "casual",
    eloDelta: m.elo_delta,
    date: m.completed_at,
  }));

  const recentActivity = activityItems.map((a) => ({
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
      <div className="bg-gradient-hero rounded-2xl -mx-4 px-4 pt-2 pb-4">
        <h1 className="text-2xl font-bold tracking-tight">
          Hey, <span className="text-gradient-primary">{athlete.display_name}</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Ready to compete?</p>
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

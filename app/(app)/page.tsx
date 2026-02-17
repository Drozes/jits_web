import { Suspense } from "react";
import Link from "next/link";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { StatOverview } from "@/components/domain/stat-overview";
import { MatchCard } from "@/components/domain/match-card";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeaderActions } from "@/components/layout/page-header-actions";
import { getDashboardSummary } from "@/lib/api/queries";
import { Swords, Zap } from "lucide-react";

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="h-8 w-40 bg-muted rounded" />
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[88px] bg-muted rounded-xl" />
        ))}
      </div>
      <div className="flex flex-col gap-3">
        <div className="h-5 w-28 bg-muted rounded" />
        <div className="h-[52px] bg-muted rounded-xl" />
        <div className="h-[52px] bg-muted rounded-xl" />
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

  const [summary, { data: acceptedRows }] = await Promise.all([
    getDashboardSummary(supabase),
    supabase
      .from("challenges")
      .select(
        "id, created_at, match_type, challenger_id, challenger:athletes!fk_challenges_challenger(display_name), opponent:athletes!fk_challenges_opponent(display_name)",
      )
      .or(`challenger_id.eq.${athlete.id},opponent_id.eq.${athlete.id}`)
      .eq("status", "accepted")
      .order("created_at", { ascending: false }),
  ]);

  // Map accepted challenges
  const acceptedChallenges = (acceptedRows ?? []).map((c) => {
    const isChallenger = c.challenger_id === athlete.id;
    const challenger = c.challenger as unknown as { display_name: string } | null;
    const opponent = c.opponent as unknown as { display_name: string } | null;
    return {
      id: c.id,
      created_at: c.created_at,
      status: "accepted" as const,
      matchType: c.match_type as "ranked" | "casual",
      opponentName: isChallenger
        ? (opponent?.display_name ?? "Unknown")
        : (challenger?.display_name ?? "Unknown"),
      href: `/match/lobby/${c.id}`,
    };
  });

  // Merge accepted + incoming + sent challenges; accepted first, then by date
  const pendingChallenges = [
    ...summary.pending_challenges.incoming.map((c) => ({
      id: c.id,
      created_at: c.created_at,
      status: "pending" as const,
      direction: "incoming" as const,
      matchType: c.match_type as "ranked" | "casual",
      opponentName: c.challenger_name,
      href: `/match/lobby/${c.id}`,
    })),
    ...summary.pending_challenges.sent.map((c) => ({
      id: c.id,
      created_at: c.created_at,
      status: "pending" as const,
      direction: "sent" as const,
      matchType: c.match_type as "ranked" | "casual",
      opponentName: c.opponent_name,
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

  return (
    <div className="flex flex-col gap-6 animate-page-in">
      <h1 className="text-2xl font-bold">
        Hey, {athlete.display_name}
      </h1>

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
            <Zap className="h-5 w-5 text-yellow-500" />
            <h2 className="text-lg font-semibold">Challenges</h2>
          </div>
          {allChallenges.length > 0 && (
            <Link href="/match/pending" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
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
                direction={"direction" in c ? c.direction : undefined}
                status={c.status === "accepted" ? "Accepted" : undefined}
                matchType={c.matchType}
                date={c.created_at}
                href={c.href}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">No active challenges</p>
            <Link href="/arena" className="text-xs text-primary hover:underline mt-1.5 inline-block">
              Find an opponent
            </Link>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Swords className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Recent Matches</h2>
          </div>
          {recentMatches.length > 0 && (
            <Link href="/profile/stats" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              View all
            </Link>
          )}
        </div>
        {recentMatches.length > 0 ? (
          <div className="flex flex-col gap-2">
            {recentMatches.map((match) => (
              <MatchCard
                key={match.id}
                type="match"
                opponentName={match.opponentName}
                result={match.result}
                matchType={match.matchType}
                eloDelta={match.eloDelta}
                date={match.date}
                href={`/match/${match.id}/results`}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">No matches yet</p>
            <Link href="/arena" className="text-xs text-primary hover:underline mt-1.5 inline-block">
              Head to the Arena
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}

import { Suspense } from "react";
import Link from "next/link";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { StatOverview } from "@/components/domain/stat-overview";
import { MatchCard } from "@/components/domain/match-card";
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
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  );
}

async function DashboardContent() {
  const { athlete } = await requireAthlete();
  const supabase = await createClient();

  const summary = await getDashboardSummary(supabase);

  // Merge incoming + sent challenges, sorted newest first
  const allChallenges = [
    ...summary.pending_challenges.incoming.map((c) => ({
      id: c.id,
      created_at: c.created_at,
      direction: "incoming" as const,
      matchType: c.match_type as "ranked" | "casual",
      opponentName: c.challenger_name,
      opponentId: c.challenger_id,
    })),
    ...summary.pending_challenges.sent.map((c) => ({
      id: c.id,
      created_at: c.created_at,
      direction: "sent" as const,
      matchType: c.match_type as "ranked" | "casual",
      opponentName: c.opponent_name,
      opponentId: c.opponent_id,
    })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

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
                direction={c.direction}
                matchType={c.matchType}
                date={c.created_at}
                href={c.opponentId ? `/athlete/${c.opponentId}` : undefined}
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

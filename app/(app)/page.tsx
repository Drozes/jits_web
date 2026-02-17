import { Suspense } from "react";
import Link from "next/link";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { StatOverview } from "@/components/domain/stat-overview";
import { MatchCard } from "@/components/domain/match-card";
import { getMatchHistory, getAthleteRank } from "@/lib/api/queries";
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

  const [
    matchHistory,
    rank,
    bestRank,
    { data: pendingIncoming },
    { data: pendingSent },
  ] = await Promise.all([
    getMatchHistory(supabase, athlete.id),
    getAthleteRank(supabase, athlete.current_elo),
    getAthleteRank(supabase, athlete.highest_elo),
    supabase
      .from("challenges")
      .select("id, created_at, status, challenger:athletes!fk_challenges_challenger(id, display_name)")
      .eq("opponent_id", athlete.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("challenges")
      .select("id, created_at, status, opponent:athletes!fk_challenges_opponent(id, display_name)")
      .eq("challenger_id", athlete.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  // Compute stats from match history
  const wins = matchHistory.filter((m) => m.athlete_outcome === "win").length;
  const losses = matchHistory.filter((m) => m.athlete_outcome === "loss").length;
  const draws = matchHistory.filter((m) => m.athlete_outcome === "draw").length;

  let winStreak = 0;
  for (const m of matchHistory) {
    if (m.athlete_outcome === "win") winStreak++;
    else break;
  }

  let bestWinStreak = 0;
  let currentRun = 0;
  for (const m of matchHistory) {
    if (m.athlete_outcome === "win") {
      currentRun++;
      if (currentRun > bestWinStreak) bestWinStreak = currentRun;
    } else {
      currentRun = 0;
    }
  }

  // Merge incoming + sent challenges, sorted newest first
  const allChallenges = [
    ...(pendingIncoming ?? []).map((c) => {
      const challenger = c.challenger as unknown as { id: string; display_name: string } | null;
      return {
        id: c.id,
        created_at: c.created_at,
        direction: "incoming" as const,
        opponentName: challenger?.display_name ?? "Unknown",
        opponentId: challenger?.id,
      };
    }),
    ...(pendingSent ?? []).map((c) => {
      const opponent = c.opponent as unknown as { id: string; display_name: string } | null;
      return {
        id: c.id,
        created_at: c.created_at,
        direction: "sent" as const,
        opponentName: opponent?.display_name ?? "Unknown",
        opponentId: opponent?.id,
      };
    }),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const recentMatches = matchHistory.slice(0, 5).map((m) => ({
    id: m.match_id,
    opponentName: m.opponent_display_name,
    result: m.athlete_outcome as "win" | "loss" | "draw",
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
        stats={{ wins, losses, draws, winStreak, rank, bestRank, bestWinStreak }}
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

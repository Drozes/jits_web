import { Suspense } from "react";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { StatOverview } from "@/components/domain/stat-overview";
import { MatchCard } from "@/components/domain/match-card";
import { Send, Swords, Zap } from "lucide-react";

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div><div className="h-7 w-48 bg-muted rounded" /><div className="h-4 w-32 bg-muted rounded mt-2" /></div>
      <div className="h-32 bg-muted rounded-lg" />
      <div className="h-48 bg-muted rounded-lg" />
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

  // Fire all independent queries in parallel
  const [
    { data: recentOutcomes },
    { data: recentMatches },
    { data: pendingChallenges },
    { data: sentChallenges },
  ] = await Promise.all([
    // Win/loss stats + win streak (single query, ordered for streak calc)
    supabase
      .from("match_participants")
      .select("outcome")
      .eq("athlete_id", athlete.id)
      .not("outcome", "is", null)
      .order("match_id", { ascending: false })
      .limit(50),
    // Recent matches (last 5)
    supabase
      .from("match_participants")
      .select(
        `outcome, elo_delta, match_id,
        matches(id, created_at, status),
        athletes!fk_participants_athlete(display_name)`,
      )
      .eq("athlete_id", athlete.id)
      .not("outcome", "is", null)
      .order("match_id", { ascending: false })
      .limit(5),
    // Pending challenges (incoming)
    supabase
      .from("challenges")
      .select("id, created_at, status, challenger:athletes!fk_challenges_challenger(display_name)")
      .eq("opponent_id", athlete.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(5),
    // Sent challenges (outgoing)
    supabase
      .from("challenges")
      .select("id, created_at, status, opponent:athletes!fk_challenges_opponent(id, display_name)")
      .eq("challenger_id", athlete.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  // Compute stats from the single outcomes query
  const wins = recentOutcomes?.filter((o) => o.outcome === "win").length ?? 0;
  const losses = recentOutcomes?.filter((o) => o.outcome === "loss").length ?? 0;
  const total = wins + losses;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

  let winStreak = 0;
  if (recentOutcomes) {
    for (const entry of recentOutcomes) {
      if (entry.outcome === "win") winStreak++;
      else break;
    }
  }

  // Batch-fetch all opponent names in a single query (instead of N+1)
  const matchIds = (recentMatches ?? []).map((mp) => mp.match_id);
  const { data: allOpponents } = matchIds.length
    ? await supabase
        .from("match_participants")
        .select("match_id, athletes!fk_participants_athlete(display_name)")
        .in("match_id", matchIds)
        .neq("athlete_id", athlete.id)
        .eq("role", "competitor")
    : { data: [] as { match_id: string; athletes: unknown }[] };

  const opponentByMatch = new Map<string, string>();
  for (const opp of allOpponents ?? []) {
    const arr = opp.athletes as { display_name: string }[] | null;
    opponentByMatch.set(opp.match_id, arr?.[0]?.display_name ?? "Unknown");
  }

  const matchesWithOpponents = (recentMatches ?? []).map((mp) => {
    const matchArr = mp.matches as
      | { id: string; created_at: string; status: string }[]
      | null;
    return {
      id: mp.match_id,
      opponentName: opponentByMatch.get(mp.match_id) ?? "Unknown",
      result: mp.outcome as "win" | "loss" | "draw",
      eloDelta: mp.elo_delta,
      date: matchArr?.[0]?.created_at ?? "",
    };
  });

  return (
    <div className="flex flex-col gap-6 animate-page-in">
      <div>
        <h1 className="text-2xl font-bold">
          Hey, {athlete.display_name}
        </h1>
        <p className="text-sm text-muted-foreground">
          Here&apos;s your overview
        </p>
      </div>

      <StatOverview
        athlete={athlete}
        stats={{ wins, losses, winRate, winStreak }}
      />

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-yellow-500" />
          <h2 className="text-lg font-semibold">Incoming Challenges</h2>
        </div>
        {pendingChallenges && pendingChallenges.length > 0 ? (
          <div className="flex flex-col gap-2">
            {pendingChallenges.map((challenge) => {
              const challengerArr = challenge.challenger as
                | { display_name: string }[]
                | null;
              const challenger = challengerArr?.[0] ?? null;
              return (
                <MatchCard
                  key={challenge.id}
                  type="challenge"
                  opponentName={challenger?.display_name ?? "Unknown"}
                  status="Pending"
                  date={challenge.created_at}
                />
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
            <p className="text-sm">No pending challenges</p>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Send className="h-5 w-5 text-blue-500" />
          <h2 className="text-lg font-semibold">Sent Challenges</h2>
        </div>
        {sentChallenges && sentChallenges.length > 0 ? (
          <div className="flex flex-col gap-2">
            {sentChallenges.map((challenge) => {
              const opponent = challenge.opponent as unknown as
                | { id: string; display_name: string }
                | null;
              return (
                <MatchCard
                  key={challenge.id}
                  type="challenge"
                  opponentName={opponent?.display_name ?? "Unknown"}
                  status="Pending"
                  date={challenge.created_at}
                  href={opponent?.id ? `/athlete/${opponent.id}` : undefined}
                />
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
            <p className="text-sm">No sent challenges</p>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Swords className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Recent Matches</h2>
        </div>
        {matchesWithOpponents.length > 0 ? (
          <div className="flex flex-col gap-2">
            {matchesWithOpponents.map((match) => (
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
          <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
            <p className="text-sm">No matches yet — find an opponent in the Arena!</p>
          </div>
        )}
      </section>
    </div>
  );
}

import { Suspense } from "react";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { StatOverview } from "@/components/domain/stat-overview";
import { MatchCard } from "@/components/domain/match-card";
import { Swords, Zap } from "lucide-react";

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div>
        <div className="h-8 w-48 rounded bg-muted" />
        <div className="mt-2 h-4 w-36 rounded bg-muted" />
      </div>
      <div className="h-36 rounded-lg bg-muted" />
      <div className="flex flex-col gap-3">
        <div className="h-6 w-48 rounded bg-muted" />
        <div className="h-16 rounded-lg bg-muted" />
        <div className="h-16 rounded-lg bg-muted" />
      </div>
      <div className="flex flex-col gap-3">
        <div className="h-6 w-40 rounded bg-muted" />
        <div className="h-16 rounded-lg bg-muted" />
        <div className="h-16 rounded-lg bg-muted" />
        <div className="h-16 rounded-lg bg-muted" />
      </div>
    </div>
  );
}

async function DashboardContent() {
  const { athlete } = await requireAthlete();
  const supabase = await createClient();

  // Fetch win/loss stats from match_participants
  const { data: outcomes } = await supabase
    .from("match_participants")
    .select("outcome")
    .eq("athlete_id", athlete.id)
    .not("outcome", "is", null);

  const wins = outcomes?.filter((o) => o.outcome === "win").length ?? 0;
  const losses = outcomes?.filter((o) => o.outcome === "loss").length ?? 0;
  const total = wins + losses;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

  // Calculate win streak from most recent matches
  const { data: recentOutcomes } = await supabase
    .from("match_participants")
    .select("outcome, match_id, matches(created_at)")
    .eq("athlete_id", athlete.id)
    .not("outcome", "is", null)
    .order("match_id", { ascending: false })
    .limit(50);

  let winStreak = 0;
  if (recentOutcomes) {
    for (const entry of recentOutcomes) {
      if (entry.outcome === "win") {
        winStreak++;
      } else {
        break;
      }
    }
  }

  // Fetch recent matches (last 5) with opponent info
  const { data: recentMatches } = await supabase
    .from("match_participants")
    .select(
      `
      outcome,
      elo_delta,
      match_id,
      matches(id, created_at, status),
      athletes!fk_participants_athlete(display_name)
    `,
    )
    .eq("athlete_id", athlete.id)
    .not("outcome", "is", null)
    .order("match_id", { ascending: false })
    .limit(5);

  // For each match, get the opponent's name
  const matchesWithOpponents = await Promise.all(
    (recentMatches ?? []).map(async (mp) => {
      const { data: opponent } = await supabase
        .from("match_participants")
        .select("athletes!fk_participants_athlete(display_name)")
        .eq("match_id", mp.match_id)
        .neq("athlete_id", athlete.id)
        .eq("role", "competitor")
        .single();

      const athletes = opponent?.athletes as
        | { display_name: string }[]
        | null;
      const opponentName = athletes?.[0]?.display_name ?? "Unknown";

      const matchArr = mp.matches as
        | { id: string; created_at: string; status: string }[]
        | null;
      const match = matchArr?.[0] ?? null;

      return {
        id: mp.match_id,
        opponentName,
        result: mp.outcome as "win" | "loss" | "draw",
        eloDelta: mp.elo_delta,
        date: match?.created_at ?? "",
      };
    }),
  );

  // Fetch pending challenges (where current athlete is the opponent)
  const { data: pendingChallenges } = await supabase
    .from("challenges")
    .select("id, created_at, status, challenger:athletes!fk_challenges_challenger(display_name)")
    .eq("opponent_id", athlete.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(5);

  return (
    <div className="flex flex-col gap-6">
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

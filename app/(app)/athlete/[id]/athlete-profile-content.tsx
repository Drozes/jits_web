import { notFound } from "next/navigation";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { ProfileHeader } from "@/components/domain/profile-header";
import { MatchCard } from "@/components/domain/match-card";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { Swords } from "lucide-react";
import { AthleteProfileActions } from "./athlete-profile-actions";
import {
  getPendingChallengeBetween,
  getAthleteStatsRpc,
  getMatchHistory,
} from "@/lib/api/queries";

export async function AthleteProfileContent({
  paramsPromise,
}: {
  paramsPromise: Promise<{ id: string }>;
}) {
  const { id: athleteId } = await paramsPromise;
  const { athlete: currentAthlete } = await requireAthlete();
  const supabase = await createClient();

  // Fetch competitor
  const { data: competitor } = await supabase
    .from("athletes")
    .select("*")
    .eq("id", athleteId)
    .single();

  if (!competitor) notFound();

  // Fetch competitor gym name
  let competitorGymName: string | null = null;
  if (competitor.primary_gym_id) {
    const { data: gym } = await supabase
      .from("gyms")
      .select("name")
      .eq("id", competitor.primary_gym_id)
      .single();
    competitorGymName = gym?.name ?? null;
  }

  // Fetch stats and pending challenge in parallel
  const [compStats, myStats, pendingChallenge, matchHistory] =
    await Promise.all([
      getAthleteStatsRpc(supabase, competitor.id),
      getAthleteStatsRpc(supabase, currentAthlete.id),
      getPendingChallengeBetween(supabase, currentAthlete.id, competitor.id),
      getMatchHistory(supabase, currentAthlete.id),
    ]);

  // Head-to-head: filter own match history for matches against this competitor
  const headToHead = matchHistory
    .filter((m) => m.opponent_id === competitor.id)
    .map((m) => ({
      matchId: m.match_id,
      opponentName: m.opponent_display_name,
      result: m.athlete_outcome as "win" | "loss" | "draw" | null,
      eloDelta: m.elo_delta || null,
      date: m.completed_at,
    }));

  return (
    <>
      <AppHeader title={competitor.display_name} back />
      <PageContainer className="pt-6">
        <div className="flex flex-col gap-6 animate-page-in">
          <ProfileHeader
            athlete={competitor}
            gymName={competitorGymName}
            lookingForCasual={competitor.looking_for_casual}
            lookingForRanked={competitor.looking_for_ranked}
            stats={compStats}
          />

          <AthleteProfileActions
            competitorId={competitor.id}
            currentAthleteId={currentAthlete.id}
            currentAthlete={{
              displayName: currentAthlete.display_name,
              elo: currentAthlete.current_elo,
              ...myStats,
              weight: currentAthlete.current_weight,
            }}
            competitor={{
              displayName: competitor.display_name,
              elo: competitor.current_elo,
              ...compStats,
              weight: competitor.current_weight,
            }}
            pendingChallengeId={pendingChallenge?.id ?? null}
          />

          {/* Head-to-Head History */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Swords className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">Head-to-Head</h3>
            </div>

            {headToHead.length > 0 ? (
              <div className="flex flex-col gap-2">
                {headToHead.map((match) => (
                  <MatchCard
                    key={match.matchId}
                    type="match"
                    opponentName={match.opponentName}
                    result={match.result}
                    eloDelta={match.eloDelta ?? undefined}
                    date={match.date}
                    href={`/match/${match.matchId}/results`}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
                <p className="text-sm">No matches against this opponent yet</p>
              </div>
            )}
          </section>
        </div>
      </PageContainer>
    </>
  );
}

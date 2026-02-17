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

  // Parallelize all independent queries (competitor fetch uses FK join for gym)
  const [
    { data: competitor },
    compStats,
    myStats,
    pendingChallenge,
    matchHistory,
  ] = await Promise.all([
    supabase
      .from("athletes")
      .select("*, gyms!fk_athletes_primary_gym(name)")
      .eq("id", athleteId)
      .single(),
    getAthleteStatsRpc(supabase, athleteId),
    getAthleteStatsRpc(supabase, currentAthlete.id),
    getPendingChallengeBetween(supabase, currentAthlete.id, athleteId),
    getMatchHistory(supabase, currentAthlete.id),
  ]);

  if (!competitor) notFound();

  const gymsData = competitor.gyms as unknown as { name: string } | null;
  const competitorGymName = gymsData?.name ?? null;

  // Head-to-head: filter own match history for matches against this competitor
  const headToHead = matchHistory
    .filter((m) => m.opponent_id === competitor.id)
    .map((m) => ({
      matchId: m.match_id,
      opponentName: m.opponent_display_name,
      result: m.athlete_outcome as "win" | "loss" | "draw" | null,
      matchType: m.match_type as "ranked" | "casual",
      eloDelta: m.elo_delta || null,
      date: m.completed_at,
    }));

  return (
    <>
      <AppHeader title="" back />
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
            headToHead={headToHead}
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
                    matchType={match.matchType}
                    eloDelta={match.eloDelta ?? undefined}
                    date={match.date}
                    href={`/match/${match.matchId}/results`}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-8 text-center">
                <Swords className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">No history yet</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Challenge them to your first match!</p>
              </div>
            )}
          </section>
        </div>
      </PageContainer>
    </>
  );
}

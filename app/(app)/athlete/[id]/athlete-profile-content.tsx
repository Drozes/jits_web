import { notFound } from "next/navigation";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { ProfileHeader } from "@/components/domain/profile-header";
import { MatchCard } from "@/components/domain/match-card";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { Swords } from "lucide-react";
import { AthleteProfileActions } from "./athlete-profile-actions";
import { computeStats } from "@/lib/utils";

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

  // Compute competitor stats
  const { data: competitorOutcomes } = await supabase
    .from("match_participants")
    .select("outcome")
    .eq("athlete_id", competitor.id)
    .not("outcome", "is", null);

  const compStats = computeStats(competitorOutcomes ?? []);

  // Compute current athlete stats (for compare modal)
  const { data: currentOutcomes } = await supabase
    .from("match_participants")
    .select("outcome")
    .eq("athlete_id", currentAthlete.id)
    .not("outcome", "is", null);

  const myStats = computeStats(currentOutcomes ?? []);

  // Head-to-head matches: find matches where both athletes participated
  const { data: competitorMatches } = await supabase
    .from("match_participants")
    .select("match_id")
    .eq("athlete_id", competitor.id);

  const competitorMatchIds =
    competitorMatches?.map((m) => m.match_id) ?? [];

  let headToHead: Array<{
    opponentName: string;
    result: "win" | "loss" | "draw" | null;
    eloDelta: number | null;
    date: string;
  }> = [];

  if (competitorMatchIds.length > 0) {
    const { data: sharedParticipations } = await supabase
      .from("match_participants")
      .select(
        "match_id, outcome, elo_delta, matches!fk_participants_match(completed_at, status)",
      )
      .eq("athlete_id", currentAthlete.id)
      .in("match_id", competitorMatchIds);

    headToHead =
      sharedParticipations
        ?.filter((p) => {
          const match = (p.matches as unknown as Array<{ status: string }>)?.[0];
          return match?.status === "completed";
        })
        .map((p) => {
          const match = (p.matches as unknown as Array<{ completed_at: string | null }>)?.[0];
          return {
            opponentName: competitor.display_name,
            result: p.outcome as "win" | "loss" | "draw" | null,
            eloDelta: p.elo_delta,
            date: match?.completed_at ?? "",
          };
        })
        .sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        ) ?? [];
  }

  return (
    <>
      <AppHeader title={competitor.display_name} back />
      <PageContainer className="pt-6">
        <div className="flex flex-col gap-6">
          <ProfileHeader
            athlete={competitor}
            gymName={competitorGymName}
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
          />

          {/* Head-to-Head History */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Swords className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">Head-to-Head</h3>
            </div>

            {headToHead.length > 0 ? (
              <div className="flex flex-col gap-2">
                {headToHead.map((match, i) => (
                  <MatchCard
                    key={i}
                    type="match"
                    opponentName={match.opponentName}
                    result={match.result}
                    eloDelta={match.eloDelta ?? undefined}
                    date={match.date}
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

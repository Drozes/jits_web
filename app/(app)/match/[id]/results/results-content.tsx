import { redirect } from "next/navigation";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { MATCH_STATUS } from "@/lib/constants";
import { RecordResultClient } from "./record-result-client";
import { MatchResultsDisplay } from "./results-display";

export async function MatchResultsContent({
  paramsPromise,
  searchParamsPromise,
}: {
  paramsPromise: Promise<{ id: string }>;
  searchParamsPromise: Promise<{ elapsed?: string }>;
}) {
  const [{ id: matchId }, searchParams] = await Promise.all([
    paramsPromise,
    searchParamsPromise,
  ]);
  const { athlete } = await requireAthlete();
  const supabase = await createClient();

  // Fetch match
  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select("id, match_type, status, result, duration_seconds")
    .eq("id", matchId)
    .single();

  if (matchError || !match) {
    redirect("/match/pending");
  }

  // Fetch participants with athlete info
  const { data: participants } = await supabase
    .from("match_participants")
    .select(
      "id, athlete_id, outcome, elo_before, elo_after, elo_delta, athletes!fk_participants_athlete(id, display_name)",
    )
    .eq("match_id", matchId)
    .eq("role", "competitor");

  if (!participants || participants.length < 2) {
    redirect("/match/pending");
  }

  // Verify current user is a participant
  const currentParticipant = participants.find((p) => {
    const arr = p.athletes as { id: string; display_name: string }[] | null;
    return arr?.[0]?.id === athlete.id;
  });

  if (!currentParticipant) {
    redirect("/match/pending");
  }

  const rivalParticipant = participants.find(
    (p) => p.id !== currentParticipant.id,
  );
  const rivalArr = rivalParticipant?.athletes as
    | { id: string; display_name: string }[]
    | null;

  const currentAthleteArr = currentParticipant.athletes as
    | { id: string; display_name: string }[]
    | null;

  // If match is completed, show results display
  if (match.status === MATCH_STATUS.COMPLETED) {
    return (
      <>
        <AppHeader title="Match Results" back />
        <PageContainer className="pt-6">
          <MatchResultsDisplay
            matchType={match.match_type}
            result={match.result}
            currentAthlete={{
              displayName: currentAthleteArr?.[0]?.display_name ?? "You",
              outcome: currentParticipant.outcome,
              eloBefore: currentParticipant.elo_before,
              eloAfter: currentParticipant.elo_after,
              eloDelta: currentParticipant.elo_delta,
            }}
            rivalAthlete={{
              displayName: rivalArr?.[0]?.display_name ?? "Opponent",
              outcome: rivalParticipant?.outcome ?? null,
              eloBefore: rivalParticipant?.elo_before ?? null,
              eloAfter: rivalParticipant?.elo_after ?? null,
              eloDelta: rivalParticipant?.elo_delta ?? 0,
            }}
          />
        </PageContainer>
      </>
    );
  }

  // Match not completed — show result recording form
  // Fetch submission types
  const { data: submissionTypes } = await supabase
    .from("submission_types")
    .select("code, display_name, category")
    .eq("status", "active")
    .order("sort_order");

  const elapsed = searchParams.elapsed
    ? parseInt(searchParams.elapsed, 10)
    : null;

  return (
    <>
      <AppHeader title="Record Result" back />
      <PageContainer className="pt-6">
        <RecordResultClient
          matchId={matchId}
          matchType={match.match_type}
          durationSeconds={match.duration_seconds}
          elapsedSeconds={elapsed}
          currentAthleteId={currentAthleteArr?.[0]?.id ?? athlete.id}
          currentAthleteName={
            currentAthleteArr?.[0]?.display_name ?? "You"
          }
          rivalAthleteId={rivalArr?.[0]?.id ?? ""}
          rivalAthleteName={rivalArr?.[0]?.display_name ?? "Opponent"}
          submissionTypes={submissionTypes ?? []}
        />
      </PageContainer>
    </>
  );
}

import { redirect } from "next/navigation";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { MATCH_STATUS } from "@/lib/constants";
import { LiveMatchClient } from "./live-match-client";

export async function LiveMatchContent({
  paramsPromise,
}: {
  paramsPromise: Promise<{ id: string }>;
}) {
  const { id: matchId } = await paramsPromise;
  const { athlete } = await requireAthlete();
  const supabase = await createClient();

  // Fetch match with participants and athlete names
  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select("id, match_type, status, duration_seconds, created_at")
    .eq("id", matchId)
    .single();

  if (matchError || !match) {
    redirect("/match/pending");
  }

  // Redirect if match is already completed
  if (match.status === MATCH_STATUS.COMPLETED) {
    redirect(`/match/${matchId}/results`);
  }

  // Fetch participants
  const { data: participants } = await supabase
    .from("match_participants")
    .select(
      "id, athlete_id, role, athletes!fk_participants_athlete(id, display_name)",
    )
    .eq("match_id", matchId)
    .eq("role", "competitor");

  if (!participants || participants.length < 2) {
    redirect("/match/pending");
  }

  // Verify current user is a participant
  const currentParticipant = participants.find((p) => {
    const athleteArr = p.athletes as
      | { id: string; display_name: string }[]
      | null;
    return athleteArr?.[0]?.id === athlete.id;
  });

  if (!currentParticipant) {
    redirect("/match/pending");
  }

  const rivalParticipant = participants.find(
    (p) => p.id !== currentParticipant.id,
  );
  const rivalAthleteArr = rivalParticipant?.athletes as
    | { id: string; display_name: string }[]
    | null;
  const rivalName = rivalAthleteArr?.[0]?.display_name ?? "Opponent";

  return (
    <>
      <AppHeader title="Live Match" />
      <PageContainer className="pt-6">
        <LiveMatchClient
          matchId={matchId}
          matchStatus={match.status}
          matchType={match.match_type}
          durationSeconds={match.duration_seconds}
          opponentName={rivalName}
        />
      </PageContainer>
    </>
  );
}

import { redirect } from "next/navigation";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { getMatchDetails } from "@jits/shared/api/queries";
import { MatchTimer } from "./match-timer";

export async function LiveMatchContent({
  paramsPromise,
}: {
  paramsPromise: Promise<{ id: string }>;
}) {
  const { id: matchId } = await paramsPromise;
  const { athlete } = await requireAthlete();
  const supabase = await createClient();

  const match = await getMatchDetails(supabase, matchId);
  if (!match) redirect("/match/pending");

  if (match.status === "completed") {
    redirect(`/match/${matchId}/results`);
  }

  const isParticipant = match.participants.some(
    (p) => p.athlete_id === athlete.id,
  );
  if (!isParticipant) redirect("/");

  const opponent = match.participants.find(
    (p) => p.athlete_id !== athlete.id,
  );

  return (
    <div className="space-y-6 text-center animate-page-in">
      <div>
        <p className="text-sm text-muted-foreground">
          {athlete.display_name} vs {opponent?.display_name ?? "Opponent"}
        </p>
      </div>

      <MatchTimer
        matchId={matchId}
        durationSeconds={match.duration_seconds}
        status={match.status}
        startedAt={match.started_at}
      />
    </div>
  );
}

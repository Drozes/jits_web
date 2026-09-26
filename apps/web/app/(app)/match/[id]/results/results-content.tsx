import { redirect } from "next/navigation";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { getMatchDetails, getSubmissionTypes } from "@jits/shared/api/queries";
import { RecordResultForm } from "./record-result-form";
import { ResultsDisplay } from "./results-display";

export async function ResultsContent({
  paramsPromise,
}: {
  paramsPromise: Promise<{ id: string }>;
}) {
  const { id: matchId } = await paramsPromise;
  const { athlete } = await requireAthlete();
  const supabase = await createClient();

  const match = await getMatchDetails(supabase, matchId);
  if (!match) redirect("/match/pending");

  const isParticipant = match.participants.some(
    (p) => p.athlete_id === athlete.id,
  );
  if (!isParticipant) redirect("/");

  if (match.status === "completed") {
    return <ResultsDisplay match={match} currentAthleteId={athlete.id} />;
  }

  const submissionTypes = await getSubmissionTypes(supabase);

  // Compute elapsed match time from server started_at for auto-fill, capped
  // at the match length (the BE refuses a finish time past it).
  const elapsedSeconds = match.started_at
    ? Math.min(
        Math.floor((Date.now() - new Date(match.started_at).getTime()) / 1000),
        match.duration_seconds,
      )
    : undefined;

  return (
    <RecordResultForm
      matchId={matchId}
      participants={match.participants}
      submissionTypes={submissionTypes}
      elapsedSeconds={elapsedSeconds}
      durationSeconds={match.duration_seconds}
    />
  );
}

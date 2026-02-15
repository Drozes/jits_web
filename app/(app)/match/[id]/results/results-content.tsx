import { redirect } from "next/navigation";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { getMatchDetails, getSubmissionTypes } from "@/lib/api/queries";
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

  return (
    <RecordResultForm
      matchId={matchId}
      participants={match.participants}
      matchType={match.match_type}
      submissionTypes={submissionTypes}
    />
  );
}

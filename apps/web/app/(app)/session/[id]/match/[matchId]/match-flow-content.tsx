import { redirect } from "next/navigation";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { getMatchDetails, getSubmissionTypes } from "@jits/shared/api/queries";
import { getFlag } from "@/lib/feature-flags";
import { MatchFlowWizard } from "./match-flow-wizard";
import type { MatchFlowStep } from "./match-flow-wizard";

function computeInitialStep(
  status: string,
  timekeeperEnabled: boolean,
  hasTimekeeper: boolean,
  isTimekeeper: boolean,
): MatchFlowStep {
  if (status === "pending") {
    return timekeeperEnabled && hasTimekeeper ? "timekeeper-wait" : "weight-verify";
  }
  if (status === "in_progress") {
    return timekeeperEnabled && isTimekeeper ? "timekeeper-live" : "fighter-live";
  }
  if (status === "completed") return "match-summary";
  if (status === "disputed") return "match-recorded";
  return "weight-verify";
}

export async function MatchFlowContent({
  paramsPromise,
}: {
  paramsPromise: Promise<{ id: string; matchId: string }>;
}) {
  const { id: sessionId, matchId } = await paramsPromise;
  // Use requireAthlete (not requireSessionParticipant) because the match page
  // must also be accessible to timekeepers. Participant validation happens
  // via getMatchDetails RLS + the find check below.
  const { athlete } = await requireAthlete();
  const supabase = await createClient();

  const [match, submissionTypes] = await Promise.all([
    getMatchDetails(supabase, matchId),
    getSubmissionTypes(supabase),
  ]);
  const timekeeperEnabled = getFlag("timekeeperEnabled");

  if (!match) redirect(`/session/${sessionId}/lobby`);

  const me = match.participants.find((p) => p.athlete_id === athlete.id);
  if (!me) redirect(`/session/${sessionId}/lobby`);

  const opponent = match.participants.find((p) => p.athlete_id !== athlete.id);
  if (!opponent) redirect(`/session/${sessionId}/lobby`);

  const isTimekeeper = match.timekeeper_id === athlete.id;
  const initialStep = computeInitialStep(
    match.status,
    timekeeperEnabled,
    !!match.timekeeper_id,
    isTimekeeper,
  );

  return (
    <MatchFlowWizard
      sessionId={sessionId}
      matchId={matchId}
      matchType={match.match_type as "casual" | "ranked"}
      durationSeconds={match.duration_seconds}
      startedAt={match.started_at}
      pausedAt={match.paused_at}
      totalPausedDuration={match.total_paused_duration}
      currentAthlete={{ id: me.athlete_id, displayName: me.display_name, elo: me.current_elo, weight: me.current_weight, profilePhotoUrl: me.profile_photo_url }}
      opponent={{ id: opponent.athlete_id, displayName: opponent.display_name, elo: opponent.current_elo, weight: opponent.current_weight, profilePhotoUrl: opponent.profile_photo_url }}
      isTimekeeper={isTimekeeper}
      hasTimekeeper={!!match.timekeeper_id}
      timekeeperEnabled={timekeeperEnabled}
      submissionTypes={submissionTypes}
      initialStep={initialStep}
      matchStatus={match.status}
    />
  );
}

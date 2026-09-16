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

/**
 * Renders the match wizard for a match from ANY origin.
 *
 * The wizard has no session dependency: the guard is requireAthlete, every RPC
 * is keyed on matchId, and match realtime is `session-match:${matchId}`.
 * `matches.session_id` is nullable (chk_match_origin is satisfied by
 * challenge_id alone), so an Arena challenge match renders here unchanged.
 * Origin only decides where the exits go and whether a timekeeper may exist.
 */
export async function MatchFlowContent({
  matchId,
  exitHref,
  exitLabel = "Back to Lobby",
  allowTimekeeper = true,
}: {
  matchId: string;
  exitHref: string;
  exitLabel?: string;
  /**
   * Arena matches are remote 1v1 with no third party at a gym, so they force
   * the fighter-live variant by denying the timekeeper branch outright.
   */
  allowTimekeeper?: boolean;
}) {
  // Use requireAthlete (not requireSessionParticipant) because the match page
  // must also be accessible to timekeepers. Participant validation happens
  // via getMatchDetails RLS + the find check below.
  const { athlete } = await requireAthlete();
  const supabase = await createClient();

  const [match, submissionTypes] = await Promise.all([
    getMatchDetails(supabase, matchId),
    getSubmissionTypes(supabase),
  ]);
  const timekeeperEnabled = allowTimekeeper && getFlag("timekeeperEnabled");

  if (!match) redirect(exitHref);

  const me = match.participants.find((p) => p.athlete_id === athlete.id);
  if (!me) redirect(exitHref);

  const opponent = match.participants.find((p) => p.athlete_id !== athlete.id);
  if (!opponent) redirect(exitHref);

  const isTimekeeper = allowTimekeeper && match.timekeeper_id === athlete.id;
  const initialStep = computeInitialStep(
    match.status,
    timekeeperEnabled,
    allowTimekeeper && !!match.timekeeper_id,
    isTimekeeper,
  );

  return (
    <MatchFlowWizard
      exitHref={exitHref}
      exitLabel={exitLabel}
      matchId={matchId}
      matchType={match.match_type as "casual" | "ranked"}
      durationSeconds={match.duration_seconds}
      startedAt={match.started_at}
      pausedAt={match.paused_at}
      totalPausedDuration={match.total_paused_duration}
      currentAthlete={{ id: me.athlete_id, displayName: me.display_name, elo: me.current_elo, weight: me.current_weight, profilePhotoUrl: me.profile_photo_url }}
      opponent={{ id: opponent.athlete_id, displayName: opponent.display_name, elo: opponent.current_elo, weight: opponent.current_weight, profilePhotoUrl: opponent.profile_photo_url }}
      isTimekeeper={isTimekeeper}
      hasTimekeeper={allowTimekeeper && !!match.timekeeper_id}
      timekeeperEnabled={timekeeperEnabled}
      submissionTypes={submissionTypes}
      initialStep={initialStep}
      matchStatus={match.status}
    />
  );
}

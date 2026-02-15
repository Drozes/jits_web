import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { getMatchDetails } from "@/lib/api/queries";
import { MATCH_TYPE } from "@/lib/constants";
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
    <div className="space-y-6 text-center">
      <div>
        <p className="text-sm text-muted-foreground">
          {athlete.display_name} vs {opponent?.display_name ?? "Opponent"}
        </p>
        <Badge
          variant={
            match.match_type === MATCH_TYPE.RANKED ? "default" : "secondary"
          }
          className="mt-2"
        >
          {match.match_type === MATCH_TYPE.RANKED ? "Ranked" : "Casual"}
        </Badge>
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

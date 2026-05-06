import { requireSessionParticipant } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { getSessionLobbyData } from "@jits/shared/api/queries";
import { SessionUnavailable } from "@/components/domain/session-unavailable";
import { SessionLobbyClient } from "./session-lobby-client";

export async function SessionLobbyContent({
  paramsPromise,
}: {
  paramsPromise: Promise<{ id: string }>;
}) {
  const { id: sessionId } = await paramsPromise;
  const { athlete } = await requireSessionParticipant(sessionId);
  const supabase = await createClient();
  const lobbyResult = await getSessionLobbyData(supabase, sessionId);

  if (!lobbyResult.ok) {
    return (
      <SessionUnavailable
        reason={lobbyResult.error.code === "SESSION_NOT_FOUND" ? "not-found" : "ended"}
      />
    );
  }

  const lobbyData = lobbyResult.data;
  if (lobbyData.status !== "active" && lobbyData.status !== "scheduled") {
    return <SessionUnavailable reason="ended" />;
  }

  return (
    <SessionLobbyClient
      sessionId={sessionId}
      currentAthleteId={athlete.id}
      currentAthleteName={athlete.display_name}
      currentAthleteElo={athlete.current_elo}
      currentAthleteWeight={athlete.current_weight}
      initialParticipants={lobbyData.participants}
      gymName={lobbyData.gymName}
    />
  );
}

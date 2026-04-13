import { redirect } from "next/navigation";
import Link from "next/link";
import { requireSessionParticipant } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { getSessionLobbyData } from "@/lib/api/queries";
import { Button } from "@/components/ui/button";
import { SessionLobbyClient } from "./session-lobby-client";

export async function SessionLobbyContent({
  paramsPromise,
}: {
  paramsPromise: Promise<{ id: string }>;
}) {
  const { id: sessionId } = await paramsPromise;
  const { athlete } = await requireSessionParticipant(sessionId);
  const supabase = await createClient();
  const lobbyData = await getSessionLobbyData(supabase, sessionId);

  if (!lobbyData) {
    redirect("/gyms");
  }

  if (lobbyData.status !== "active") {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <p className="text-lg font-semibold">Session Ended</p>
        <p className="text-sm text-muted-foreground">
          This session is no longer active.
        </p>
        <Button asChild>
          <Link href="/gyms">Back to Gyms</Link>
        </Button>
      </div>
    );
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

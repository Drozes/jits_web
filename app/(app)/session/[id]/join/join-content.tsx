import { notFound, redirect } from "next/navigation";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { getSessionForJoin } from "@/lib/api/queries";
import { JoinWizard } from "./join-wizard";

export async function JoinContent({
  paramsPromise,
}: {
  paramsPromise: Promise<{ id: string }>;
}) {
  const { id: sessionId } = await paramsPromise;
  const { athlete } = await requireAthlete();
  const supabase = await createClient();

  const session = await getSessionForJoin(supabase, sessionId, athlete.id);
  if (!session) notFound();

  // Check if already a participant (not done) and redirect to lobby
  const { data: existing } = await supabase
    .from("session_participants")
    .select("id")
    .eq("session_id", sessionId)
    .eq("athlete_id", athlete.id)
    .neq("status", "done")
    .limit(1)
    .maybeSingle();

  if (existing) redirect(`/session/${sessionId}/lobby`);

  // Find active app-level waiver ID for signing
  let activeWaiverId: string | null = null;
  if (session.requiresWaiver && !session.hasSignedWaiver) {
    const { data: waiver } = await supabase
      .from("waivers")
      .select("id")
      .eq("scope", "app")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    activeWaiverId = waiver?.id ?? null;
  }

  return (
    <JoinWizard
      sessionId={sessionId}
      gymName={session.gymName}
      gymCity={session.gymCity}
      gymLatitude={session.gymLatitude}
      gymLongitude={session.gymLongitude}
      athleteWeight={session.athleteWeight}
      requiresWaiver={session.requiresWaiver}
      hasSignedWaiver={session.hasSignedWaiver}
      activeWaiverId={activeWaiverId}
    />
  );
}

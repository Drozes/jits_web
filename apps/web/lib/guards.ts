import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ATHLETE_STATUS } from "@jits/shared/constants";
import { getCurrentAthlete } from "@jits/shared/api/queries";

/**
 * Requires authentication. Returns the user if authenticated,
 * otherwise redirects to login.
 */
export async function requireAuth() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  return user;
}

/**
 * Requires an authenticated user with an athlete profile.
 * Returns both user and athlete if found, otherwise redirects.
 */
export async function requireAthlete() {
  const user = await requireAuth();
  const supabase = await createClient();

  const athlete = await getCurrentAthlete(supabase, user.id);

  if (!athlete) {
    redirect("/profile/setup");
  }

  // Athlete exists but hasn't been activated by the backend
  // (activation requires display_name + primary_gym_id)
  if (athlete.status === ATHLETE_STATUS.PENDING) {
    redirect("/profile/setup");
  }

  return { user, athlete };
}

/**
 * Requires athlete to be a checked-in participant of a session.
 * Non-participants are redirected to the join page.
 */
export async function requireSessionParticipant(sessionId: string) {
  const { user, athlete } = await requireAthlete();
  const supabase = await createClient();

  const { data: participant } = await supabase
    .from("session_participants")
    .select("id, status, weight_confirmed")
    .eq("session_id", sessionId)
    .eq("athlete_id", athlete.id)
    .not("status", "in", "(done,left)")
    .single();

  if (!participant) {
    redirect(`/session/${sessionId}/join`);
  }

  return {
    user,
    athlete,
    participant: participant as { id: string; status: string; weight_confirmed: number | null },
  };
}

/**
 * Like requireAthlete but returns null instead of redirecting.
 * Use in layouts/components that render on pages where the athlete
 * may not exist yet (e.g. /profile/setup).
 */
export async function getActiveAthlete() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) return null;

  const athlete = await getCurrentAthlete(supabase, user.id);

  if (!athlete || athlete.status === ATHLETE_STATUS.PENDING) {
    return null;
  }

  return athlete;
}

/**
 * Redirects to login if the user is not authenticated.
 * Use this for pages that should redirect unauthenticated users.
 */
export async function redirectIfUnauthed() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }
}

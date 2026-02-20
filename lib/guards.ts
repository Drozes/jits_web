import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ATHLETE_STATUS } from "@/lib/constants";

/**
 * Explicit columns fetched by guard functions.
 * Only includes columns actually accessed by consumers — excludes
 * created_at, push_token, and role to reduce payload on every page load.
 */
const ATHLETE_GUARD_SELECT =
  "id, auth_user_id, display_name, current_elo, highest_elo, current_weight, primary_gym_id, profile_photo_url, looking_for_casual, looking_for_ranked, status, free_agent" as const;

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

  const { data: athlete, error } = await supabase
    .from("athletes")
    .select(ATHLETE_GUARD_SELECT)
    .eq("auth_user_id", user.id)
    .single();

  if (error || !athlete) {
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
 * Like requireAthlete but returns null instead of redirecting.
 * Use in layouts/components that render on pages where the athlete
 * may not exist yet (e.g. /profile/setup).
 */
export async function getActiveAthlete() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) return null;

  const { data: athlete, error } = await supabase
    .from("athletes")
    .select(ATHLETE_GUARD_SELECT)
    .eq("auth_user_id", user.id)
    .single();

  if (error || !athlete || athlete.status === ATHLETE_STATUS.PENDING) {
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

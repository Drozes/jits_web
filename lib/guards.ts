import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
    .select("*")
    .eq("auth_user_id", user.id)
    .single();

  if (error || !athlete) {
    redirect("/profile/setup");
  }

  return { user, athlete };
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

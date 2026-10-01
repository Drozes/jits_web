import "server-only";
import { getCurrentAthlete } from "@jits/shared/api/queries";
import { createClient } from "@/lib/supabase/server";

/** Who is looking at the landing page. */
export type InviteViewer =
  | { state: "signed_out" }
  | { state: "no_athlete" }
  | { state: "pending"; displayName: string | null }
  | { state: "active"; displayName: string | null };

export async function getInviteViewer(): Promise<InviteViewer> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { state: "signed_out" };
  const athlete = await getCurrentAthlete(supabase, user.id);
  if (!athlete) return { state: "no_athlete" };
  const displayName = athlete.display_name ?? null;
  return athlete.status === "active"
    ? { state: "active", displayName }
    : { state: "pending", displayName };
}

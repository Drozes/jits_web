import Link from "next/link";
import { Settings } from "lucide-react";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { getGymDetailResult } from "@jits/shared/api/queries";

interface GymHeaderManageLinkProps {
  paramsPromise: Promise<{ id: string }>;
}

/**
 * Server component that renders a "Manage" link only when the current
 * athlete is a gym manager for this gym. Mounted as the AppHeader rightAction.
 */
export async function GymHeaderManageLink({ paramsPromise }: GymHeaderManageLinkProps) {
  const { id } = await paramsPromise;
  const { athlete } = await requireAthlete();
  const supabase = await createClient();
  // RESULT VARIANT, NOT THE LENIENT ONE. `getGymDetail` defaults
  // `isGymManager` to false when the `gym_managers` read fails, and this
  // component turned that false straight into "render nothing", so a blip
  // silently deleted the owner's only entry point to their own gym.
  const result = await getGymDetailResult(supabase, id, athlete.id);

  // A gym that does not exist has no manage link, and the page beneath is a
  // 404 anyway.
  if (!result.ok && result.error.code === "GYM_NOT_FOUND") return null;

  // UNKNOWN RENDERS THE LINK, DELIBERATELY. On a failed read there is no
  // authorization answer available (`PartialGymDetail` types `isGymManager`
  // out precisely so nobody invents one), so this component has to pick a
  // default for an affordance, and the two defaults are not symmetric:
  //
  //   hide  -> the one person who needs this page loses the only route to it,
  //            with nothing on screen explaining why.
  //   show  -> a non-manager gets an icon that leads to a page which re-runs
  //            the check and either redirects them back (healthy read) or says
  //            the check failed (degraded read). Nothing is granted here: the
  //            gate lives at /manage and, for every write behind it, in RLS.
  //
  // So the link is an affordance, never a grant, and an unknown is allowed to
  // offer it. Flip this single `return null` if the product would rather show
  // a non-manager nothing than risk a stray icon during an outage.
  if (result.ok && !result.data.isGymManager) return null;

  return (
    <Link
      href={`/gyms/${id}/manage`}
      aria-label="Manage Gym"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 32,
        height: 32,
        borderRadius: "var(--radius-xs)",
        background: "transparent",
        border: "1px solid transparent",
        color: "var(--text-secondary)",
        transition: "background var(--motion-hover)",
      }}
    >
      <Settings className="h-4 w-4" />
    </Link>
  );
}

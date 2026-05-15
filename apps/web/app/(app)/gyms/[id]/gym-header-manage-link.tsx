import Link from "next/link";
import { Settings } from "lucide-react";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { getGymDetail } from "@jits/shared/api/queries";

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
  const gym = await getGymDetail(supabase, id, athlete.id);

  if (!gym || !gym.isGymManager) return null;

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

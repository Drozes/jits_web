import { getActiveAthlete } from "@/lib/guards";
import { ArenaBootstrap } from "./arena-bootstrap";

/**
 * Server gate for the app-wide Arena owner: mounts it only for an ACTIVE
 * athlete, keyed by athlete id so a sign-out or athlete switch tears every
 * channel down and the next athlete starts clean. Must sit inside <Suspense>.
 */
export async function ArenaBootstrapGate() {
  const athlete = await getActiveAthlete();
  if (!athlete) return null;
  return (
    <ArenaBootstrap
      key={athlete.id}
      athleteId={athlete.id}
      athleteWeight={athlete.current_weight}
      initialLive={athlete.looking_for_ranked ?? false}
    />
  );
}

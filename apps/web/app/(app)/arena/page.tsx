import { Suspense } from "react";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { ArenaContent } from "./arena-content";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeaderActions } from "@/components/layout/page-header-actions";
import { getArenaDataResult } from "@jits/shared/api/queries";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { WifiOff } from "lucide-react";

function ArenaSkeleton() {
  const bar = {
    background: "var(--bg-elevated)",
    borderRadius: "var(--radius-md)",
  } as const;
  return (
    <div
      className="flex flex-col animate-pulse"
      style={{ gap: "var(--space-6)" }}
    >
      <div
        className="h-7 w-32"
        style={{ ...bar, borderRadius: "var(--radius-xs)" }}
      />
      <div className="h-24" style={bar} />
      <div className="h-24" style={bar} />
      <div className="h-24" style={bar} />
    </div>
  );
}

export default function ArenaPage() {
  return (
    <>
      <AppHeader title="Arena" rightAction={<PageHeaderActions />} />
      <PageContainer className="pt-6">
        <Suspense fallback={<ArenaSkeleton />}>
          <ArenaData />
        </Suspense>
      </PageContainer>
    </>
  );
}

async function ArenaData() {
  const { athlete: currentAthlete } = await requireAthlete();
  const supabase = await createClient();

  // get_arena_data orders looking_athletes by current_elo DESC and applies
  // p_limit (default 20). Presence is uncapped, so a low default silently hid
  // live athletes below the cut and under-reported the "Online now" count.
  //
  // RESULT VARIANT, NOT THE LENIENT ONE. `getArenaData` resolves to `null` when
  // the RPC fails (and get_arena_data RAISEs whenever auth_athlete_id() is
  // null, so that is reachable, not theoretical), and the very next statement
  // here used to call `.map()` on `arena.looking_athletes`, a TypeError on a
  // primary nav tab. The other failure mode is just as bad and quieter:
  // coalescing the null would render "nobody is looking for a match" as a fact
  // about the world when it is really a fact about the request.
  const arena = await getArenaDataResult(supabase, 100);

  if (!arena.ok) return <ArenaUnavailable />;

  type ArenaAthlete = { id: string; display_name: string; current_elo: number; gym_name: string | null; current_weight: number | null; profile_photo_url?: string | null };
  const toCompetitor = (a: ArenaAthlete) => ({
    id: a.id,
    displayName: a.display_name,
    currentElo: a.current_elo,
    gymName: a.gym_name ?? undefined,
    weight: a.current_weight ?? undefined,
    profilePhotoUrl: a.profile_photo_url ?? undefined,
    eloDiff: a.current_elo - currentAthlete.current_elo,
  });

  return (
    <ArenaContent
      lookingCompetitors={arena.data.looking_athletes.map((a) => toCompetitor(a))}
      currentAthleteRanked={currentAthlete.looking_for_ranked}
      challengedIds={arena.data.challenged_opponent_ids}
    />
  );
}

/**
 * Shown when the arena read FAILED, which is a different statement from "no
 * one is looking for a match". Same shape as `SessionUnavailable`: a plate, a
 * cause, and one way out. A server component cannot offer a `reset()`, so the
 * exit is a link rather than a retry button.
 */
function ArenaUnavailable() {
  return (
    <div className="flex flex-col items-center gap-4 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <WifiOff className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-lg font-semibold">Arena unavailable</p>
      <p className="text-sm text-muted-foreground">
        We couldn&apos;t load who&apos;s looking for a match. This is a
        connection problem, not an empty arena.
      </p>
      <Button asChild>
        <Link href="/">Back to home</Link>
      </Button>
    </div>
  );
}

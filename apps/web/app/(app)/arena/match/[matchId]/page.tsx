import { Suspense } from "react";
import { Loader2 } from "lucide-react";
// Cross-route import: the wizard still lives under the session route because
// that is its original home, and moving the whole subtree is a larger refactor.
// It has no session dependency (see MatchFlowContent's docblock); origin only
// decides the exits and whether a timekeeper may exist.
import { MatchFlowContent } from "@/app/(app)/session/[id]/match/[matchId]/match-flow-content";

/**
 * Arena match: the same wizard the Gyms screen uses, for a match created from
 * the Arena lobby instead of a gym session.
 *
 * `matches.session_id` is NULL for these (chk_match_origin is satisfied by
 * challenge_id), which every RPC, RLS policy and realtime channel in the
 * wizard path already tolerates.
 */
export default function ArenaMatchPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  return (
    <Suspense fallback={<MatchFlowSkeleton />}>
      <ArenaMatchContent paramsPromise={params} />
    </Suspense>
  );
}

async function ArenaMatchContent({
  paramsPromise,
}: {
  paramsPromise: Promise<{ matchId: string }>;
}) {
  // params is a Promise under cacheComponents; await it inside the boundary.
  const { matchId } = await paramsPromise;
  return (
    <MatchFlowContent
      matchId={matchId}
      exitHref="/arena"
      exitLabel="Back to Arena"
      // Arena matches are remote 1v1 with nobody at a gym to keep time, so the
      // timekeeper variants are denied and every fighter gets `fighter-live`.
      allowTimekeeper={false}
    />
  );
}

function MatchFlowSkeleton() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
      <Loader2
        className="h-8 w-8 animate-spin"
        style={{ color: "var(--text-tertiary)" }}
      />
      <p
        style={{
          fontFamily: "var(--font-body)",
          fontSize: "var(--size-body-s)",
          color: "var(--text-secondary)",
        }}
      >
        Loading match...
      </p>
    </div>
  );
}

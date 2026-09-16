import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { MatchFlowContent } from "./match-flow-content";

export default function SessionMatchPage({
  params,
}: {
  params: Promise<{ id: string; matchId: string }>;
}) {
  return (
    <Suspense fallback={<MatchFlowSkeleton />}>
      <SessionMatchContent paramsPromise={params} />
    </Suspense>
  );
}

async function SessionMatchContent({
  paramsPromise,
}: {
  paramsPromise: Promise<{ id: string; matchId: string }>;
}) {
  // params is a Promise under cacheComponents; await it inside the boundary.
  const { id: sessionId, matchId } = await paramsPromise;
  return (
    <MatchFlowContent
      matchId={matchId}
      exitHref={`/session/${sessionId}/lobby`}
      exitLabel="Back to Lobby"
    />
  );
}

function MatchFlowSkeleton() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Loading match...</p>
    </div>
  );
}

import { Suspense } from "react";
import { MatchLobbyContent } from "./match-lobby-content";

export default function MatchLobbyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<MatchLobbySkeleton />}>
      <MatchLobbyContent paramsPromise={params} />
    </Suspense>
  );
}

function MatchLobbySkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse pt-14 px-4 max-w-md mx-auto">
      <div className="h-8 w-32 rounded bg-muted mx-auto" />
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col items-center gap-2 flex-1">
          <div className="h-16 w-16 rounded-full bg-muted" />
          <div className="h-4 w-20 rounded bg-muted" />
          <div className="h-3 w-12 rounded bg-muted" />
        </div>
        <div className="h-8 w-8 rounded bg-muted" />
        <div className="flex flex-col items-center gap-2 flex-1">
          <div className="h-16 w-16 rounded-full bg-muted" />
          <div className="h-4 w-20 rounded bg-muted" />
          <div className="h-3 w-12 rounded bg-muted" />
        </div>
      </div>
      <div className="h-20 rounded-lg bg-muted" />
      <div className="h-12 rounded-lg bg-muted" />
    </div>
  );
}

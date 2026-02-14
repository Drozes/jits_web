import { Suspense } from "react";
import { LiveMatchContent } from "./live-match-content";

export default function LiveMatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<LiveMatchSkeleton />}>
      <LiveMatchContent paramsPromise={params} />
    </Suspense>
  );
}

function LiveMatchSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse pt-14 px-4 max-w-md mx-auto">
      <div className="h-6 w-28 rounded bg-muted mx-auto" />
      <div className="h-32 w-32 rounded-full bg-muted mx-auto" />
      <div className="h-4 w-48 rounded bg-muted mx-auto" />
      <div className="h-12 rounded-lg bg-muted" />
    </div>
  );
}

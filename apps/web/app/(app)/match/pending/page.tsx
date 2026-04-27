import { Suspense } from "react";
import { PendingChallengesContent } from "./pending-challenges-content";

export default function PendingChallengesPage() {
  return (
    <Suspense fallback={<PendingChallengesSkeleton />}>
      <PendingChallengesContent />
    </Suspense>
  );
}

function PendingChallengesSkeleton() {
  return (
    <div className="animate-pulse">
      {/* AppHeader placeholder */}
      <div className="h-14 border-b bg-muted/30" />
      <div className="px-4 pt-6 flex flex-col gap-6">
        {/* Tabs bar */}
        <div className="h-10 rounded-lg bg-muted" />
        {/* Challenge cards */}
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-muted shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 rounded bg-muted" />
              <div className="h-3 w-20 rounded bg-muted" />
            </div>
            <div className="h-5 w-14 rounded-full bg-muted" />
          </div>
        ))}
        {/* Info card */}
        <div className="rounded-lg border p-4 h-20 bg-muted/30" />
      </div>
    </div>
  );
}

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
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="h-10 w-48 rounded bg-muted" />
      <div className="h-16 rounded-lg bg-muted" />
      <div className="h-16 rounded-lg bg-muted" />
      <div className="h-16 rounded-lg bg-muted" />
    </div>
  );
}

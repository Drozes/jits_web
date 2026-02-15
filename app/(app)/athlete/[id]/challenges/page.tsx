import { Suspense } from "react";
import { ChallengesContent } from "./challenges-content";

export default function ChallengesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4 p-6">
          <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
          <div className="h-24 w-full animate-pulse rounded-md bg-muted" />
          <div className="h-24 w-full animate-pulse rounded-md bg-muted" />
        </div>
      }
    >
      <ChallengesContent paramsPromise={params} />
    </Suspense>
  );
}

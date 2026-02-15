import { Suspense } from "react";
import { MatchResultsContent } from "./results-content";

export default function MatchResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ elapsed?: string }>;
}) {
  return (
    <Suspense fallback={<ResultsSkeleton />}>
      <MatchResultsContent
        paramsPromise={params}
        searchParamsPromise={searchParams}
      />
    </Suspense>
  );
}

function ResultsSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse pt-14 px-4 max-w-md mx-auto">
      <div className="h-8 w-40 rounded bg-muted mx-auto" />
      <div className="h-24 rounded-lg bg-muted" />
      <div className="h-32 rounded-lg bg-muted" />
      <div className="h-12 rounded-lg bg-muted" />
    </div>
  );
}

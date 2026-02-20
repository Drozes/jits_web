import { Suspense } from "react";
import { Trophy } from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { ResultsContent } from "./results-content";

export default function MatchResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <>
      <AppHeader
        title="Match Results"
        back
        icon={<Trophy className="h-5 w-5" />}
      />
      <PageContainer className="py-6">
        <Suspense fallback={<ResultsSkeleton />}>
          <ResultsContent paramsPromise={params} />
        </Suspense>
      </PageContainer>
    </>
  );
}

function ResultsSkeleton() {
  return (
    <div className="animate-pulse space-y-6 py-8">
      {/* Outcome heading */}
      <div className="h-7 w-40 mx-auto rounded bg-muted" />
      {/* Result card with participant rows */}
      <div className="rounded-lg border p-4 space-y-4">
        <div className="h-5 w-24 rounded bg-muted" />
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-muted" />
          <div className="h-4 w-32 rounded bg-muted" />
          <div className="ml-auto h-5 w-16 rounded-full bg-muted" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-muted" />
          <div className="h-4 w-28 rounded bg-muted" />
          <div className="ml-auto h-5 w-16 rounded-full bg-muted" />
        </div>
      </div>
      {/* Action buttons */}
      <div className="space-y-3">
        <div className="h-11 rounded-lg bg-muted" />
        <div className="h-11 rounded-lg bg-muted" />
      </div>
    </div>
  );
}

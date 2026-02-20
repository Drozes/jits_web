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
    <div className="animate-pulse space-y-6">
      {/* Result type toggle */}
      <div className="space-y-2">
        <div className="h-4 w-40 rounded bg-muted" />
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/50 p-1.5">
          <div className="h-11 rounded-lg bg-muted" />
          <div className="h-11 rounded-lg bg-muted" />
        </div>
      </div>
      {/* VS athlete cards */}
      <div className="space-y-3">
        <div className="h-4 w-20 rounded bg-muted" />
        <div className="flex gap-3">
          <div className="flex-1 flex flex-col items-center gap-2 rounded-xl border-2 border-muted p-4">
            <div className="h-14 w-14 rounded-full bg-muted" />
            <div className="h-4 w-20 rounded bg-muted" />
            <div className="h-3 w-14 rounded bg-muted" />
          </div>
          <div className="flex-1 flex flex-col items-center gap-2 rounded-xl border-2 border-muted p-4">
            <div className="h-14 w-14 rounded-full bg-muted" />
            <div className="h-4 w-20 rounded bg-muted" />
            <div className="h-3 w-14 rounded bg-muted" />
          </div>
        </div>
      </div>
      {/* Submit button */}
      <div className="h-12 rounded-lg bg-muted" />
    </div>
  );
}

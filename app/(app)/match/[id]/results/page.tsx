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
        <Suspense
          fallback={
            <div className="animate-pulse space-y-6 py-8">
              <div className="h-8 w-32 mx-auto rounded bg-muted" />
              <div className="h-48 rounded-lg bg-muted" />
              <div className="h-12 rounded-lg bg-muted" />
            </div>
          }
        >
          <ResultsContent paramsPromise={params} />
        </Suspense>
      </PageContainer>
    </>
  );
}

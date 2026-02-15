import { Suspense } from "react";
import { Timer } from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { LiveMatchContent } from "./live-match-content";

export default function LiveMatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <>
      <AppHeader title="Live Match" icon={<Timer className="h-5 w-5" />} />
      <PageContainer className="py-6">
        <Suspense
          fallback={
            <div className="animate-pulse space-y-6 py-8 text-center">
              <div className="h-8 w-48 mx-auto rounded bg-muted" />
              <div className="h-24 w-40 mx-auto rounded bg-muted" />
              <div className="h-12 rounded-lg bg-muted" />
            </div>
          }
        >
          <LiveMatchContent paramsPromise={params} />
        </Suspense>
      </PageContainer>
    </>
  );
}

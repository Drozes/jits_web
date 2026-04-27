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
        <Suspense fallback={<LiveMatchSkeleton />}>
          <LiveMatchContent paramsPromise={params} />
        </Suspense>
      </PageContainer>
    </>
  );
}

function LiveMatchSkeleton() {
  return (
    <div className="animate-pulse space-y-6 py-8 text-center">
      {/* "Name vs Name" text + badge */}
      <div className="space-y-2">
        <div className="h-4 w-48 mx-auto rounded bg-muted" />
        <div className="h-5 w-16 mx-auto rounded-full bg-muted" />
      </div>
      {/* Timer display */}
      <div className="h-20 w-36 mx-auto rounded-lg bg-muted" />
      {/* Start/End match button */}
      <div className="h-11 rounded-lg bg-muted" />
    </div>
  );
}

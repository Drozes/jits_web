import { Suspense } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { JoinContent } from "./join-content";

export default function SessionJoinPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <>
      <AppHeader title="Join Session" back />
      <PageContainer className="py-6">
        <Suspense fallback={<JoinSkeleton />}>
          <JoinContent paramsPromise={params} />
        </Suspense>
      </PageContainer>
    </>
  );
}

function JoinSkeleton() {
  return (
    <div className="animate-pulse space-y-6 py-8">
      {/* Progress dots */}
      <div className="flex justify-center gap-2">
        <div className="h-2.5 w-2.5 rounded-full bg-muted" />
        <div className="h-2.5 w-2.5 rounded-full bg-muted" />
        <div className="h-2.5 w-2.5 rounded-full bg-muted" />
        <div className="h-2.5 w-2.5 rounded-full bg-muted" />
      </div>
      {/* Card placeholder */}
      <div className="rounded-2xl border p-6 space-y-4">
        <div className="h-6 w-32 mx-auto rounded bg-muted" />
        <div className="h-4 w-48 mx-auto rounded bg-muted" />
        <div className="h-20 rounded bg-muted" />
      </div>
      {/* Button placeholder */}
      <div className="h-11 rounded-xl bg-muted" />
    </div>
  );
}

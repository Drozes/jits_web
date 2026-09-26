import { Suspense } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { MatchDetailContent } from "./match-detail-content";

export default function MatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<MatchDetailSkeleton />}>
      <MatchDetailContent paramsPromise={params} />
    </Suspense>
  );
}

function MatchDetailSkeleton() {
  return (
    <>
      <AppHeader title="Match" back />
      <div
        className="flex flex-col animate-pulse"
        role="status"
        aria-label="Loading match"
        style={{ gap: "var(--space-3)", padding: "var(--space-4) var(--space-3)" }}
      >
        <div style={{ height: 132, background: "var(--bg-elevated)", borderRadius: "var(--radius-md)" }} />
        <div style={{ height: 56, background: "var(--bg-elevated)", borderRadius: "var(--radius-md)" }} />
        <div
          className="aspect-video w-full"
          style={{ background: "var(--bg-elevated)", borderRadius: "var(--radius-md)" }}
        />
      </div>
    </>
  );
}

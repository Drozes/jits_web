import { Suspense } from "react";
import { AthleteProfileContent } from "./athlete-profile-content";

export default function AthleteProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<AthleteProfileSkeleton />}>
      <AthleteProfileContent paramsPromise={params} />
    </Suspense>
  );
}

function AthleteProfileSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="h-14 bg-muted" />
      <div className="px-4 flex flex-col gap-6">
        <div className="h-48 rounded-lg bg-muted" />
        <div className="flex gap-2">
          <div className="h-10 flex-1 rounded-lg bg-muted" />
          <div className="h-10 flex-1 rounded-lg bg-muted" />
        </div>
        <div className="h-6 w-40 rounded bg-muted" />
        <div className="h-16 rounded-lg bg-muted" />
        <div className="h-16 rounded-lg bg-muted" />
        <div className="h-16 rounded-lg bg-muted" />
      </div>
    </div>
  );
}

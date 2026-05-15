import { Suspense } from "react";
import { AppHeader } from "@/components/layout/app-header";
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
    <>
      <AppHeader title="Athlete" back />
      <div className="flex flex-col animate-pulse">
        <div style={{ height: 240, background: "var(--bg-elevated)" }} />
        <div
          className="grid grid-cols-4"
          style={{
            gap: 1,
            background: "var(--border-hairline)",
            borderBottom: "1px solid var(--border-hairline)",
          }}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              style={{ height: 64, background: "var(--bg-elevated)" }}
            />
          ))}
        </div>
      </div>
    </>
  );
}

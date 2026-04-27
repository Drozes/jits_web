import { Suspense } from "react";
import { Users } from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { SessionLobbyContent } from "./session-lobby-content";

export default function SessionLobbyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <>
      <AppHeader title="Session Lobby" icon={<Users className="h-5 w-5" />} />
      <PageContainer className="py-6">
        <Suspense fallback={<LobbySkeletonGrid />}>
          <SessionLobbyContent paramsPromise={params} />
        </Suspense>
      </PageContainer>
    </>
  );
}

function LobbySkeletonGrid() {
  return (
    <div className="space-y-4">
      <div className="animate-pulse space-y-1">
        <div className="h-5 w-40 rounded bg-muted" />
        <div className="h-4 w-24 rounded bg-muted" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-lg border p-3 space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-muted" />
              <div className="h-4 w-20 rounded bg-muted" />
            </div>
            <div className="h-3 w-16 rounded bg-muted" />
            <div className="h-8 rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}

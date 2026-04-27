import { Suspense } from "react";
import { Swords } from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { LobbyContent } from "./lobby-content";

export default function MatchLobbyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <>
      <AppHeader title="Match Lobby" back icon={<Swords className="h-5 w-5" />} />
      <PageContainer className="py-6">
        <Suspense fallback={<LobbySkeleton />}>
          <LobbyContent paramsPromise={params} />
        </Suspense>
      </PageContainer>
    </>
  );
}

function LobbySkeleton() {
  return (
    <div className="animate-pulse space-y-6 py-8">
      {/* VS header: two athlete columns with VS in between */}
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-center gap-2 flex-1">
          <div className="h-16 w-16 rounded-full bg-muted" />
          <div className="h-4 w-20 rounded bg-muted" />
          <div className="h-5 w-14 rounded-full bg-muted" />
        </div>
        <div className="h-7 w-8 rounded bg-muted" />
        <div className="flex flex-col items-center gap-2 flex-1">
          <div className="h-16 w-16 rounded-full bg-muted" />
          <div className="h-4 w-20 rounded bg-muted" />
          <div className="h-5 w-14 rounded-full bg-muted" />
        </div>
      </div>
      {/* Match type badge */}
      <div className="flex justify-center">
        <div className="h-5 w-24 rounded-full bg-muted" />
      </div>
      {/* ELO stakes card */}
      <div className="rounded-lg border p-4 space-y-2">
        <div className="h-3 w-16 mx-auto rounded bg-muted" />
        <div className="flex justify-center gap-4">
          <div className="h-4 w-16 rounded bg-muted" />
          <div className="h-4 w-16 rounded bg-muted" />
          <div className="h-4 w-16 rounded bg-muted" />
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

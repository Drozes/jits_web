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
        <Suspense
          fallback={
            <div className="animate-pulse space-y-6 py-8">
              <div className="h-32 rounded-lg bg-muted" />
              <div className="h-16 rounded-lg bg-muted" />
              <div className="h-12 rounded-lg bg-muted" />
            </div>
          }
        >
          <LobbyContent paramsPromise={params} />
        </Suspense>
      </PageContainer>
    </>
  );
}

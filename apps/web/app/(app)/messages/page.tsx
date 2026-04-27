import { Suspense } from "react";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { getConversations } from "@/lib/api/chat-queries";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeaderActions } from "@/components/layout/page-header-actions";
import { InboxContent } from "./inbox-content";

function InboxSkeleton() {
  return (
    <div className="flex flex-col gap-3 animate-pulse">
      <div className="h-8 w-32 bg-muted rounded" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3">
          <div className="h-10 w-10 rounded-full bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-24 bg-muted rounded" />
            <div className="h-3 w-40 bg-muted rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function MessagesPage() {
  return (
    <>
      <AppHeader title="Messages" rightAction={<PageHeaderActions />} />
      <PageContainer className="pt-6">
        <Suspense fallback={<InboxSkeleton />}>
          <InboxData />
        </Suspense>
      </PageContainer>
    </>
  );
}

async function InboxData() {
  const { athlete } = await requireAthlete();
  const supabase = await createClient();
  const conversations = await getConversations(supabase);

  return (
    <InboxContent
      conversations={conversations}
      currentAthleteId={athlete.id}
    />
  );
}

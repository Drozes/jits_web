import { Suspense } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { getNotificationHistory } from "@jits/shared/api/queries";
import { NotificationList } from "./notification-list";

function NotificationsSkeleton() {
  return (
    <div className="flex flex-col gap-3 animate-pulse pt-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3">
          <div className="h-9 w-9 rounded-full bg-muted" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 w-32 rounded bg-muted" />
            <div className="h-3 w-48 rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function NotificationsPage() {
  // The guard runs inside the Suspense'd <NotificationsContent/>. Awaiting it
  // here, outside <Suspense>, accesses uncached data and breaks Next 16
  // cacheComponents prerender (jits-v0n).
  return (
    <>
      <AppHeader title="Notifications" back />
      <PageContainer className="pt-2">
        <Suspense fallback={<NotificationsSkeleton />}>
          <NotificationsContent />
        </Suspense>
      </PageContainer>
    </>
  );
}

async function NotificationsContent() {
  const { athlete } = await requireAthlete();
  const supabase = await createClient();
  const items = await getNotificationHistory(supabase, athlete.id, 50);

  return <NotificationList items={items} />;
}

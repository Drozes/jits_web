import { Suspense } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { NotificationToggles } from "./notification-toggles";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { getNotificationPreferences } from "@jits/shared/api/mutations";

export default function NotificationsPage() {
  return (
    <>
      <AppHeader title="Notification Preferences" back />
      <PageContainer className="pt-6">
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
  const prefs = await getNotificationPreferences(supabase);

  return <NotificationToggles athleteId={athlete.id} initialPrefs={prefs} />;
}

function NotificationsSkeleton() {
  return (
    <div className="flex flex-col gap-4 animate-pulse">
      <div className="h-5 w-48 rounded bg-muted" />
      <div className="flex flex-col gap-1">
        <div className="h-16 rounded-lg bg-muted" />
        <div className="h-16 rounded-lg bg-muted" />
        <div className="h-16 rounded-lg bg-muted" />
      </div>
    </div>
  );
}

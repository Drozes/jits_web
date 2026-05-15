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
      <AppHeader title="Notifications" back />
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
    <div
      className="flex flex-col animate-pulse"
      style={{ gap: "var(--space-3)" }}
    >
      <div
        style={{
          height: 220,
          borderRadius: "var(--radius-md)",
          background: "var(--bg-elevated)",
        }}
      />
    </div>
  );
}

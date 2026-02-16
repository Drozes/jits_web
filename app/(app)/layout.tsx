import { Suspense } from "react";
import { BottomNavBar } from "@/components/layout/bottom-nav-bar";
import { HeaderUserButton } from "@/components/layout/header-user-button";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { GlobalNotificationsProvider } from "@/components/layout/global-notifications-provider";
import { NotificationBell } from "@/components/domain/notification-bell";
import { getActiveAthlete } from "@/lib/guards";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        title="Jits"
        rightAction={
          <div className="flex items-center gap-1">
            <Suspense>
              <HeaderNotificationBell />
            </Suspense>
            <Suspense>
              <HeaderUserButton />
            </Suspense>
          </div>
        }
      />
      <PageContainer className="py-6">
        {children}
      </PageContainer>
      <Suspense>
        <BottomNavBar />
      </Suspense>
      <Suspense>
        <NotificationsBootstrap />
      </Suspense>
    </div>
  );
}

async function HeaderNotificationBell() {
  const athlete = await getActiveAthlete();
  if (!athlete) return null;
  return <NotificationBell athleteId={athlete.id} />;
}

async function NotificationsBootstrap() {
  const athlete = await getActiveAthlete();
  if (!athlete) return null;
  return <GlobalNotificationsProvider athleteId={athlete.id} />;
}

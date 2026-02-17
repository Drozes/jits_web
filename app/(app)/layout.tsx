import { Suspense } from "react";
import { BottomNavBar } from "@/components/layout/bottom-nav-bar";
import { GlobalNotificationsProvider } from "@/components/layout/global-notifications-provider";
import { OnlinePresenceBootstrap } from "@/components/layout/online-presence-bootstrap";
import { DeploymentCheckBootstrap } from "@/components/layout/deployment-check-bootstrap";
import { getActiveAthlete } from "@/lib/guards";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      {children}
      <Suspense>
        <BottomNavBar />
      </Suspense>
      <Suspense>
        <NotificationsBootstrap />
      </Suspense>
      <Suspense>
        <PresenceBootstrap />
      </Suspense>
      <DeploymentCheckBootstrap />
    </div>
  );
}

async function NotificationsBootstrap() {
  const athlete = await getActiveAthlete();
  if (!athlete) return null;
  return <GlobalNotificationsProvider athleteId={athlete.id} />;
}

async function PresenceBootstrap() {
  const athlete = await getActiveAthlete();
  if (!athlete) return null;
  return (
    <OnlinePresenceBootstrap
      athleteId={athlete.id}
      displayName={athlete.display_name}
      profilePhotoUrl={athlete.profile_photo_url}
    />
  );
}

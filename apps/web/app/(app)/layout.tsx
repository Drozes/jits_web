import { Suspense } from "react";
import { BottomNavBar } from "@/components/layout/bottom-nav-bar";
import { SidebarRail } from "@/components/layout/sidebar-rail";
import {
  SidebarFooter,
  SidebarFooterSkeleton,
} from "@/components/layout/sidebar-footer";
import { GlobalNotificationsProvider } from "@/components/layout/global-notifications-provider";
import { OnlinePresenceBootstrap } from "@/components/layout/online-presence-bootstrap";
import { DeploymentCheckBootstrap } from "@/components/layout/deployment-check-bootstrap";
import { PushRegistrationBootstrap } from "@/components/layout/push-registration-bootstrap";
import { getActiveAthlete } from "@/lib/guards";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen" style={{ background: "var(--bg-primary)" }}>
      {/* >= lg: persistent left rail beside the content column. The rail is a
          real flex item, so on immersive routes (rail returns null) the content
          reflows to full width with no leftover gutter. */}
      <div className="lg:flex">
        {/* Suspense required: SidebarRail reads usePathname (dynamic under
            cacheComponents), same as BottomNavBar below. Suspense is
            transparent in the DOM, so the aside stays a direct flex child. */}
        <Suspense>
          <SidebarRail
            footer={
              <Suspense fallback={<SidebarFooterSkeleton />}>
                <SidebarFooter />
              </Suspense>
            }
          />
        </Suspense>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
      <Suspense>
        <BottomNavBar />
      </Suspense>
      <Suspense>
        <NotificationsBootstrap />
      </Suspense>
      <Suspense>
        <PresenceBootstrap />
      </Suspense>
      <Suspense>
        <PushBootstrap />
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

async function PushBootstrap() {
  const athlete = await getActiveAthlete();
  if (!athlete) return null;
  return <PushRegistrationBootstrap athleteId={athlete.id} />;
}

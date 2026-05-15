import { Suspense } from "react";
import { HeaderUserButton } from "@/components/layout/header-user-button";
import { NotificationBell } from "@/components/domain/notification-bell";
import { getActiveAthlete } from "@/lib/guards";

async function HeaderNotificationBell() {
  const athlete = await getActiveAthlete();
  if (!athlete) return null;
  return <NotificationBell athleteId={athlete.id} />;
}

export function PageHeaderActions() {
  return (
    <div className="flex items-center gap-1">
      <Suspense>
        <HeaderNotificationBell />
      </Suspense>
      <Suspense>
        <HeaderUserButton />
      </Suspense>
    </div>
  );
}

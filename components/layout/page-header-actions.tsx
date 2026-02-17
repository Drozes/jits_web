import { Suspense } from "react";
import { HeaderUserButton } from "@/components/layout/header-user-button";
import { NotificationBell } from "@/components/domain/notification-bell";
import { PremiumButton } from "@/components/domain/premium-features-modal";
import { getActiveAthlete } from "@/lib/guards";

async function HeaderNotificationBell() {
  const athlete = await getActiveAthlete();
  if (!athlete) return null;
  return <NotificationBell athleteId={athlete.id} />;
}

export function PageHeaderActions() {
  return (
    <div className="flex items-center gap-1">
      <PremiumButton />
      <Suspense>
        <HeaderNotificationBell />
      </Suspense>
      <Suspense>
        <HeaderUserButton />
      </Suspense>
    </div>
  );
}

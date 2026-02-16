"use client";

import { useGlobalNotifications } from "@/hooks/use-global-notifications";

export function GlobalNotificationsProvider({
  athleteId,
}: {
  athleteId: string;
}) {
  useGlobalNotifications(athleteId);
  return null;
}

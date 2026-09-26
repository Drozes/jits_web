"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { showNotification } from "@/lib/notifications";
import { refreshUnreadCounts } from "@/hooks/use-unread-count";
import { useGlobalNotifications } from "@jits/shared/hooks/use-global-notifications";

export function GlobalNotificationsProvider({
  athleteId,
}: {
  athleteId: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const pathname = usePathname();

  useGlobalNotifications({
    supabase,
    currentAthleteId: athleteId,
    notify: showNotification,
    getCurrentRoute: () => pathname,
    onUnreadRefresh: refreshUnreadCounts,
    buildMessageHref: (conversationId) => `/messages/${conversationId}`,
    // The Arena handshake owns accepted/declined (it enters the match and
    // toasts a decline itself). /match/lobby is a hidden route that redirects
    // to "/", which pulled the athlete out of the ready check.
    challengeOutcomeToasts: false,
  });
  return null;
}

import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { getNotificationHistory } from "@jits/shared/api/queries";
import type { NotificationItem } from "@jits/shared/types/notification";

/**
 * Fetches notification history for the given athlete.
 * Refetches on `refresh()` calls (e.g. when the panel opens).
 */
export function useNotificationHistory(athleteId: string | undefined) {
  const [items, setItems] = React.useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);

  const fetch = React.useCallback(async () => {
    if (!athleteId) return;
    setIsLoading(true);
    try {
      const result = await getNotificationHistory(supabase, athleteId, 30);
      setItems(result);
    } finally {
      setIsLoading(false);
    }
  }, [athleteId]);

  React.useEffect(() => {
    void fetch();
  }, [fetch]);

  return { items, isLoading, refresh: fetch };
}

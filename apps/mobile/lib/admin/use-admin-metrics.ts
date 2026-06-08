import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { getAdminMetrics, type AdminMetrics } from "@jits/shared/api/queries";

interface UseAdminMetricsResult {
  metrics: AdminMetrics | null;
  isLoading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Loads platform-wide counters via `get_admin_metrics`. Cancellation flag gates
 * state writes per the mobile async pattern (use-match-details.ts).
 */
export function useAdminMetrics(): UseAdminMetricsResult {
  const [metrics, setMetrics] = React.useState<AdminMetrics | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    (async () => {
      const result = await getAdminMetrics(supabase);
      if (cancelled) return;
      if (result.ok) {
        setMetrics(result.data);
      } else {
        setMetrics(null);
        setError(result.error.message);
      }
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [tick]);

  const reload = React.useCallback(() => setTick((n) => n + 1), []);

  return { metrics, isLoading, error, reload };
}

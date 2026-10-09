import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { getDashboardSummary } from "@jits/shared/api/queries";
import type { DashboardSummary } from "@jits/shared/types/composites";
import { useCachedResource } from "@/lib/cache/use-cached-resource";
import { toast } from "@/components/ui/toast";

export interface DashboardData {
  summary: DashboardSummary;
}

/** The one cache key for `get_dashboard_summary`, shared by Home and Your numbers. */
export function dashboardCacheKey(athleteId: string | undefined): string {
  return `dashboard:${athleteId}`;
}

export interface UseDashboardSummaryOptions {
  /**
   * Skip the "Could not load dashboard" toast. The Your numbers sheet shows
   * its own inline error; Home keeps the toast.
   */
  quiet?: boolean;
}

/**
 * The athlete's dashboard summary (stats, rank, recent matches, activity)
 * through ONE cache entry, so Home and the header's Your numbers sheet share
 * a single read: whichever mounts second paints warm and revalidates.
 */
export function useDashboardSummary(athleteId: string | undefined, options: UseDashboardSummaryOptions = {}) {
  const quiet = options.quiet === true;
  const { data, isLoading, isValidating, error, refresh } = useCachedResource<DashboardData>(
    dashboardCacheKey(athleteId),
    async (_signal) => ({ summary: await getDashboardSummary(supabase) }),
    [athleteId],
  );

  React.useEffect(() => {
    if (error && !quiet) toast.error("Could not load dashboard");
  }, [error, quiet]);

  return { data, isLoading, isValidating, error, refresh };
}

import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { adminListNoMatchVideos, type NoMatchVideoRow } from "@jits/shared/api/queries";

interface UseAdminNoMatchVideosResult {
  rows: NoMatchVideoRow[];
  isLoading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Admin-only: recent videos whose analysis found no match
 * (`admin_list_no_match_videos`, backend default window of 30 days).
 * Cancellation flag gates state writes like the other admin hooks.
 */
export function useAdminNoMatchVideos(): UseAdminNoMatchVideosResult {
  const [rows, setRows] = React.useState<NoMatchVideoRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    (async () => {
      const result = await adminListNoMatchVideos(supabase);
      if (cancelled) return;
      if (result.ok) {
        setRows(result.data);
      } else {
        setRows([]);
        setError(result.error.message);
      }
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const reload = React.useCallback(() => setTick((n) => n + 1), []);
  return { rows, isLoading, error, reload };
}

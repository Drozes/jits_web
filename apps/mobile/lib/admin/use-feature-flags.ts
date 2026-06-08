import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { listFeatureFlags, type FeatureFlagRow } from "@jits/shared/api/queries";
import { setFeatureFlag } from "@jits/shared/api/mutations";

interface UseFeatureFlagsResult {
  flags: FeatureFlagRow[];
  isLoading: boolean;
  /** Optimistically flip a flag, persist via RPC, and roll back on error.
   *  Returns the domain error message on failure, or null on success. */
  toggle: (key: string, enabled: boolean) => Promise<string | null>;
}

/**
 * Loads the feature_flags table and exposes an optimistic `toggle`. The toggle
 * flips local state immediately, calls `admin_set_feature_flag`, and rolls back
 * (restoring the prior value) if the RPC fails. Cancellation flag gates the
 * initial-load state write per the mobile async pattern.
 */
export function useFeatureFlags(): UseFeatureFlagsResult {
  const [flags, setFlags] = React.useState<FeatureFlagRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    (async () => {
      const rows = await listFeatureFlags(supabase);
      if (cancelled) return;
      setFlags(rows);
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = React.useCallback(
    async (key: string, enabled: boolean): Promise<string | null> => {
      setFlags((prev) =>
        prev.map((f) => (f.key === key ? { ...f, enabled } : f)),
      );

      const result = await setFeatureFlag(supabase, { key, enabled });
      if (!result.ok) {
        setFlags((prev) =>
          prev.map((f) => (f.key === key ? { ...f, enabled: !enabled } : f)),
        );
        return result.error.message;
      }
      return null;
    },
    [],
  );

  return { flags, isLoading, toggle };
}

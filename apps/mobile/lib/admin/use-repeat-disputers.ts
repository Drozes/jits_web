import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { listRepeatDisputers, type RepeatDisputerRow } from "@jits/shared/api/queries";

export const REPEAT_DISPUTERS_OUTDATED =
  "This needs the latest backend. The repeat-disputer list isn't available on this server yet.";

interface UseRepeatDisputersResult {
  rows: RepeatDisputerRow[];
  isLoading: boolean;
  error: string | null;
  /** The server said the caller is not an admin: the screen redirects. */
  notAdmin: boolean;
  reload: () => void;
}

/**
 * Admin-only: athletes flagged for repeat disputing (`admin_list_repeat_disputers`,
 * jr_be-ahn.6: 3+ disputes resolved against them in a rolling 30 days).
 * Cancellation flag gates state writes like the other admin hooks.
 */
export function useRepeatDisputers(): UseRepeatDisputersResult {
  const [rows, setRows] = React.useState<RepeatDisputerRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [notAdmin, setNotAdmin] = React.useState(false);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    (async () => {
      const result = await listRepeatDisputers(supabase);
      if (cancelled) return;
      if (result.ok) {
        setRows(result.data);
        setNotAdmin(false);
      } else {
        setRows([]);
        setNotAdmin(result.error.code === "NOT_ADMIN");
        // Never PostgREST's raw text.
        setError(
          result.error.code === "RPC_MISSING"
            ? REPEAT_DISPUTERS_OUTDATED
            : result.error.code === "UNKNOWN"
              ? "Couldn't load repeat disputers. Try again."
              : result.error.message,
        );
      }
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const reload = React.useCallback(() => setTick((n) => n + 1), []);
  return { rows, isLoading, error, notAdmin, reload };
}

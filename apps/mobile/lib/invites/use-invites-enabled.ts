import * as React from "react";
import { isInvitesEnabled } from "@jits/shared/api/invites";
import { supabase } from "@/lib/supabase/client";

let cached: boolean | null = null;

/**
 * `invites_enabled` (contract 1). Fail-closed: false until read, and on any
 * error. Read once per app run; every entry point is hidden while false.
 */
export function useInvitesEnabled(): boolean {
  const [enabled, setEnabled] = React.useState<boolean>(cached ?? false);
  React.useEffect(() => {
    if (cached !== null) return;
    let cancelled = false;
    void isInvitesEnabled(supabase).then((on) => {
      cached = on;
      if (!cancelled) setEnabled(on);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return enabled;
}

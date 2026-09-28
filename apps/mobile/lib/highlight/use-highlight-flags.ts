import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { getHighlightFlags, type HighlightFlags } from "@jits/shared/api/highlight-share";

const CLOSED: HighlightFlags = { clipsEnabled: false, shareEnabled: false };

/**
 * The two highlight flags (`get_highlight_flags`), read once on mount.
 * Fail-closed: both are false until the read lands, and stay false when it
 * fails, so a discovery affordance never flashes in on a flag that is off.
 */
export function useHighlightFlags(): HighlightFlags {
  const [flags, setFlags] = React.useState<HighlightFlags>(CLOSED);
  React.useEffect(() => {
    let cancelled = false;
    void getHighlightFlags(supabase)
      .then((res) => {
        if (cancelled || !res.ok) return;
        const { clipsEnabled, shareEnabled } = res.data;
        // Both-off is the initial state: no re-render for it.
        setFlags((prev) =>
          prev.clipsEnabled === clipsEnabled && prev.shareEnabled === shareEnabled
            ? prev
            : { clipsEnabled, shareEnabled },
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return flags;
}

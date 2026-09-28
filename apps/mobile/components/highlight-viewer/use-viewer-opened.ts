import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { markHighlightSeen, type HighlightShareSourceTag } from "@jits/shared/api/highlight-share";
import { sweepShareCache } from "@/lib/highlight-share";
import { logHighlightEvent } from "@/lib/highlight/log-highlight-event";

/**
 * Side effects of opening the viewer on a playable reel: once per VERSION it
 * marks the reel seen (clears the Home card, bell dot and NEW tag) and logs
 * `viewer_opened` with the entry `source`; once per mount it logs
 * `notification_opened` for a push entry and sweeps the share cache of files
 * older than 24 h. Never on a reel without a live version.
 */
export function useViewerOpened(
  highlightId: string,
  version: number | null,
  source: HighlightShareSourceTag,
): void {
  const seenKey = React.useRef<string | null>(null);
  const mountedOnce = React.useRef(false);

  React.useEffect(() => {
    if (version == null) return;
    const key = `${highlightId}:${version}`;
    if (seenKey.current === key) return;
    seenKey.current = key;
    void markHighlightSeen(supabase, highlightId, version);
    logHighlightEvent(highlightId, "viewer_opened", { source });
    if (mountedOnce.current) return;
    mountedOnce.current = true;
    if (source === "push") logHighlightEvent(highlightId, "notification_opened", { source });
    void sweepShareCache().catch(() => undefined);
  }, [highlightId, version, source]);
}

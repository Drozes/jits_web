import * as React from "react";
import type { HighlightShareSourceTag } from "@jits/shared/api/highlight-share";
import { sweepShareCache, track } from "@/lib/highlight-share";
import { useMarkHighlightSeen } from "@/lib/highlight/use-mark-highlight-seen";

/**
 * Side effects of opening the viewer on a playable reel: once per VERSION it
 * marks the reel seen (clears the Home card, bell dot and NEW tag, through the
 * same hook as the match-detail card) and logs `viewer_opened` with the entry
 * `source`; once per mount it logs `notification_opened` for a push entry and
 * sweeps the share cache of files older than 24 h. Never on a reel without a
 * live version. These are the only funnel steps the viewer logs itself: the
 * share hook logs every share-flow step.
 */
export function useViewerOpened(
  highlightId: string,
  version: number | null,
  source: HighlightShareSourceTag,
): void {
  useMarkHighlightSeen(version == null ? null : highlightId, version);
  const openedKey = React.useRef<string | null>(null);
  const mountedOnce = React.useRef(false);

  React.useEffect(() => {
    if (version == null) return;
    const key = `${highlightId}:${version}`;
    if (openedKey.current === key) return;
    openedKey.current = key;
    track(highlightId, "viewer_opened", { source });
    if (mountedOnce.current) return;
    mountedOnce.current = true;
    if (source === "push") track(highlightId, "notification_opened", { source });
    void sweepShareCache().catch(() => undefined);
  }, [highlightId, version, source]);
}

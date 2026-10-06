import * as React from "react";
import type { HighlightShareSourceTag } from "@jits/shared/api/highlight-share";
import { sweepShareCache, track } from "@/lib/highlight-share";
import { useMarkHighlightSeen } from "@/lib/highlight/use-mark-highlight-seen";

export interface ViewerOpenedOptions {
  /** The page reached by a swipe: `viewer_opened` carries `swiped: true`. */
  swiped?: boolean;
  /**
   * Pager only: true the first time this reel is opened in the pager session,
   * so a page that scrolls out (unmounts) and back logs `viewer_opened` once
   * per reel per session (spec AC 4.5).
   */
  firstOpen?: (highlightId: string) => boolean;
  /** False for a reel that is not the athlete's: never marked seen here (spec 8.3). */
  markSeen?: boolean;
}

/**
 * Side effects of opening the viewer on a playable reel: once per VERSION it
 * marks the reel seen (clears the Home card, bell dot and NEW tag, through the
 * same hook as the match-detail card) and logs `viewer_opened` with the entry
 * `source`; once per mount it logs `notification_opened` for a push entry and
 * sweeps the share cache of files older than 24 h. Never on a reel without a
 * live version, and in the pager only for the VISIBLE page (pass a null
 * version for the others). These are the only funnel steps the viewer logs
 * itself: the share hook logs every share-flow step, the pager logs swipes.
 */
export function useViewerOpened(
  highlightId: string,
  version: number | null,
  source: HighlightShareSourceTag,
  { swiped = false, firstOpen, markSeen = true }: ViewerOpenedOptions = {},
): void {
  // Set when the open is counted, so the pager marks a reel seen once per session.
  const [seenVersion, setSeenVersion] = React.useState<number | null>(null);
  useMarkHighlightSeen(markSeen && seenVersion != null ? highlightId : null, seenVersion);
  const openedKey = React.useRef<string | null>(null);
  const mountedOnce = React.useRef(false);
  const firstOpenRef = React.useRef(firstOpen);
  firstOpenRef.current = firstOpen;

  React.useEffect(() => {
    if (version == null) return;
    const key = `${highlightId}:${version}`;
    if (openedKey.current === key) return;
    const isFirstVersion = openedKey.current === null;
    openedKey.current = key;
    // A regeneration landing while watching is a new version: always logged.
    const log = !isFirstVersion || (firstOpenRef.current?.(highlightId) ?? true);
    if (log) setSeenVersion(version);
    if (log) track(highlightId, "viewer_opened", { source, layout: "fullscreen", ...(swiped ? { swiped: true } : {}) });
    if (mountedOnce.current) return;
    mountedOnce.current = true;
    if (source === "push") track(highlightId, "notification_opened", { source });
    void sweepShareCache().catch(() => undefined);
  }, [highlightId, version, source, swiped]);
}

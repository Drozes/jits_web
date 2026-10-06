import * as React from "react";
import type { HighlightShareSourceTag } from "@jits/shared/api/highlight-share";
import { HIGHLIGHT_ERROR_FALLBACK, highlightErrorCopy } from "@/lib/highlight/highlight-copy";
import { useHighlightDetail } from "@/lib/highlight/use-highlight-detail";
import { SHARE_COPY } from "@/lib/highlight-share";
import { ViewerFrame } from "./viewer-frame";
import { ViewerMessage } from "./viewer-states";
import { ViewerReady } from "./viewer-ready";
import { VIEWER_COPY } from "./viewer-copy";
import type { ReelBinding } from "./reel-binding";

const NOOP = () => undefined;

/**
 * One reel page's body, by state (spec 015 section 16.6.2): loading shows the
 * lane's cover (pager) or the empty poster frame; a missing / foreign reel
 * says so with "Back"; clips off is a calm paused state (no playback, nothing
 * marked seen); anything else offers "Try again"; a readable reel follows
 * its progress (`ViewerReady`). Its host draws the header and the theme.
 */
export function ViewerPage({ id, source, binding, onClose }: { id: string | undefined; source: HighlightShareSourceTag; binding: ReelBinding; onClose: () => void }) {
  const { detail, error, loading, reload } = useHighlightDetail(id);
  if (loading && !detail) {
    return <ViewerFrame binding={binding} source={null} playbackFailed={false} onRetry={NOOP} />;
  }
  if (error?.code === "HIGHLIGHT_NOT_FOUND") {
    return (
      <ViewerMessage
        testID="viewer-not-found"
        message={highlightErrorCopy(error)}
        action={{ testID: "viewer-back", label: VIEWER_COPY.back, variant: "secondary", onPress: onClose }}
      />
    );
  }
  if (!detail) {
    return (
      <ViewerMessage
        testID="viewer-error"
        message={HIGHLIGHT_ERROR_FALLBACK}
        action={{ testID: "viewer-retry", label: SHARE_COPY.tryAgain, variant: "primary", onPress: reload }}
      />
    );
  }
  if (!detail.clipsEnabled) return <ViewerMessage testID="viewer-paused" message={VIEWER_COPY.paused} />;
  // Every other state (including no live version yet) follows progress.
  return <ViewerReady detail={detail} source={source} binding={binding} />;
}

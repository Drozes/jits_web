import * as React from "react";
import { Stack, useLocalSearchParams } from "expo-router";
import { ReelPager, ViewerScreen } from "@/components/highlight-viewer/viewer-screen";
import { parseHighlightSource } from "@/lib/highlight/discovery";
import { getReelSession, laneSource, parseReelLane } from "@/lib/highlight/reel-viewer-session";
import { useSuppressUploadStrip } from "@/lib/video/upload-strip-visibility";

/**
 * Full-screen viewer for the athlete's highlight reels.
 *
 * - `/highlight/<id>?source=push|bell|home|profile|match_detail|summary`:
 *   one reel, no swipe. An unknown or missing source counts as `match_detail`.
 * - `/highlight/<id>?source=<lane>&lane=home|matches&session=<token>`: the
 *   shorts-style swipe pager over the lane a carousel opened with
 *   `openReelViewer` (`lib/highlight/reel-viewer-session.ts`). A lane link
 *   whose session is gone (a cold start restored the route) falls back to
 *   the single reel.
 */
export default function HighlightViewerRoute() {
  const { id, source, lane, session } = useLocalSearchParams<{ id: string; source?: string; lane?: string; session?: string }>();
  // Full-screen video: no app-wide upload strip over it (jits-n2im.2).
  useSuppressUploadStrip({ kind: "all" });
  // Read once per mount: the session object stays the same while the route lives.
  const laneKey = parseReelLane(lane);
  const [pager] = React.useState(() => (laneKey ? getReelSession(session) : null));
  // An expired lane link still reports the lane it came from.
  const entry = laneKey ? laneSource(laneKey) : parseHighlightSource(source);
  return (
    <>
      {/* Vertical paging must never fight a full-screen dismiss; the left-edge back swipe stays. */}
      <Stack.Screen options={{ fullScreenGestureEnabled: false }} />
      {pager ? <ReelPager session={pager} /> : <ViewerScreen id={id} source={entry} />}
    </>
  );
}

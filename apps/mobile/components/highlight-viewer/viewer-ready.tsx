import * as React from "react";
import { View } from "react-native";
import type { HighlightDetail, HighlightShareSourceTag } from "@jits/shared/api/highlight-share";
import { useMyHighlight } from "@/lib/highlight/use-my-highlight";
import { useHighlightRating } from "@/lib/highlight/use-highlight-rating";
import { track } from "@/lib/highlight-share";
import { useViewerOpened } from "./use-viewer-opened";
import { useViewerShare } from "./use-viewer-share";
import { ViewerFrame } from "./viewer-frame";
import { ViewerMeta } from "./viewer-meta";
import { ViewerActions } from "./viewer-actions";
import { ViewerProgressState } from "./viewer-progress-state";
import { useViewerRefresh } from "./use-viewer-refresh";
import { ViewerImproveSheet } from "./viewer-improve-sheet";
import { PreShareSheet } from "./pre-share-sheet";
import { ShareSheetBody } from "./share-sheet-body";

/**
 * The reel, following its progress (the phase-1 hook: realtime + 15 s
 * polling while it is moving, re-read on focus and foreground): the LIVE
 * render plays (kept playing while a new version is made, a new version is
 * swapped in place), then meta, the actions, the pre-share sheet and the
 * phase-1 "Improve this reel" sheet. Without a live version a calm state
 * shows until one lands.
 */
export function ViewerReady({ detail, source }: { detail: HighlightDetail; source: HighlightShareSourceTag }) {
  const my = useMyHighlight(detail.matchVideoId);
  useViewerRefresh(my.reload);
  const progress = my.progress;
  const playback = progress?.playback ?? null;
  const version = playback?.version ?? detail.version;
  // Seen / viewer_opened only for a version actually on screen (not a stale detail read).
  useViewerOpened(detail.highlightId, playback?.version ?? null, source);
  const vs = useViewerShare(detail, playback?.durationS ?? null, source);
  const fb = useHighlightRating(detail.highlightId, version, my.refresh);
  const { openImprove } = fb;
  const improve = React.useCallback(() => {
    track(detail.highlightId, "improve_tapped", { source });
    openImprove();
  }, [detail.highlightId, openImprove, source]);

  if (progress && !playback) return <ViewerProgressState phase={progress.phase} />;
  if (!progress) {
    return <ViewerFrame source={null} playbackFailed={false} onPlayerError={my.onPlayerError} onRetry={my.reload} />;
  }
  return (
    <View className="flex-1 gap-3">
      <ViewerFrame source={my.source} playbackFailed={my.playbackFailed} onPlayerError={my.onPlayerError} onRetry={my.reload} />
      <View className="gap-3 px-4">
        <ViewerMeta progress={progress} />
        <ViewerActions
          shareEnabled={detail.shareEnabled}
          primaryPath={vs.share.activePath}
          canSaveToPhotos={vs.share.capabilities?.saveToPhotos ?? false}
          saving={vs.saving}
          savePermissionDenied={vs.savePermissionDenied}
          improveDisabled={!progress || progress.phase === "regenerating"}
          onShare={vs.openSheet}
          onSave={vs.save}
          onImprove={improve}
        />
      </View>
      {detail.shareEnabled ? (
        <PreShareSheet open={vs.sheetOpen} onClosed={vs.onSheetClosed}>
          <ShareSheetBody share={vs.share} onHandoff={vs.handoff} iosReels={vs.iosReels} onCopy={vs.copy} onDone={vs.closeSheet} />
        </PreShareSheet>
      ) : null}
      {progress ? <ViewerImproveSheet fb={fb} progress={progress} /> : null}
    </View>
  );
}

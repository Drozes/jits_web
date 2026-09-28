import * as React from "react";
import { View } from "react-native";
import type { HighlightDetail, HighlightShareSourceTag } from "@jits/shared/api/highlight-share";
import { HIGHLIGHT_COPY } from "@/lib/highlight/highlight-copy";
import { useMyHighlight } from "@/lib/highlight/use-my-highlight";
import { useHighlightRating } from "@/lib/highlight/use-highlight-rating";
import { logHighlightEvent } from "@/lib/highlight/log-highlight-event";
import { useViewerOpened } from "./use-viewer-opened";
import { useViewerShare } from "./use-viewer-share";
import { ViewerFrame } from "./viewer-frame";
import { ViewerMeta } from "./viewer-meta";
import { ViewerActions } from "./viewer-actions";
import { ViewerMessage } from "./viewer-states";
import { ViewerImproveSheet } from "./viewer-improve-sheet";
import { VIEWER_COPY } from "./viewer-copy";
import { PreShareSheet } from "./pre-share-sheet";
import { ShareSheetBody } from "./share-sheet-body";

/**
 * A reel with a live version: the phase-1 progress + signing hook plays the
 * LIVE render (kept playing while a new version is made), then meta, the
 * actions, the pre-share sheet and the phase-1 "Improve this reel" sheet.
 */
export function ViewerReady({ detail, source }: { detail: HighlightDetail; source: HighlightShareSourceTag }) {
  const my = useMyHighlight(detail.matchVideoId);
  const progress = my.progress;
  const playback = progress?.playback ?? null;
  const version = playback?.version ?? detail.version;
  useViewerOpened(detail.highlightId, version, source);
  const vs = useViewerShare(detail, playback?.durationS ?? null, source);
  const fb = useHighlightRating(detail.highlightId, version, my.refresh);
  const { openImprove } = fb;
  const improve = React.useCallback(() => {
    logHighlightEvent(detail.highlightId, "improve_tapped", { source });
    openImprove();
  }, [detail.highlightId, openImprove, source]);

  if (progress && !playback) {
    const paused = progress.phase === "disabled";
    return (
      <ViewerMessage
        testID={paused ? "viewer-paused" : "viewer-invalidated"}
        message={paused ? VIEWER_COPY.paused : HIGHLIGHT_COPY.invalidated}
      />
    );
  }
  return (
    <View className="flex-1 gap-3">
      <ViewerFrame source={my.source} playbackFailed={my.playbackFailed} onPlayerError={my.onPlayerError} onRetry={my.reload} />
      <View className="gap-3 px-4">
        <ViewerMeta progress={progress} />
        <ViewerActions
          shareEnabled={detail.shareEnabled}
          primaryPath={vs.share.primaryPath}
          canSaveToPhotos={vs.share.capabilities?.saveToPhotos ?? false}
          saving={vs.saving}
          savePermissionDenied={vs.share.error?.kind === "permission"}
          improveDisabled={!progress || progress.phase === "regenerating"}
          onShare={vs.openSheet}
          onSave={vs.save}
          onImprove={improve}
        />
      </View>
      {detail.shareEnabled ? (
        <PreShareSheet open={vs.sheetOpen} onClosed={vs.onSheetClosed}>
          <ShareSheetBody share={vs.share} iosReels={vs.iosReels} onCopy={vs.copy} onDone={vs.closeSheet} />
        </PreShareSheet>
      ) : null}
      {progress ? <ViewerImproveSheet fb={fb} progress={progress} /> : null}
    </View>
  );
}

import * as React from "react";
import { Text, View } from "react-native";
import type { HighlightDetail, HighlightShareSourceTag } from "@jits/shared/api/highlight-share";
import { pageMeta } from "@/lib/highlight/reel-meta";
import { ON_MEDIA } from "@/lib/theme/palette";
import { ViewerFrame } from "./viewer-frame";
import { ViewerMeta } from "./viewer-meta";
import { ViewerActions } from "./viewer-actions";
import { ViewerNoPlayback } from "./viewer-progress-state";
import { ViewerSheets } from "./viewer-sheets";
import { ReelOverlay } from "./reel-overlay";
import { ReelScrims } from "./reel-scrims";
import { SwipeHint } from "./swipe-hint";
import { useReelPage } from "./use-reel-page";
import { VIEWER_COPY } from "./viewer-copy";
import type { ReelBinding } from "./reel-binding";

/**
 * The reel, following its progress (realtime + 15 s polling while it is
 * moving, re-read on focus and foreground): the LIVE render edge to edge on
 * the page's pooled player (a new version swaps in place), the scrims, the
 * bottom meta and the right rail (own reels only), the progress bar, and the
 * share / improve sheets. Without a live version a calm state shows until one
 * lands.
 */
export function ViewerReady({ detail, source, binding }: { detail: HighlightDetail; source: HighlightShareSourceTag; binding: ReelBinding }) {
  const { my, vs, fb, improve, shareEnabled } = useReelPage(detail, source, binding);
  const progress = my.progress;
  const playback = progress?.playback ?? null;
  const meta = React.useMemo(() => pageMeta(detail, binding.item), [detail, binding.item]);

  if (!progress || !playback) {
    return <ViewerNoPlayback progress={progress} error={my.progressError} onRetry={my.reload} binding={binding} />;
  }
  const canSaveToPhotos = vs.share.capabilities?.saveToPhotos ?? false;
  const top = binding.showHint ? (
    <SwipeHint />
  ) : binding.caughtUp ? (
    <Text testID="viewer-caught-up" className="font-mono text-caption uppercase tracking-caps text-center tabular-nums" style={{ color: ON_MEDIA.text2 }}>
      {VIEWER_COPY.caughtUp}
    </Text>
  ) : null;
  return (
    <View className="flex-1">
      <ViewerFrame binding={binding} source={my.source} playbackFailed={my.playbackFailed} onRetry={my.reload} />
      <ReelScrims rail={binding.canManage} />
      <ReelOverlay
        pool={binding.pool}
        index={binding.index}
        top={top}
        meta={<ViewerMeta progress={progress} meta={meta} />}
        rail={
          <ViewerActions
            canManage={binding.canManage}
            shareEnabled={shareEnabled}
            primaryPath={vs.share.activePath}
            canSaveToPhotos={canSaveToPhotos}
            saving={vs.saving}
            savePermissionDenied={vs.savePermissionDenied}
            improveDisabled={progress.phase === "regenerating"}
            onShare={vs.openSheet}
            onSave={vs.save}
            onImprove={improve}
          />
        }
      />
      <ViewerSheets canManage={binding.canManage} shareEnabled={shareEnabled} vs={vs} fb={fb} progress={progress} />
    </View>
  );
}

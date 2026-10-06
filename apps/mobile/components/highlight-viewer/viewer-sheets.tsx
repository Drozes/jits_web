import * as React from "react";
import type { HighlightProgress } from "@jits/shared/api/highlights";
import type { UseHighlightRatingResult } from "@/lib/highlight/use-highlight-rating";
import { PreShareSheet } from "./pre-share-sheet";
import { ShareSheetBody } from "./share-sheet-body";
import { ViewerImproveSheet } from "./viewer-improve-sheet";
import type { ViewerShare } from "./use-viewer-share";

/**
 * The page's sheets: pre-share (only while sharing is on) and the phase-1
 * "Improve this reel" sheet. Neither exists on a reel that is not the
 * athlete's (spec 8.6), so nothing can open them.
 */
export function ViewerSheets(props: {
  canManage: boolean;
  shareEnabled: boolean;
  vs: ViewerShare;
  fb: UseHighlightRatingResult;
  progress: HighlightProgress;
}) {
  const { canManage, shareEnabled, vs, fb, progress } = props;
  if (!canManage) return null;
  return (
    <>
      {shareEnabled ? (
        <PreShareSheet open={vs.sheetOpen} onClosed={vs.onSheetClosed}>
          <ShareSheetBody share={vs.share} onHandoff={vs.handoff} iosReels={vs.iosReels} onCopy={vs.copy} onDone={vs.closeSheet} />
        </PreShareSheet>
      ) : null}
      <ViewerImproveSheet fb={fb} progress={progress} />
    </>
  );
}

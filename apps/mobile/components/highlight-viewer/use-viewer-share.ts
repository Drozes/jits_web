import * as React from "react";
import { Platform } from "react-native";
import type { HighlightDetail, HighlightShareSourceTag } from "@jits/shared/api/highlight-share";
import { useHighlightShare, type UseHighlightShareResult } from "@/lib/highlight-share";
import { logHighlightEvent } from "@/lib/highlight/log-highlight-event";
import { toast } from "@/components/ui/toast";
import { VIEWER_COPY } from "./viewer-copy";

export interface ViewerShare {
  share: UseHighlightShareResult;
  sheetOpen: boolean;
  iosReels: boolean;
  saving: boolean;
  openSheet: () => void;
  closeSheet: () => void;
  onSheetClosed: () => void;
  save: () => void;
  copy: () => void;
}

/**
 * The viewer's wiring of `useHighlightShare`: opening the pre-share sheet
 * logs `share_tapped` and calls `start()` (which always asks the server first,
 * so the kill switch holds even on a screen opened before the flip); closing
 * it resets the flow. With sharing off nothing here is reachable (the viewer
 * renders no Share or Save), and the hook itself no-ops as a second guard.
 */
export function useViewerShare(detail: HighlightDetail, durationS: number | null, source: HighlightShareSourceTag): ViewerShare {
  const share = useHighlightShare({
    highlightId: detail.highlightId,
    shareEnabled: detail.shareEnabled,
    durationS,
    captionContext: detail.caption,
    source,
  });
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const { start, reset, saveToPhotos, copyCaption } = share;

  const openSheet = React.useCallback(() => {
    if (!detail.shareEnabled) return;
    logHighlightEvent(detail.highlightId, "share_tapped", { source });
    setSheetOpen(true);
    start();
  }, [detail.highlightId, detail.shareEnabled, source, start]);

  const closeSheet = React.useCallback(() => setSheetOpen(false), []);
  const onSheetClosed = React.useCallback(() => {
    setSheetOpen(false);
    reset();
  }, [reset]);

  const save = React.useCallback(() => {
    if (!detail.shareEnabled || saving) return;
    setSaving(true);
    void saveToPhotos().finally(() => setSaving(false));
  }, [detail.shareEnabled, saving, saveToPhotos]);

  const copy = React.useCallback(() => {
    void copyCaption().then((ok) => {
      if (ok) toast.success(VIEWER_COPY.captionCopied);
    });
  }, [copyCaption]);

  const iosReels = Platform.OS === "ios" && share.primaryPath === "reels";
  return { share, sheetOpen, iosReels, saving, openSheet, closeSheet, onSheetClosed, save, copy };
}

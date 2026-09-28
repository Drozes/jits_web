import * as React from "react";
import { Platform } from "react-native";
import type { HighlightDetail, HighlightShareSourceTag } from "@jits/shared/api/highlight-share";
import {
  REELS_OVERSIZE_WARNING,
  SHARE_COPY,
  useHighlightShare,
  type SaveOutcome,
  type SharePath,
  type UseHighlightShareResult,
} from "@/lib/highlight-share";
import { toast } from "@/components/ui/toast";

export interface ViewerShare {
  share: UseHighlightShareResult;
  sheetOpen: boolean;
  iosReels: boolean;
  saving: boolean;
  /** The last Save to Photos was refused by the Photos permission (inline Settings copy). */
  savePermissionDenied: boolean;
  openSheet: () => void;
  closeSheet: () => void;
  onSheetClosed: () => void;
  handoff: (path: SharePath) => void;
  save: () => void;
  copy: () => void;
}

/** SaveOutcome -> the viewer's toast (permission is inline, `unavailable` is silent). */
function toastSave(outcome: SaveOutcome): void {
  if (outcome.ok) toast.success(SHARE_COPY.saveSuccess);
  else if (outcome.kind === "failed" || outcome.kind === "download") toast.error(SHARE_COPY.saveFailed);
  else if (outcome.kind === "disabled") toast.error(SHARE_COPY.shareDisabled);
  else if (outcome.kind === "not_ready") toast.error(SHARE_COPY.notReady);
}

/**
 * The viewer's wiring of `useHighlightShare`. The hook logs every share-flow
 * step itself (`share_tapped` from `start()`) and shows no toasts; the viewer
 * owns the toasts: "Caption copied", the Reels oversize advisory, and the
 * Save outcome. Opening the sheet calls `start()` (which always asks the
 * server first, so the kill switch holds even on a screen opened before the
 * flip); closing it resets the flow. With sharing off nothing here is
 * reachable (no Share or Save is rendered) and the hook no-ops as well.
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
  const [savePermissionDenied, setSavePermissionDenied] = React.useState(false);
  const { start, reset, saveToPhotos, copyCaption, handoff: shareHandoff } = share;

  const openSheet = React.useCallback(() => {
    if (!detail.shareEnabled) return;
    setSheetOpen(true);
    start();
  }, [detail.shareEnabled, start]);

  const closeSheet = React.useCallback(() => setSheetOpen(false), []);
  const onSheetClosed = React.useCallback(() => {
    setSheetOpen(false);
    reset();
  }, [reset]);

  const handoff = React.useCallback(
    (path: SharePath) => {
      void shareHandoff(path).then((outcome) => {
        if (outcome.ok && outcome.oversize) toast.info(REELS_OVERSIZE_WARNING);
      });
    },
    [shareHandoff],
  );

  const save = React.useCallback(() => {
    if (!detail.shareEnabled || saving) return;
    setSaving(true);
    void saveToPhotos()
      .then((outcome) => {
        setSavePermissionDenied(!outcome.ok && outcome.kind === "permission");
        toastSave(outcome);
      })
      .finally(() => setSaving(false));
  }, [detail.shareEnabled, saving, saveToPhotos]);

  const copy = React.useCallback(() => {
    void copyCaption().then((ok) => {
      if (ok) toast.success(SHARE_COPY.captionCopied);
    });
  }, [copyCaption]);

  // From the EFFECTIVE path: once the flow is rerouted to the share sheet the
  // caption is copyable before the handoff again.
  const iosReels = Platform.OS === "ios" && share.activePath === "reels";
  return { share, sheetOpen, iosReels, saving, savePermissionDenied, openSheet, closeSheet, onSheetClosed, handoff, save, copy };
}

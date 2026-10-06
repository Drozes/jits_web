import * as React from "react";
import type { HighlightDetail, HighlightShareSourceTag } from "@jits/shared/api/highlight-share";
import { useMyHighlight } from "@/lib/highlight/use-my-highlight";
import { useHighlightRating } from "@/lib/highlight/use-highlight-rating";
import { track } from "@/lib/highlight-share";
import { useViewerOpened } from "./use-viewer-opened";
import { useViewerShare } from "./use-viewer-share";
import { useViewerRefresh } from "./use-viewer-refresh";
import type { ReelBinding } from "./reel-binding";

/**
 * One viewer page's wiring: the reel's progress + signed live render
 * (`useMyHighlight`), offered to the page's pooled player; seen and
 * `viewer_opened` for the visible page only; the share flow and the phase-1
 * rating sheet, both forced off when the reel is not the athlete's
 * (`binding.canManage` false); sheet state reported to the pager, which
 * suspends paging while one is open.
 */
export function useReelPage(detail: HighlightDetail, source: HighlightShareSourceTag, binding: ReelBinding) {
  const { pool, index, active, canManage } = binding;
  const my = useMyHighlight(detail.matchVideoId, 0, { preferCached: binding.prefetched });
  useViewerRefresh(my.reload);
  const playback = my.progress?.playback ?? null;
  const version = playback?.version ?? detail.version;
  // Seen / viewer_opened only for a version actually on screen (not a stale detail read).
  useViewerOpened(detail.highlightId, active ? (playback?.version ?? null) : null, source, {
    swiped: binding.swiped,
    firstOpen: binding.firstOpen,
    markSeen: canManage,
  });
  const shareDetail = React.useMemo(
    () => (canManage ? detail : { ...detail, shareEnabled: false }),
    [canManage, detail],
  );
  const vs = useViewerShare(shareDetail, playback?.durationS ?? null, source, playback?.version ?? null);
  const fb = useHighlightRating(detail.highlightId, version, my.refresh);
  const { openImprove } = fb;
  const improve = React.useCallback(() => {
    if (!canManage) return;
    track(detail.highlightId, "improve_tapped", { source });
    openImprove();
  }, [canManage, detail.highlightId, openImprove, source]);

  const src = my.source;
  React.useEffect(() => {
    pool.offer(index, src ? `${detail.highlightId}:${src.version}` : "", src);
  }, [pool, index, detail.highlightId, src]);
  const { onPlayerError } = my;
  React.useEffect(() => {
    pool.onError(index, onPlayerError);
    return () => pool.onError(index, null);
  }, [pool, index, onPlayerError]);

  const modalOpen = vs.sheetOpen || fb.sheetOpen;
  // An open sheet pauses the visible reel until it closes (spec 8.3).
  React.useEffect(() => {
    if (!active || !modalOpen) return;
    pool.setSuspended(true);
    return () => pool.setSuspended(false);
  }, [active, modalOpen, pool]);
  const { onModalChange } = binding;
  React.useEffect(() => {
    if (!onModalChange) return;
    onModalChange(modalOpen);
    return () => {
      if (modalOpen) onModalChange(false);
    };
  }, [modalOpen, onModalChange]);

  return { my, vs, fb, improve, shareEnabled: shareDetail.shareEnabled };
}

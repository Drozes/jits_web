import * as React from "react";
import { StyleSheet, View, type LayoutChangeEvent, type ViewStyle } from "react-native";
import type { HighlightSource } from "@/lib/highlight/use-my-highlight";
import { VIEWER_COPY } from "./viewer-copy";
import { SHARE_COPY } from "@/lib/highlight-share";
import { ViewerMessage, ViewerSkeleton } from "./viewer-states";
import { ReelPosterImage, ReelVideo, type ReelPoster } from "./reel-video";
import type { ReelBinding } from "./reel-binding";

const GUTTER = 16;

/** 9:16 filling the width (16 pt gutters), capped by the available height (the loading skeleton). */
export function fitFrame(width: number, height: number): ViewStyle {
  const w = Math.max(0, Math.min(width - GUTTER * 2, (height * 9) / 16));
  return { width: w, height: (w * 16) / 9, alignSelf: "center" };
}

interface ViewerFrameProps {
  /** Needed to play; absent for the loading frame. */
  binding?: ReelBinding | null;
  source: HighlightSource | null;
  playbackFailed: boolean;
  onRetry: () => void;
}

/**
 * The full-bleed stage behind the viewer's overlays: the pooled player edge
 * to edge, or the lane's cover while the page loads (pager), else the 9:16
 * skeleton; the cannot-play note with "Try again" (re-read + re-sign) when
 * playback failed.
 */
export function ViewerFrame({ binding, source, playbackFailed, onRetry }: ViewerFrameProps) {
  const [size, setSize] = React.useState<{ w: number; h: number } | null>(null);
  const onLayout = React.useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) => (prev && prev.w === width && prev.h === height ? prev : { w: width, h: height }));
  }, []);
  const poster: ReelPoster | null = source ? { url: source.posterUrl, path: source.posterPath } : (binding?.poster ?? null);

  let body: React.ReactNode = null;
  if (playbackFailed) {
    body = (
      <ViewerMessage
        testID="viewer-cannot-play"
        message={VIEWER_COPY.cannotPlay}
        action={{ testID: "viewer-play-retry", label: SHARE_COPY.tryAgain, variant: "secondary", onPress: onRetry }}
      />
    );
  } else if (source && binding) {
    body = <ReelVideo pool={binding.pool} index={binding.index} durationS={source.durationS} poster={poster ?? { url: null, path: null }} />;
  } else if (poster?.url) {
    body = <ReelPosterImage poster={poster} />;
  } else if (size) {
    body = <ViewerSkeleton frameStyle={fitFrame(size.w, size.h)} />;
  }
  return (
    <View testID="viewer-frame" style={[StyleSheet.absoluteFill, { justifyContent: "center" }]} onLayout={onLayout}>
      {body}
    </View>
  );
}

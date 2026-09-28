import * as React from "react";
import { View, type LayoutChangeEvent, type ViewStyle } from "react-native";
import { HighlightPlayer } from "@/components/match-detail/highlight/highlight-player";
import type { HighlightSource } from "@/lib/highlight/use-my-highlight";
import { VIEWER_COPY } from "./viewer-copy";
import { SHARE_COPY } from "@/lib/highlight-share";
import { ViewerMessage, ViewerSkeleton } from "./viewer-states";

const GUTTER = 16;

/** 9:16 filling the width (16 pt gutters), capped by the available height. */
export function fitFrame(width: number, height: number): ViewStyle {
  const w = Math.max(0, Math.min(width - GUTTER * 2, (height * 9) / 16));
  return { width: w, height: (w * 16) / 9, alignSelf: "center" };
}

interface ViewerFrameProps {
  source: HighlightSource | null;
  playbackFailed: boolean;
  onPlayerError: () => void;
  onRetry: () => void;
}

/**
 * The flexible middle of the viewer: measures itself, then shows the phase-1
 * player (same signed-URL renewal: a player error re-signs, a second one
 * reports failure) sized to fit, a poster skeleton while signing, or the
 * cannot-play note with "Try again" (re-read + re-sign).
 */
export function ViewerFrame({ source, playbackFailed, onPlayerError, onRetry }: ViewerFrameProps) {
  const [size, setSize] = React.useState<{ w: number; h: number } | null>(null);
  const onLayout = React.useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) => (prev && prev.w === width && prev.h === height ? prev : { w: width, h: height }));
  }, []);
  const frame = size ? fitFrame(size.w, size.h) : null;

  return (
    <View testID="viewer-frame" className="flex-1 justify-center" onLayout={onLayout}>
      {playbackFailed ? (
        <ViewerMessage
          testID="viewer-cannot-play"
          message={VIEWER_COPY.cannotPlay}
          action={{ testID: "viewer-play-retry", label: SHARE_COPY.tryAgain, variant: "outline", onPress: onRetry }}
        />
      ) : !frame ? null : source ? (
        <HighlightPlayer source={source} onError={onPlayerError} frameStyle={frame} showFullscreenButton={false} />
      ) : (
        <ViewerSkeleton frameStyle={frame} />
      )}
    </View>
  );
}

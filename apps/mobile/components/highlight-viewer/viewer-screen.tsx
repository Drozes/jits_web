import * as React from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { HighlightShareSourceTag } from "@jits/shared/api/highlight-share";
import { darkTokens } from "@/lib/tokens";
import { ForceDarkTheme } from "@/lib/theme/force-dark-theme";
import { HIGHLIGHT_ERROR_FALLBACK, highlightErrorCopy } from "@/lib/highlight/highlight-copy";
import { useHighlightDetail } from "@/lib/highlight/use-highlight-detail";
import { ViewerHeader } from "./viewer-header";
import { ViewerFrame } from "./viewer-frame";
import { ViewerMessage } from "./viewer-states";
import { ViewerReady } from "./viewer-ready";
import { VIEWER_COPY } from "./viewer-copy";
import { SHARE_COPY } from "@/lib/highlight-share";

const NOOP = () => undefined;

/**
 * The full-screen 9:16 viewer for one of the athlete's own reels
 * (spec 015 section 16.6.2). A video surface: the dark "void" tokens in both
 * themes (`ForceDarkTheme`, like the match video player, so themed pieces
 * inside read dark too) and a light status bar. Loading shows the empty poster frame; a missing / foreign reel says
 * so with "Back"; a reel without a live version (video replaced) says a new
 * one is coming; anything else offers "Try again".
 */
export function ViewerScreen({ id, source }: { id: string | undefined; source: HighlightShareSourceTag }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { detail, error, loading, reload } = useHighlightDetail(id);
  // A cold-start push has no back stack: land on Home instead.
  const close = React.useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, [router]);

  let body: React.ReactNode;
  if (loading && !detail) {
    body = <ViewerFrame source={null} playbackFailed={false} onPlayerError={NOOP} onRetry={NOOP} />;
  } else if (error?.code === "HIGHLIGHT_NOT_FOUND") {
    body = (
      <ViewerMessage
        testID="viewer-not-found"
        message={highlightErrorCopy(error)}
        action={{ testID: "viewer-back", label: VIEWER_COPY.back, variant: "outline", onPress: close }}
      />
    );
  } else if (!detail) {
    body = (
      <ViewerMessage
        testID="viewer-error"
        message={HIGHLIGHT_ERROR_FALLBACK}
        action={{ testID: "viewer-retry", label: SHARE_COPY.tryAgain, variant: "primary", onPress: reload }}
      />
    );
  } else if (!detail.clipsEnabled) {
    // Clips are off: a calm paused state, no playback, nothing marked seen.
    body = <ViewerMessage testID="viewer-paused" message={VIEWER_COPY.paused} />;
  } else {
    // Every other state (including no live version yet) follows progress.
    body = <ViewerReady detail={detail} source={source} />;
  }

  return (
    <ForceDarkTheme style={{ backgroundColor: darkTokens.bgPrimary }}>
      <StatusBar style="light" />
      <View
        testID="highlight-viewer"
        className="flex-1"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 8 }}
      >
        <ViewerHeader onClose={close} />
        {body}
      </View>
    </ForceDarkTheme>
  );
}

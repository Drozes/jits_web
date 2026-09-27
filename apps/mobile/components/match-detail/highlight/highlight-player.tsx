import * as React from "react";
import { Pressable, View } from "react-native";
import { Image } from "expo-image";
import { VideoView } from "expo-video";
import { Maximize2 } from "lucide-react-native";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { HIGHLIGHT_COPY, playerLabel } from "@/lib/highlight/highlight-copy";
import { useHighlightPlayer } from "@/lib/highlight/use-highlight-player";
import type { HighlightSource } from "@/lib/highlight/use-my-highlight";
import { HIGHLIGHT_FRAME_STYLE } from "./highlight-frame";

const FILL = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const;

interface HighlightPlayerProps {
  source: HighlightSource;
  onError: () => void;
}

/**
 * The reel, in-app only: tap toggles play/pause, the poster covers the frame
 * until the first frame renders, native fullscreen is allowed. PiP is off and
 * there is deliberately NO share / save / export affordance.
 */
export function HighlightPlayer({ source, onError }: HighlightPlayerProps) {
  const tokens = useThemedTokens();
  const viewRef = React.useRef<VideoView>(null);
  const [firstFrame, setFirstFrame] = React.useState(false);
  const player = useHighlightPlayer(source.url, onError);
  React.useEffect(() => setFirstFrame(false), [player]);

  const toggle = React.useCallback(() => {
    if (player.playing) player.pause();
    else player.play();
  }, [player]);

  return (
    <View testID="highlight-player" className="bg-surface-4 overflow-hidden rounded-md" style={HIGHLIGHT_FRAME_STYLE}>
      <Pressable
        testID="highlight-player-toggle"
        accessibilityRole="button"
        accessibilityLabel={playerLabel(source.durationS)}
        accessibilityHint="Plays or pauses the reel"
        onPress={toggle}
        style={{ flex: 1 }}
      >
        <VideoView
          key={source.generation}
          ref={viewRef}
          player={player}
          style={{ flex: 1 }}
          contentFit="contain"
          nativeControls={false}
          fullscreenOptions={{ enable: true }}
          allowsPictureInPicture={false}
          onFirstFrameRender={() => setFirstFrame(true)}
        />
        {source.posterUrl && !firstFrame ? (
          <Image
            testID="highlight-poster"
            source={{ uri: source.posterUrl, cacheKey: `highlight-poster-${source.version}` }}
            style={FILL}
            contentFit="contain"
            pointerEvents="none"
          />
        ) : null}
      </Pressable>
      <Pressable
        testID="highlight-fullscreen"
        accessibilityRole="button"
        accessibilityLabel={HIGHLIGHT_COPY.fullscreen}
        hitSlop={10}
        onPress={() => void viewRef.current?.enterFullscreen().catch(() => undefined)}
        className="absolute right-2 bottom-2 p-2 bg-surface-3 border border-hairline rounded-xs"
      >
        <Maximize2 size={16} color={tokens.textPrimary} />
      </Pressable>
    </View>
  );
}

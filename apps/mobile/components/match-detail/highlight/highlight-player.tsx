import * as React from "react";
import { Pressable, View } from "react-native";
import { Image } from "expo-image";
import { VideoView } from "expo-video";
import { playerLabel } from "@/lib/highlight/highlight-copy";
import { useHighlightPlayer } from "@/lib/highlight/use-highlight-player";
import type { HighlightSource } from "@/lib/highlight/use-my-highlight";
import { HIGHLIGHT_FRAME_STYLE } from "./highlight-frame";
import { HighlightFullscreenButton } from "./highlight-fullscreen-button";

const FILL = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const;

/** Cached by the render-unique storage key: re-signs reuse it, matches never share it. */
function posterSource({ posterUrl, posterPath }: HighlightSource) {
  return { uri: posterUrl ?? undefined, cacheKey: posterPath ? `highlight-poster:${posterPath}` : undefined };
}

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
  const viewRef = React.useRef<VideoView>(null);
  const [firstFrame, setFirstFrame] = React.useState(false);
  const player = useHighlightPlayer(source, onError);
  // The poster covers a NEW version until it renders; a re-sign keeps the frame.
  React.useEffect(() => setFirstFrame(false), [source.version]);

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
            source={posterSource(source)}
            style={FILL}
            contentFit="contain"
            pointerEvents="none"
          />
        ) : null}
      </Pressable>
      <HighlightFullscreenButton onPress={() => void viewRef.current?.enterFullscreen().catch(() => undefined)} />
    </View>
  );
}

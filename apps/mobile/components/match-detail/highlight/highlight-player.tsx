import * as React from "react";
import { Pressable, View, type ViewStyle } from "react-native";
import { VideoView } from "expo-video";
import { playerLabel } from "@/lib/highlight/highlight-copy";
import { useHighlightPlayer } from "@/lib/highlight/use-highlight-player";
import { useFullscreenControls } from "@/lib/highlight/use-fullscreen-controls";
import type { HighlightSource } from "@/lib/highlight/use-my-highlight";
import { HIGHLIGHT_FRAME_STYLE } from "./highlight-frame";
import { HighlightFullscreenButton } from "./highlight-fullscreen-button";
import { HighlightPoster } from "./highlight-poster";


interface HighlightPlayerProps {
  source: HighlightSource;
  onError: () => void;
  /** Overrides the card's 480 pt frame (the full-screen viewer sizes its own). */
  frameStyle?: ViewStyle;
  /** The card offers native fullscreen; the full-screen viewer does not need it. */
  showFullscreenButton?: boolean;
}

/**
 * The reel, in-app only: tap toggles play/pause; the poster covers the frame
 * at rest until playback of THIS version has actually started AND a frame of
 * it is on screen (onFirstFrameRender or readyToPlay). A paused,
 * never-played item may be black (frame 0), so neither event alone lifts it. Native fullscreen always presents WITH native controls
 * (`useFullscreenControls`); the viewer, which hides the button, disables
 * fullscreen outright. PiP is off and there is NO share / save / export.
 */
export function HighlightPlayer({ source, onError, frameStyle, showFullscreenButton = true }: HighlightPlayerProps) {
  const viewRef = React.useRef<VideoView>(null);
  const [firstFrameVersion, setFirstFrameVersion] = React.useState<number | null>(null);
  const { player, renderedVersion, settledVersion, playedVersion } = useHighlightPlayer(source, onError);
  const fullscreen = useFullscreenControls(viewRef);
  // A first frame counts only for the item whose swap has settled (never the old one).
  const onFirstFrame = React.useCallback(() => setFirstFrameVersion(settledVersion()), [settledVersion]);
  const v = source.version;
  const covered = renderedVersion !== v && !(firstFrameVersion === v && playedVersion === v);

  const toggle = React.useCallback(() => {
    if (player.playing) player.pause();
    else player.play();
  }, [player]);

  return (
    <View testID="highlight-player" className="bg-surface-4 overflow-hidden rounded-md" style={frameStyle ?? HIGHLIGHT_FRAME_STYLE}>
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
          nativeControls={fullscreen.nativeControls}
          fullscreenOptions={{ enable: showFullscreenButton }}
          onFullscreenEnter={fullscreen.onFullscreenEnter}
          onFullscreenExit={fullscreen.onFullscreenExit}
          allowsPictureInPicture={false}
          onFirstFrameRender={onFirstFrame}
        />
        {source.posterUrl && covered ? (
          <HighlightPoster source={source} />
        ) : null}
      </Pressable>
      {showFullscreenButton ? (
        <HighlightFullscreenButton onPress={fullscreen.enterFullscreen} />
      ) : null}
    </View>
  );
}

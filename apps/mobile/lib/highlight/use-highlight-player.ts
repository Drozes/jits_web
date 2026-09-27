import * as React from "react";
import { useFocusEffect } from "expo-router";
import { useVideoPlayer, type VideoPlayer } from "expo-video";

/**
 * The reel's expo-video player: muted, looping, no autoplay (minimal motion),
 * AirPlay / external playback off. Reports a status error (the usual cause is
 * an expired signed URL) and pauses when the screen loses focus.
 */
export function useHighlightPlayer(url: string, onError: () => void): VideoPlayer {
  const player = useVideoPlayer(url, (p) => {
    p.muted = true;
    p.loop = true;
    p.allowsExternalPlayback = false;
  });

  React.useEffect(() => {
    const sub = player.addListener("statusChange", ({ status }) => {
      if (status === "error") onError();
    });
    return () => sub.remove();
  }, [player, onError]);

  useFocusEffect(
    React.useCallback(() => {
      return () => {
        try {
          player.pause();
        } catch {
          // Player already released on unmount.
        }
      };
    }, [player]),
  );

  return player;
}

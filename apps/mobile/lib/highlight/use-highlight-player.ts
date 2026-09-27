import * as React from "react";
import { useFocusEffect } from "expo-router";
import { useVideoPlayer, type VideoPlayer } from "expo-video";
import type { HighlightSource } from "./use-my-highlight";

/**
 * The reel's expo-video player: muted, looping, no autoplay (minimal motion),
 * AirPlay / external playback off. Reports a status error (the usual cause is
 * an expired signed URL) and pauses when the screen loses focus.
 *
 * ONE player per mounted card. A re-signed URL or a new version is swapped
 * in place with `replaceAsync` (never a new player or a remounted VideoView),
 * so a renewal does not restart the reel or drop the athlete out of
 * fullscreen. A re-sign of the same version keeps the position and the
 * play state; a new version starts from the top.
 */
export function useHighlightPlayer(source: HighlightSource, onError: () => void): VideoPlayer {
  // useVideoPlayer recreates the player whenever its source changes, so it
  // only ever sees the first URL; later ones go through replaceAsync.
  const [initialUrl] = React.useState(source.url);
  const player = useVideoPlayer(initialUrl, (p) => {
    p.muted = true;
    p.loop = true;
    p.allowsExternalPlayback = false;
  });
  const loadedRef = React.useRef({ url: source.url, version: source.version, generation: source.generation });
  const onErrorRef = React.useRef(onError);
  React.useEffect(() => {
    onErrorRef.current = onError;
  });

  React.useEffect(() => {
    const loaded = loadedRef.current;
    if (loaded.url === source.url && loaded.generation === source.generation) return;
    const sameVersion = loaded.version === source.version;
    loadedRef.current = { url: source.url, version: source.version, generation: source.generation };
    let at = 0;
    let wasPlaying = false;
    try {
      at = sameVersion ? player.currentTime : 0;
      wasPlaying = player.playing;
    } catch {
      // Released player: nothing to preserve.
    }
    player
      .replaceAsync(source.url)
      .then(() => {
        if (at > 0) player.currentTime = at;
        if (wasPlaying) player.play();
      })
      .catch(() => onErrorRef.current());
  }, [player, source.url, source.version, source.generation]);

  React.useEffect(() => {
    const sub = player.addListener("statusChange", ({ status }) => {
      if (status === "error") onErrorRef.current();
    });
    return () => sub.remove();
  }, [player]);

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

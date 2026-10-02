import * as React from "react";
import { useFocusEffect } from "expo-router";
import { useVideoPlayer, type VideoPlayer } from "expo-video";
import type { HighlightSource } from "./use-my-highlight";

export interface HighlightPlayerState {
  player: VideoPlayer;
  /**
   * Version whose item reached readyToPlay AND has actually played, i.e. a
   * frame is on screen: the poster fallback when iOS skips
   * onFirstFrameRender. A paused, never-played AVPlayer reaches readyToPlay
   * without rendering anything, so readyToPlay alone must never hide the
   * poster (it left a black frame at rest).
   */
  renderedVersion: number | null;
  /** The version of the item on screen, or null while a swap is still pending. */
  settledVersion: () => number | null;
  /** Version whose playback has actually started (the poster stays until then). */
  playedVersion: number | null;
}

/**
 * The reel's expo-video player: muted, looping, no autoplay (playback starts
 * only on the athlete's tap; autoplay is not a registered Motion Rule moment),
 * AirPlay / external playback off. Reports a status error (the usual cause is
 * an expired signed URL) and pauses when the screen loses focus.
 *
 * ONE player per mounted card. A re-signed URL or a new version is swapped
 * in place with `replaceAsync` (never a new player or a remounted VideoView),
 * so a renewal does not restart the reel or drop the athlete out of
 * fullscreen. A re-sign of the same version keeps the position and the
 * play state; a new version starts from the top.
 *
 * Swaps are sequenced: only the latest swap's outcome is applied, nothing
 * lands after unmount, and if a superseded swap finishes AFTER the latest one
 * (so the native item may be the stale URL) the latest URL is loaded again.
 */
export function useHighlightPlayer(source: HighlightSource, onError: () => void): HighlightPlayerState {
  // useVideoPlayer recreates the player whenever its source changes, so it
  // only ever sees the first URL; later ones go through replaceAsync.
  const [initialUrl] = React.useState(source.url);
  const player = useVideoPlayer(initialUrl, (p) => {
    p.muted = true;
    p.loop = true;
    p.allowsExternalPlayback = false;
  });
  const [readyVersion, setReadyVersion] = React.useState<number | null>(null);
  const [playedVersion, setPlayedVersion] = React.useState<number | null>(null);
  const loadedRef = React.useRef({ url: source.url, version: source.version, generation: source.generation });
  const swap = React.useRef({ seq: 0, doneSeq: 0, mounted: true });
  const onErrorRef = React.useRef(onError);
  React.useEffect(() => {
    onErrorRef.current = onError;
  });
  React.useEffect(() => {
    const state = swap.current;
    state.mounted = true;
    return () => {
      state.mounted = false;
    };
  }, []);

  const replace = React.useCallback(
    (url: string, restore: { at: number; play: boolean } | null) => {
      const state = swap.current;
      const seq = ++state.seq;
      const settle = (ok: boolean) => {
        if (!state.mounted) return;
        if (seq !== state.seq) {
          // Superseded. If the latest swap already finished, this stale one
          // may have replaced its item: load the latest URL again.
          if (state.doneSeq === state.seq) replace(loadedRef.current.url, null);
          return;
        }
        state.doneSeq = seq;
        if (!ok) return onErrorRef.current();
        // readyToPlay may have fired before this promise settled.
        if (player.status === "readyToPlay") setReadyVersion(loadedRef.current.version);
        if (restore && restore.at > 0) player.currentTime = restore.at;
        if (restore?.play) player.play();
        // Resumed playback may not re-emit playingChange (it never stopped).
        if (restore?.play || player.playing) setPlayedVersion(loadedRef.current.version);
      };
      player.replaceAsync(url).then(
        () => settle(true),
        () => settle(false),
      );
    },
    [player],
  );

  React.useEffect(() => {
    const loaded = loadedRef.current;
    if (loaded.url === source.url && loaded.generation === source.generation) return;
    const sameVersion = loaded.version === source.version;
    loadedRef.current = { url: source.url, version: source.version, generation: source.generation };
    let restore = { at: 0, play: false };
    try {
      restore = { at: sameVersion ? player.currentTime : 0, play: player.playing };
    } catch {
      // Released player: nothing to preserve.
    }
    replace(source.url, restore);
  }, [player, replace, source.url, source.version, source.generation]);

  React.useEffect(() => {
    // A readyToPlay that fired before this listener subscribed (the initial
    // item loads as soon as the player exists) would otherwise be missed.
    try {
      if (player.status === "readyToPlay" && swap.current.doneSeq === swap.current.seq) {
        setReadyVersion(loadedRef.current.version);
      }
    } catch {
      // Released player.
    }
    const sub = player.addListener("statusChange", ({ status }) => {
      if (status === "error") onErrorRef.current();
      // Only once the latest swap has settled is "ready" about this version.
      else if (status === "readyToPlay" && swap.current.doneSeq === swap.current.seq) {
        setReadyVersion(loadedRef.current.version);
      }
    });
    // Playback of the current item started: from now on a ready item has a frame.
    const playing = player.addListener("playingChange", ({ isPlaying }) => {
      if (isPlaying && swap.current.doneSeq === swap.current.seq) setPlayedVersion(loadedRef.current.version);
    });
    return () => {
      sub.remove();
      playing.remove();
    };
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

  const renderedVersion = readyVersion !== null && readyVersion === playedVersion ? readyVersion : null;
  const settledVersion = React.useCallback(
    () => (swap.current.doneSeq === swap.current.seq ? loadedRef.current.version : null),
    [],
  );
  return { player, renderedVersion, settledVersion, playedVersion };
}

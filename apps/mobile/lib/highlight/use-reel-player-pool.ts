import * as React from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { useVideoPlayer, type VideoPlayer } from "expo-video";
import { usePlaybackTelemetry, type PlaybackTelemetry } from "@/lib/video/use-playback-telemetry";
import { ReelPoolController, type SlotSnapshot } from "./reel-player-pool";
import { useReelMuted } from "./reel-prefs";

const TELEMETRY_META = { surface: "highlight", videoId: null, angle: null, angleCount: null } as const;

function setup(p: VideoPlayer): void {
  p.loop = true;
  p.allowsExternalPlayback = false;
  p.timeUpdateEventInterval = 0.25;
}

/**
 * The viewer's three pooled expo-video players (previous, current, next) and
 * their controller (`reel-player-pool.ts`). The single-reel viewer uses the
 * same pool with one page, so both modes play, pause, mute and cover alike.
 * `useVideoPlayer` releases each native player when the viewer unmounts.
 * Leaving the screen (blur) or the app (background) pauses; coming back
 * resumes the visible page unless the athlete paused it.
 */
export function useReelPlayerPool(): ReelPoolController {
  const p0 = useVideoPlayer(null, setup);
  const p1 = useVideoPlayer(null, setup);
  const p2 = useVideoPlayer(null, setup);
  const t0 = usePlaybackTelemetry(p0, TELEMETRY_META);
  const t1 = usePlaybackTelemetry(p1, TELEMETRY_META);
  const t2 = usePlaybackTelemetry(p2, TELEMETRY_META);
  const telemetry = React.useRef<PlaybackTelemetry[]>([]);
  telemetry.current = [t0, t1, t2];

  const [pool] = React.useState(
    () =>
      new ReelPoolController([p0, p1, p2], {
        sourceAttached: (k, resigned) => {
          const t = telemetry.current[k];
          if (resigned) t?.resigned();
          t?.sourceAttached("highlight");
        },
        playIntent: (k, want) => telemetry.current[k]?.playIntent(want),
        firstFrame: (k) => telemetry.current[k]?.firstFrame(),
      }),
  );

  const muted = useReelMuted();
  React.useEffect(() => pool.setMuted(muted), [pool, muted]);

  React.useEffect(() => {
    pool.start();
    const subs = pool.players.flatMap((player, k) => [
      player.addListener("statusChange", ({ status }) => pool.statusChanged(k, status)),
      player.addListener("playingChange", ({ isPlaying }) => pool.playingChanged(k, isPlaying)),
      player.addListener("videoTrackChange", ({ videoTrack }) => {
        if (videoTrack) pool.videoSize(k, videoTrack.size.width, videoTrack.size.height);
      }),
      player.addListener("timeUpdate", ({ currentTime }) => {
        let duration = 0;
        try {
          duration = player.duration;
        } catch {
          // Released.
        }
        pool.timeUpdate(k, currentTime, duration);
      }),
    ]);
    const app = AppState.addEventListener("change", (next) => {
      if (next === "background") pool.setFocused(false);
      else if (next === "active") pool.setFocused(true);
    });
    return () => {
      subs.forEach((s) => s.remove());
      app.remove();
      pool.release();
    };
  }, [pool]);

  useFocusEffect(
    React.useCallback(() => {
      pool.setFocused(true);
      return () => pool.setFocused(false);
    }, [pool]),
  );
  return pool;
}

/** First frame of a slot's item is on screen (VideoView `onFirstFrameRender`). */
export function useSlotFirstFrame(pool: ReelPoolController, slot: number | null): () => void {
  return React.useCallback(() => {
    if (slot !== null) pool.firstFrame(slot);
  }, [pool, slot]);
}

export function useReelSlot(pool: ReelPoolController, index: number): SlotSnapshot {
  const get = React.useCallback(() => pool.snapshot(index), [pool, index]);
  return React.useSyncExternalStore(pool.subscribe, get, get);
}

export function useReelProgress(pool: ReelPoolController, index: number): number {
  const get = React.useCallback(() => pool.progress(index), [pool, index]);
  return React.useSyncExternalStore(pool.subscribeProgress, get, get);
}

import * as React from "react";
import type { AVPlaybackStatus, Video } from "expo-av";
import { supabase } from "@/lib/supabase/client";
import {
  getMatchVideoPlaybackResult,
  type MatchVideoPlayback,
} from "@jits/shared/api/queries";
import type { Result } from "@jits/shared/api/errors";

/**
 * "absent", "missing" and "failed" are deliberately separate (jits-icei.5,
 * V-epic 3.3): `{ ok: true, data: null }` is a real absence (row removed, or
 * RLS hides it from a non-participant), VIDEO_FILE_MISSING means the row
 * outlived its storage object (nothing to retry), and any other failure means
 * we know nothing and deserve a retry. The verdict is read off the RESOLVED
 * value: supabase-js resolves even a hard network failure.
 */
export type PlaybackPhase =
  | "loading"
  | "ready"
  | "absent"
  | "processing"
  | "missing"
  | "failed";

/** The `video-player-state` label values the harness waits on. */
export type PlayerStateLabel =
  | "loading"
  | "loaded"
  | "error"
  | "absent"
  | "processing"
  | "missing";

export interface PlaybackSource {
  url: string;
  posterUrl: string | null;
  /** Bumped on every sign, so the player remounts even on an identical URL. */
  generation: number;
}

function phaseFor(result: Result<MatchVideoPlayback | null>): PlaybackPhase {
  if (!result.ok) {
    return result.error.code === "VIDEO_FILE_MISSING" ? "missing" : "failed";
  }
  if (!result.data) return "absent";
  // Still uploading: do not mount a player on a half-written object.
  if (result.data.playability === "processing") return "processing";
  return "ready";
}

/**
 * Signs one match video and keeps it playable. A player error gets ONE
 * silent re-sign (the usual cause is the 1h URL expiring mid-match), a
 * remount on the new URL and a seek back to where playback was; a second
 * consecutive error surfaces the retry panel. `retry` always re-signs.
 */
export function useVideoPlayback(id: string | undefined) {
  const [phase, setPhase] = React.useState<PlaybackPhase>("loading");
  const [source, setSource] = React.useState<PlaybackSource | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  const videoRef = React.useRef<Video>(null);
  const epochRef = React.useRef(0);
  const positionRef = React.useRef(0);
  const resumeAtRef = React.useRef<number | null>(null);
  const loadedRef = React.useRef(false);
  const resignedRef = React.useRef(false);

  const sign = React.useCallback(
    async (silent: boolean) => {
      if (!id) return;
      const epoch = ++epochRef.current;
      if (!silent) setPhase("loading");
      const result = await getMatchVideoPlaybackResult(supabase, id);
      // A newer sign started, or the screen unmounted.
      if (epoch !== epochRef.current) return;
      const next = phaseFor(result);
      if (next === "ready" && result.ok && result.data) {
        resumeAtRef.current = positionRef.current > 0 ? positionRef.current : null;
        loadedRef.current = false;
        setLoaded(false);
        setSource({ url: result.data.url, posterUrl: result.data.posterUrl, generation: epoch });
      }
      setPhase(next);
    },
    [id],
  );

  React.useEffect(() => {
    resignedRef.current = false;
    void sign(false);
    return () => {
      epochRef.current += 1;
    };
  }, [sign, attempt]);

  const retry = React.useCallback(() => setAttempt((n) => n + 1), []);

  const onPlayerError = React.useCallback(() => {
    loadedRef.current = false;
    setLoaded(false);
    if (resignedRef.current) {
      setPhase("failed");
      return;
    }
    resignedRef.current = true;
    void sign(true);
  }, [sign]);

  const onPlayerStatus = React.useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    positionRef.current = status.positionMillis;
    if (loadedRef.current) return;
    loadedRef.current = true;
    // A good load ends the error streak: a later expiry earns its own re-sign.
    resignedRef.current = false;
    setLoaded(true);
    const at = resumeAtRef.current;
    resumeAtRef.current = null;
    if (at) videoRef.current?.setPositionAsync(at).catch(() => undefined);
  }, []);

  const stateLabel: PlayerStateLabel =
    phase === "ready"
      ? loaded
        ? "loaded"
        : "loading"
      : phase === "failed"
        ? "error"
        : phase;

  return { phase, source, stateLabel, videoRef, retry, onPlayerError, onPlayerStatus };
}

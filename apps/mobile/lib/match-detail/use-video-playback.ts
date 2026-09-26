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

/** Silent re-signs one screen instance may make; only the user's Retry resets it. */
const MAX_SILENT_RESIGNS = 2;
/** Playback past the resume point that proves a re-signed URL really works. */
const PROGRESS_MS = 3000;

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
 * Signs one match video and keeps it playable. A player error gets a silent
 * re-sign (the usual cause is the 1h URL expiring mid-match), a remount on
 * the new URL and a seek back to where playback was.
 *
 * Re-signing is bounded two ways, so a file that fails at one spot cannot
 * loop load, seek, fail, re-sign forever: after a re-sign the error streak
 * only clears once playback has really moved PROGRESS_MS past the resume
 * point, and at most MAX_SILENT_RESIGNS happen per screen instance. Past
 * either, the retry panel shows. Errors while a sign is in flight are
 * ignored (the player being replaced can still report). `retry` always
 * re-signs and resets both limits.
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
  const progressBaseRef = React.useRef(0);
  const loadedRef = React.useRef(false);
  const signingRef = React.useRef(false);
  /** A silent re-sign happened and playback has not progressed since. */
  const streakRef = React.useRef(false);
  const silentCountRef = React.useRef(0);

  const sign = React.useCallback(
    async (silent: boolean) => {
      if (!id) {
        setPhase("absent");
        return;
      }
      const epoch = ++epochRef.current;
      signingRef.current = true;
      if (!silent) setPhase("loading");
      const result = await getMatchVideoPlaybackResult(supabase, id);
      // A newer sign started, or the screen unmounted.
      if (epoch !== epochRef.current) return;
      signingRef.current = false;
      const next = phaseFor(result);
      if (next === "ready" && result.ok && result.data) {
        const resumeAt = positionRef.current > 0 ? positionRef.current : null;
        resumeAtRef.current = resumeAt;
        progressBaseRef.current = resumeAt ?? 0;
        loadedRef.current = false;
        setLoaded(false);
        setSource({ url: result.data.url, posterUrl: result.data.posterUrl, generation: epoch });
      }
      setPhase(next);
    },
    [id],
  );

  React.useEffect(() => {
    streakRef.current = false;
    silentCountRef.current = 0;
    void sign(false);
    return () => {
      epochRef.current += 1;
      signingRef.current = false;
    };
  }, [sign, attempt]);

  const retry = React.useCallback(() => setAttempt((n) => n + 1), []);

  const onPlayerError = React.useCallback(() => {
    if (signingRef.current) return;
    loadedRef.current = false;
    setLoaded(false);
    if (streakRef.current || silentCountRef.current >= MAX_SILENT_RESIGNS) {
      setPhase("failed");
      return;
    }
    streakRef.current = true;
    silentCountRef.current += 1;
    void sign(true);
  }, [sign]);

  const onPlayerStatus = React.useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    if (!loadedRef.current) {
      loadedRef.current = true;
      setLoaded(true);
      // The first loaded status still reports the pre-seek position, so it
      // neither updates the position nor counts as progress.
      const at = resumeAtRef.current;
      resumeAtRef.current = null;
      if (at) videoRef.current?.setPositionAsync(at).catch(() => undefined);
      return;
    }
    positionRef.current = status.positionMillis;
    if (streakRef.current && status.positionMillis > progressBaseRef.current + PROGRESS_MS) {
      streakRef.current = false;
    }
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

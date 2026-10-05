import * as React from "react";
import { AppState } from "react-native";
import { useVideoPlayer, type VideoPlayer } from "expo-video";
import { supabase } from "@/lib/supabase/client";
import {
  getMatchVideoPlaybackResult,
  type MatchVideoPlayback,
} from "@jits/shared/api/queries";
import type { Result } from "@jits/shared/api/errors";
import { usePlaybackTelemetry, type PlaybackTelemetry } from "@/lib/video/use-playback-telemetry";

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
  /** The match the recording belongs to (the player loads the other angle from it). */
  matchId: string | null;
  durationSeconds: number | null;
  /** Bumped on every sign, so the player reloads even an identical URL. */
  generation: number;
}

export interface VideoPlayback {
  phase: PlaybackPhase;
  source: PlaybackSource | null;
  stateLabel: PlayerStateLabel;
  /** The one expo-video player for this screen instance (render it with VideoView). */
  player: VideoPlayer;
  retry: () => void;
  /** Displayed position in seconds (moves at once on a seek, then follows the player). */
  positionS: number;
  /** Duration in seconds from the loaded item; 0 until known. */
  durationS: number;
  /** Whether the athlete wants playback running (autoplay starts true). */
  playing: boolean;
  setPlaying: (next: boolean | ((prev: boolean) => boolean)) => void;
  /** Play/pause; at the end it restarts from 0. */
  toggle: () => void;
  /** Seek to `seconds`, clamped to [0, duration]. */
  seek: (seconds: number) => void;
  rate: number;
  setRate: (next: number | ((prev: number) => number)) => void;
  /** A frame of the current item is on screen: the poster can go. */
  frameShown: boolean;
  /** Wire to VideoView's onFirstFrameRender. */
  onFirstFrameRender: () => void;
  telemetry: PlaybackTelemetry;
}

/** Silent re-signs one screen instance may make; only the user's Retry resets it. */
const MAX_SILENT_RESIGNS = 2;
/** Playback past the resume point that proves a re-signed URL really works. */
const PROGRESS_S = 3;
/** Player time-update cadence (seconds). */
const TIME_UPDATE_S = 0.25;
/**
 * After a seek, time updates still reporting the old spot are dropped until
 * one lands within this distance of the target (or the cap runs out), so the
 * clock never flashes back to where it was.
 */
const SEEK_LANDED_S = 1.5;
const SEEK_HOLD_MAX_UPDATES = 8;
/** Within this of the end, Play restarts from the top. */
const END_EPSILON_S = 0.5;

function phaseFor(result: Result<MatchVideoPlayback | null>): PlaybackPhase {
  if (!result.ok) {
    return result.error.code === "VIDEO_FILE_MISSING" ? "missing" : "failed";
  }
  if (!result.data) return "absent";
  // Still uploading: do not mount a player on a half-written object.
  if (result.data.playability === "processing") return "processing";
  return "ready";
}

function safely(fn: () => void): void {
  try {
    fn();
  } catch {
    // The player was released (screen unmounting).
  }
}

/**
 * Signs one match video and keeps it playable on ONE expo-video player
 * (jits-n2im.19; it was expo-av's Video). expo-video 3.0.16 is linked in the
 * field build (the reels use it), so this ships over OTA.
 *
 * A player error gets a silent re-sign (the usual cause is the 1h URL
 * expiring mid-match), the new URL swapped in with `replaceAsync`, and a
 * seek back to where playback was once the item is ready.
 *
 * Re-signing is bounded two ways, so a file that fails at one spot cannot
 * loop load, seek, fail, re-sign forever: after a re-sign the error streak
 * only clears once playback has really moved PROGRESS_S past the resume
 * point, and at most MAX_SILENT_RESIGNS happen per screen instance. Past
 * either, the retry panel shows. Errors while a sign or a swap is in flight
 * are ignored (the item being replaced can still report). `retry` always
 * re-signs and resets both limits.
 *
 * Silent switch: expo-video always runs the iOS audio session in the
 * `.playback` category, so the film is audible with the ringer off (expo-av
 * needed `playsInSilentModeIOS`).
 */
export function useVideoPlayback(id: string | undefined, startSeconds?: number | null): VideoPlayback {
  const player = useVideoPlayer(null, (p) => {
    p.timeUpdateEventInterval = TIME_UPDATE_S;
    p.preservesPitch = true;
  });
  const telemetry = usePlaybackTelemetry(player, { surface: "match", videoId: id ?? null, angle: null, angleCount: null });

  const [phase, setPhase] = React.useState<PlaybackPhase>("loading");
  const [source, setSource] = React.useState<PlaybackSource | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  const initialStart = startSeconds != null && Number.isFinite(startSeconds) && startSeconds > 0 ? startSeconds : 0;
  const [positionS, setPositionS] = React.useState(initialStart);
  const [durationS, setDurationS] = React.useState(0);
  const [playing, setPlaying] = React.useState(true);
  const [rate, setRate] = React.useState(1);
  const [frameGen, setFrameGen] = React.useState<number | null>(null);

  const epochRef = React.useRef(0);
  // A `?t=` start is just a resume point the first load seeks to.
  const positionRef = React.useRef(initialStart);
  const durationRef = React.useRef(0);
  const resumeAtRef = React.useRef<number | null>(null);
  const progressBaseRef = React.useRef(0);
  const loadedRef = React.useRef(false);
  const signingRef = React.useRef(false);
  /** A silent re-sign happened and playback has not progressed since. */
  const streakRef = React.useRef(false);
  const silentCountRef = React.useRef(0);
  const sourceRef = React.useRef<PlaybackSource | null>(null);
  /** Generation whose replaceAsync has settled (the native item is that URL). */
  const settledGenRef = React.useRef<number | null>(null);
  const playingRef = React.useRef(true);
  const rateRef = React.useRef(1);
  const holdRef = React.useRef<{ at: number; left: number } | null>(null);
  const mountedRef = React.useRef(true);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
        const nextSource = {
          url: result.data.url,
          posterUrl: result.data.posterUrl,
          matchId: result.data.matchId ?? null,
          durationSeconds: result.data.durationSeconds ?? null,
          generation: epoch,
        };
        sourceRef.current = nextSource;
        setSource(nextSource);
        telemetry.sourceAttached(result.data.sourceKind ?? "original");
      }
      setPhase(next);
    },
    [id, telemetry],
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

  const onPlayerError = React.useCallback(
    (_message?: string | null) => {
      if (signingRef.current) return;
      loadedRef.current = false;
      setLoaded(false);
      if (streakRef.current || silentCountRef.current >= MAX_SILENT_RESIGNS) {
        setPhase("failed");
        return;
      }
      streakRef.current = true;
      silentCountRef.current += 1;
      telemetry.resigned();
      void sign(true);
    },
    [sign, telemetry],
  );
  const onPlayerErrorRef = React.useRef(onPlayerError);
  React.useEffect(() => {
    onPlayerErrorRef.current = onPlayerError;
  });

  const startPlayback = React.useCallback(() => {
    safely(() => {
      // Setting the rate on iOS sets AVPlayer.rate, which also starts playback:
      // only ever touch it on the way into play().
      if (player.playbackRate !== rateRef.current) player.playbackRate = rateRef.current;
      player.play();
    });
  }, [player]);

  /**
   * The current item is loaded and ready: seek to the resume point. Playback
   * then starts from the play-intent effect, which runs on `loaded`.
   */
  const markLoaded = React.useCallback(() => {
    const current = sourceRef.current;
    if (!current || loadedRef.current || settledGenRef.current !== current.generation) return;
    let ready = false;
    safely(() => {
      ready = player.status === "readyToPlay";
    });
    if (!ready) return;
    loadedRef.current = true;
    setLoaded(true);
    safely(() => {
      if (player.duration > 0) {
        durationRef.current = player.duration;
        setDurationS(player.duration);
      }
    });
    const at = resumeAtRef.current;
    resumeAtRef.current = null;
    if (at) {
      holdRef.current = { at, left: SEEK_HOLD_MAX_UPDATES };
      telemetry.expectWait();
      setPositionS(at);
      safely(() => {
        player.currentTime = at;
      });
    }
  }, [player, telemetry]);

  // Swap each newly signed URL into the one player. Only the latest swap's
  // outcome counts; a superseded swap that settles after it reloads the
  // latest URL (the native item may be the stale one).
  const swapRef = React.useRef({ seq: 0, doneSeq: 0 });
  const replace = React.useCallback(
    (next: PlaybackSource) => {
      const state = swapRef.current;
      const seq = ++state.seq;
      settledGenRef.current = null;
      const settle = (ok: boolean, message?: string) => {
        if (!mountedRef.current) return;
        if (seq !== state.seq) {
          if (state.doneSeq === state.seq && sourceRef.current) replace(sourceRef.current);
          return;
        }
        state.doneSeq = seq;
        if (!ok) {
          // A status "error" reaches telemetry on its own; a rejected swap does not.
          telemetry.error(message ?? "replace failed");
          onPlayerErrorRef.current(message ?? "replace failed");
          return;
        }
        settledGenRef.current = next.generation;
        // readyToPlay may have fired before this promise settled.
        markLoaded();
      };
      let pending: Promise<void>;
      try {
        pending = player.replaceAsync({ uri: next.url });
      } catch (e) {
        settle(false, e instanceof Error ? e.message : String(e));
        return;
      }
      pending.then(
        () => settle(true),
        (e: unknown) => settle(false, e instanceof Error ? e.message : String(e)),
      );
    },
    [player, markLoaded, telemetry],
  );

  React.useEffect(() => {
    if (source) replace(source);
  }, [source, replace]);

  React.useEffect(() => {
    const subs: Array<{ remove: () => void }> = [];
    safely(() => {
      subs.push(
        player.addListener("statusChange", ({ status, error }) => {
          if (status === "readyToPlay") markLoaded();
          else if (status === "error") {
            // A swap in flight reports through its own promise.
            if (settledGenRef.current == null || settledGenRef.current !== sourceRef.current?.generation) return;
            onPlayerErrorRef.current(error?.message ?? null);
          }
        }),
        player.addListener("sourceLoad", ({ duration }) => {
          if (duration > 0) {
            durationRef.current = duration;
            setDurationS(duration);
          }
        }),
        player.addListener("timeUpdate", ({ currentTime }) => {
          if (!loadedRef.current) return;
          const hold = holdRef.current;
          if (hold) {
            if (Math.abs(currentTime - hold.at) > SEEK_LANDED_S && hold.left > 0) {
              hold.left -= 1;
              return;
            }
            holdRef.current = null;
          }
          positionRef.current = currentTime;
          setPositionS(currentTime);
          if (currentTime > progressBaseRef.current + 0.1 && sourceRef.current) {
            // Moving past the start point means a frame is on screen (the
            // fallback for an onFirstFrameRender that iOS can skip).
            setFrameGen(sourceRef.current.generation);
          }
          if (streakRef.current && currentTime > progressBaseRef.current + PROGRESS_S) {
            streakRef.current = false;
          }
        }),
        player.addListener("playToEnd", () => {
          playingRef.current = false;
          setPlaying(false);
        }),
      );
    });
    return () => {
      for (const sub of subs) safely(() => sub.remove());
    };
  }, [player, markLoaded]);

  // expo-video pauses in the background (staysActiveInBackground is off):
  // show it paused, so the athlete resumes with Play instead of a Pause
  // button over a stopped film.
  React.useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "background") setPlaying(false);
    });
    return () => sub?.remove?.();
  }, []);

  // The athlete's play/pause intent drives the player once an item is loaded.
  React.useEffect(() => {
    playingRef.current = playing;
    telemetry.playIntent(playing);
    if (!loadedRef.current) return;
    if (playing) startPlayback();
    else safely(() => player.pause());
  }, [playing, loaded, player, startPlayback, telemetry]);

  React.useEffect(() => {
    rateRef.current = rate;
    if (!loadedRef.current || !playingRef.current) return;
    safely(() => {
      player.playbackRate = rate;
    });
  }, [rate, loaded, player]);

  const seek = React.useCallback(
    (seconds: number) => {
      const duration = durationRef.current || sourceRef.current?.durationSeconds || 0;
      const clamped = Math.max(0, duration > 0 ? Math.min(duration, seconds) : seconds);
      setPositionS(clamped);
      positionRef.current = clamped;
      holdRef.current = { at: clamped, left: SEEK_HOLD_MAX_UPDATES };
      telemetry.seekRequested();
      safely(() => {
        player.currentTime = clamped;
      });
    },
    [player, telemetry],
  );

  const toggle = React.useCallback(() => {
    const duration = durationRef.current || sourceRef.current?.durationSeconds || 0;
    if (!playingRef.current && duration > 0 && positionRef.current >= duration - END_EPSILON_S) seek(0);
    setPlaying((p) => !p);
  }, [seek]);

  const onFirstFrameRender = React.useCallback(() => {
    telemetry.firstFrame();
    const current = sourceRef.current;
    if (current && settledGenRef.current === current.generation) setFrameGen(current.generation);
  }, [telemetry]);

  const stateLabel: PlayerStateLabel =
    phase === "ready"
      ? loaded
        ? "loaded"
        : "loading"
      : phase === "failed"
        ? "error"
        : phase;

  return {
    phase,
    source,
    stateLabel,
    player,
    retry,
    positionS,
    durationS,
    playing,
    setPlaying,
    toggle,
    seek,
    rate,
    setRate,
    frameShown: source != null && frameGen === source.generation,
    onFirstFrameRender,
    telemetry,
  };
}

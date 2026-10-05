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
  /**
   * Loaded by an angle switch while a frame of the previous angle was on
   * screen: that frame stays up until the new one draws (never the poster,
   * which is the start of the match).
   */
  holdFrame?: boolean;
}

export interface VideoPlayback {
  /**
   * The angle on screen. Starts as the route's id and moves with
   * `switchAngle`, which keeps this screen, this player and its telemetry
   * session (a switch used to remount all three).
   */
  activeId: string | undefined;
  /** The angle this screen session opened on; moves only on an outside navigation. */
  entryId: string | undefined;
  /**
   * Switch to another angle of the same match at `atSeconds` of ITS file
   * (already translated through the sync offsets, in fractional seconds:
   * never floored). Keeps the play/pause intent and the speed, swaps the
   * new angle's URL (pre-signed when `presign` got to it) into the same
   * player, and holds the outgoing frame instead of the poster.
   */
  switchAngle: (nextId: string, atSeconds: number) => void;
  /** Sign these angles now (best effort) so a switch to one skips the round trip. */
  presign: (ids: string[]) => void;
  /**
   * The exact playback position right now, read from the player (a seek in
   * flight answers with its target). `positionS` trails it by up to one
   * 250 ms time update, too coarse to carry across a switch.
   */
  currentTimeNow: () => number;
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
/**
 * If a settled swap is still not readyToPlay after this long, play anyway.
 * iOS reports a ready item with an empty buffer as "loading", and a paused
 * AVPlayer may not fill it until asked to play (expo-av's shouldPlay asked
 * at once). The resume seek then lands on the later readyToPlay.
 */
const AUTOPLAY_FALLBACK_MS = 3000;
/**
 * A signed URL lives 1 h; a pre-signed one older than this is signed again
 * at the switch rather than risk it expiring mid-angle.
 */
const PRESIGN_FRESH_MS = 45 * 60 * 1000;

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
 * Angle switch (multi-angle P0): the screen no longer remounts on a switch.
 * `switchAngle` swaps the other angle's URL into this same player at the
 * translated position in fractional seconds, keeps the play/pause intent and
 * the speed, holds the outgoing frame instead of flashing the poster, and
 * keeps the one telemetry session (it counts the switch and times tap to the
 * new angle's first frame). `presign` signs the other playable angles when
 * the screen learns them, so a switch normally skips the sign round trip.
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
  // One session per screen: `videoId` stays the angle it opened on.
  const telemetry = usePlaybackTelemetry(player, { surface: "match", videoId: id ?? null, angle: null, angleCount: null });
  const [activeId, setActiveId] = React.useState(id);
  const activeIdRef = React.useRef(id);
  /** Signed sources by angle id (the active one and every pre-signed one). */
  const signedRef = React.useRef(new Map<string, { data: MatchVideoPlayback; at: number }>());
  const presigningRef = React.useRef(new Set<string>());
  /** The generation an angle switch loaded, until its first frame shows. */
  const switchGenRef = React.useRef<number | null>(null);
  /**
   * The switched-in item's resume seek has landed (or it needed none). Until
   * then a first frame may be the item's frame 0, so the switch is not
   * counted as landed and the held frame stays (review M2).
   */
  const switchSeekLandedRef = React.useRef(true);
  /**
   * Ids this hook switched to (or opened on). The route catches up with
   * `setParams` a render later, so an `id` from this set is our own echo,
   * never an outside navigation, even on a quick A, B, A (review m3).
   */
  const ownIdsRef = React.useRef(new Set<string>(id ? [id] : []));
  /** The angle this screen session opened on (changes only on an outside navigation). */
  const [entryId, setEntryId] = React.useState(id);
  const startRef = React.useRef(startSeconds);
  startRef.current = startSeconds;

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
  const frameGenRef = React.useRef<number | null>(null);
  frameGenRef.current = frameGen;

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

  /** Hand a signed source to the player, resuming at the current position. */
  const attach = React.useCallback(
    (data: MatchVideoPlayback, epoch: number, holdFrame: boolean) => {
      const resumeAt = positionRef.current > 0 ? positionRef.current : null;
      resumeAtRef.current = resumeAt;
      progressBaseRef.current = resumeAt ?? 0;
      loadedRef.current = false;
      setLoaded(false);
      const nextSource: PlaybackSource = {
        url: data.url,
        posterUrl: data.posterUrl,
        matchId: data.matchId ?? null,
        durationSeconds: data.durationSeconds ?? null,
        generation: epoch,
        ...(holdFrame ? { holdFrame: true } : null),
      };
      sourceRef.current = nextSource;
      setSource(nextSource);
      telemetry.sourceAttached(data.sourceKind ?? "original");
    },
    [telemetry],
  );

  const sign = React.useCallback(
    async (silent: boolean, opts: { switched?: boolean; holdFrame?: boolean } = {}) => {
      const target = activeIdRef.current;
      if (!target) {
        telemetry.signOutcome("absent");
        setPhase("absent");
        return;
      }
      const epoch = ++epochRef.current;
      signingRef.current = true;
      if (!silent) setPhase("loading");
      const result = await getMatchVideoPlaybackResult(supabase, target);
      // A newer sign (or switch) started, or the screen unmounted.
      if (epoch !== epochRef.current) return;
      signingRef.current = false;
      const next = phaseFor(result);
      telemetry.signOutcome(next === "ready" ? "ok" : next === "loading" ? "pending" : next);
      if (next === "ready" && result.ok && result.data) {
        signedRef.current.set(target, { data: result.data, at: Date.now() });
        if (opts.switched) switchGenRef.current = epoch;
        attach(result.data, epoch, opts.holdFrame === true);
      } else if (opts.switched) {
        switchGenRef.current = null;
      }
      setPhase(next);
    },
    [telemetry, attach],
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

  // The route moved to a recording this hook did not switch to (an outside
  // navigation reusing the screen): load it from the top like a fresh open.
  React.useEffect(() => {
    if (id === activeIdRef.current) return;
    if (id && ownIdsRef.current.has(id)) return;
    ownIdsRef.current = new Set(id ? [id] : []);
    activeIdRef.current = id;
    setActiveId(id);
    setEntryId(id);
    telemetry.setMeta({ videoId: id ?? null });
    switchGenRef.current = null;
    switchSeekLandedRef.current = true;
    // Like a fresh open: start at the new route's `?t=` (review m2).
    const s0 = startRef.current;
    const start = s0 != null && Number.isFinite(s0) && s0 > 0 ? s0 : 0;
    positionRef.current = start;
    setPositionS(start);
    holdRef.current = null;
    streakRef.current = false;
    silentCountRef.current = 0;
    void sign(false);
  }, [id, sign, telemetry]);

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
    clearAutoplayTimer();
    loadedRef.current = true;
    setLoaded(true);
    safely(() => {
      if (player.duration > 0) {
        durationRef.current = player.duration;
        setDurationS(player.duration);
      }
    });
    let at = resumeAtRef.current;
    resumeAtRef.current = null;
    // A shorter angle cannot resume past its end (review m1).
    let duration = 0;
    safely(() => {
      duration = player.duration;
    });
    if (at && duration > 0 && at > duration - END_EPSILON_S) {
      at = Math.max(0, duration - END_EPSILON_S);
      positionRef.current = at;
      progressBaseRef.current = at;
    }
    if (current.generation === switchGenRef.current && !at) switchSeekLandedRef.current = true;
    if (at) {
      holdRef.current = { at, left: SEEK_HOLD_MAX_UPDATES };
      telemetry.expectWait();
      setPositionS(at);
      safely(() => {
        player.currentTime = at;
      });
    }
  }, [player, telemetry]);

  const autoplayTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearAutoplayTimer = () => {
    if (autoplayTimerRef.current) clearTimeout(autoplayTimerRef.current);
    autoplayTimerRef.current = null;
  };
  React.useEffect(() => clearAutoplayTimer, []);

  /** A frame of generation `gen` is on screen (lifts the poster; ends a switch's wait). */
  const frameLanded = React.useCallback(
    (gen: number) => {
      // A switched-in item's frame before its resume seek lands may be its
      // frame 0: keep the held frame and do not count the switch yet.
      if (switchGenRef.current === gen && !switchSeekLandedRef.current) return;
      setFrameGen(gen);
      if (switchGenRef.current === gen) {
        switchGenRef.current = null;
        telemetry.switchLanded();
      }
    },
    [telemetry],
  );

  // Swap each newly signed URL into the one player. Only the latest swap's
  // outcome counts; a superseded swap that settles after it reloads the
  // latest URL (the native item may be the stale one).
  const swapRef = React.useRef({ seq: 0, doneSeq: 0 });
  const replace = React.useCallback(
    (next: PlaybackSource) => {
      const state = swapRef.current;
      const seq = ++state.seq;
      settledGenRef.current = null;
      clearAutoplayTimer();
      const settle = (ok: boolean, message?: string) => {
        if (!mountedRef.current) return;
        if (seq !== state.seq) {
          if (state.doneSeq === state.seq && sourceRef.current) {
            // The stale item may have replaced the latest one: reload it and
            // seek back to where playback was, like any fresh load.
            loadedRef.current = false;
            setLoaded(false);
            const at = positionRef.current > 0 ? positionRef.current : null;
            resumeAtRef.current = at;
            progressBaseRef.current = at ?? 0;
            replace(sourceRef.current);
          }
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
        if (!loadedRef.current) {
          autoplayTimerRef.current = setTimeout(() => {
            autoplayTimerRef.current = null;
            if (!mountedRef.current || loadedRef.current || settledGenRef.current !== next.generation) return;
            if (playingRef.current) startPlayback();
          }, AUTOPLAY_FALLBACK_MS);
        }
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
    [player, markLoaded, telemetry, startPlayback],
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
            if (!switchSeekLandedRef.current && sourceRef.current?.generation === switchGenRef.current) {
              // The switched-in item reached its resume point: now a frame
              // on screen is the right instant.
              switchSeekLandedRef.current = true;
              frameLanded(sourceRef.current.generation);
            }
          }
          positionRef.current = currentTime;
          setPositionS(currentTime);
          if (currentTime > progressBaseRef.current + 0.1 && sourceRef.current) {
            // Moving past the start point means a frame is on screen (the
            // fallback for an onFirstFrameRender that iOS can skip).
            frameLanded(sourceRef.current.generation);
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
  }, [player, markLoaded, frameLanded]);

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
      if (!loadedRef.current) {
        // An item is still loading (first load or a silent re-sign): the
        // seek must survive into its resume seek, not land on a dying item.
        resumeAtRef.current = clamped > 0 ? clamped : null;
        progressBaseRef.current = clamped;
      }
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
    if (current && settledGenRef.current === current.generation) frameLanded(current.generation);
  }, [telemetry, frameLanded]);

  const currentTimeNow = React.useCallback(() => {
    // A seek (or a switch's resume seek) in flight: its target is the truth.
    const hold = holdRef.current;
    if (hold) return hold.at;
    if (!loadedRef.current) return positionRef.current;
    let t = positionRef.current;
    safely(() => {
      const now = player.currentTime;
      if (Number.isFinite(now) && now >= 0) t = now;
    });
    return t;
  }, [player]);

  const switchAngle = React.useCallback(
    (nextId: string, atSeconds: number) => {
      if (!nextId || nextId === activeIdRef.current) return;
      const at = Number.isFinite(atSeconds) && atSeconds > 0 ? atSeconds : 0;
      telemetry.switchStarted();
      // Hold the outgoing frame only if one is up (else the poster stays).
      const current = sourceRef.current;
      const holdFrame = current != null && (frameGenRef.current === current.generation || current.holdFrame === true);
      activeIdRef.current = nextId;
      setActiveId(nextId);
      // The new file resumes exactly here; play intent and speed carry over
      // untouched (the play-intent effect re-applies them once it loads).
      positionRef.current = at;
      setPositionS(at);
      holdRef.current = null;
      durationRef.current = 0;
      setDurationS(0);
      ownIdsRef.current.add(nextId);
      // From here the outgoing item is gone, before any sign round trip
      // (review B1): its time updates, play intent and errors no longer
      // count, `currentTimeNow` answers with the target, and the new item
      // resumes exactly at `at`.
      loadedRef.current = false;
      setLoaded(false);
      resumeAtRef.current = at > 0 ? at : null;
      progressBaseRef.current = at;
      settledGenRef.current = null;
      clearAutoplayTimer();
      switchSeekLandedRef.current = !(at > 0);
      // A different file: its own re-sign budget.
      streakRef.current = false;
      silentCountRef.current = 0;
      // Stop the outgoing angle so it does not run on (or the new item start
      // from 0 at the old rate) before the resume seek lands.
      safely(() => player.pause());
      const cached = signedRef.current.get(nextId);
      if (cached && Date.now() - cached.at < PRESIGN_FRESH_MS) {
        const epoch = ++epochRef.current;
        signingRef.current = false;
        switchGenRef.current = epoch;
        attach(cached.data, epoch, holdFrame);
        setPhase("ready");
        return;
      }
      void sign(true, { switched: true, holdFrame });
    },
    [player, telemetry, attach, sign],
  );

  const presign = React.useCallback((ids: string[]) => {
    for (const vid of ids) {
      if (!vid || vid === activeIdRef.current || presigningRef.current.has(vid)) continue;
      const cached = signedRef.current.get(vid);
      if (cached && Date.now() - cached.at < PRESIGN_FRESH_MS) continue;
      presigningRef.current.add(vid);
      void getMatchVideoPlaybackResult(supabase, vid)
        .then((result) => {
          if (!mountedRef.current) return;
          if (result.ok && result.data && result.data.playability !== "processing") {
            signedRef.current.set(vid, { data: result.data, at: Date.now() });
          }
        })
        .catch(() => undefined)
        .finally(() => presigningRef.current.delete(vid));
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

  return {
    activeId,
    entryId,
    switchAngle,
    presign,
    currentTimeNow,
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
    frameShown: source != null && (frameGen === source.generation || source.holdFrame === true),
    onFirstFrameRender,
    telemetry,
  };
}

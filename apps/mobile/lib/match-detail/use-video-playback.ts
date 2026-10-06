import * as React from "react";
import { AppState, Platform } from "react-native";
import { useVideoPlayer, type VideoPlayer, type VideoThumbnail } from "expo-video";
import { supabase } from "@/lib/supabase/client";
import {
  getMatchVideoPlaybackResult,
  type MatchVideoPlayback,
} from "@jits/shared/api/queries";
import type { Result } from "@jits/shared/api/errors";
import { networkKey, type QualityDecision, type TargetRendition } from "@jits/shared/utils";
import { usePlaybackTelemetry, type PlaybackTelemetry } from "@/lib/video/use-playback-telemetry";
import { servedOf, useQualitySession } from "@/lib/video/quality/use-quality-session";
import { currentNetworkSnapshot } from "@/lib/video/quality/network-store";
import { deviceTier, readDeviceInfo } from "@/lib/video/multi-angle/device-tier";
import { DriftFilter, SWAP_MAX_ERROR_S, extrapolate } from "@/lib/video/multi-angle/sync-controller";
import {
  ABANDON_TIMEOUT_MS,
  AUDIO_RAMP,
  AUDIO_RAMP_STEPS,
  CROSSFADE_MS,
  DIP_MS,
  FAILURE_ABANDON_REASONS,
  INCOMING_FORWARD_BUFFER_S,
  KEEP_WATCHING_CAP_MS,
  KEEP_WATCHING_ENABLED,
  LOAD_RETRY_MAX,
  READY_FALLBACK_MS,
  START_AT_TARGET_SLACK_S,
  clampIncoming,
  decideChase,
  decideStart,
  incomingTarget,
  isDecoderError,
  mapToIncoming,
  networkClassOf,
  rampGains,
  retryNeedsResign,
  waitUntilTarget,
  type AbandonReason,
  type InPlaceReason,
  type NetworkClass,
} from "./keep-watching";
import {
  keepWatchingUnsupported,
  leadFor,
  markKeepWatchingUnsupported,
  recordSwitchTiming,
  startLatencyFor,
} from "./switch-lead-store";

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

/**
 * Angle switch phase 1 (jits-xfvd.16, contract:
 * research/2026-10-multi-angle-playback/06-angle-switch-phase1-contract.md).
 * `switchState` tells the screen what one angle switch is doing: a held
 * still of the outgoing frame while the new angle loads (`pending`), the
 * landing on the exact moment (`landing`, the still fades out over it), and
 * back to `idle`.
 */
/** Phases of ONE angle switch. A quality swap never leaves "idle". */
export type SwitchPhase = "idle" | "pending" | "landing";

export interface SwitchFailure {
  /** The seq of the switch that failed. */
  seq: number;
  /** The angle that could not be loaded. */
  targetId: string;
  /** Date.now() when the failure was decided. */
  at: number;
}

export interface SwitchState {
  phase: SwitchPhase;
  /** Increments on every accepted switchAngle call (never on a quality swap). 0 before the first switch. */
  seq: number;
  /** The angle that was on screen when this switch started (for a superseding switch: the previous switch's target). */
  fromId: string | null;
  /** The angle being switched to. On a restore after a failure: the angle being returned to. */
  targetId: string | null;
  /** Date.now() at the switchAngle call (the tap). Null when idle and nothing has happened yet. */
  startedAt: number | null;
  /** The caller said the target is not exact-synced (clock-only or unsynced). Drives copy and transition. */
  approximate: boolean;
  /** True while returning to fromId after a failed switch. */
  restoring: boolean;
  /** Native still of the outgoing frame, or null. */
  heldFrame: VideoThumbnail | null;
  /** Date.now() when this switch landed. Null until then. */
  landedAt: number | null;
  /** The most recent failed switch, until the next switchAngle call or an outside navigation. */
  failed: SwitchFailure | null;
  /** How this switch runs; null when idle before any switch (jits-xfvd.19). */
  mode: SwitchMode | null;
  /** keep_watching: the slot the outgoing angle plays in; null for in_place. */
  fromSlot: 0 | 1 | null;
  /** keep_watching: the slot the new angle loads in; null for in_place. */
  incomingSlot: 0 | 1 | null;
  /** keep_watching: the lead chosen at load (ms of wall time); null otherwise. */
  leadMs: number | null;
}

/** How an angle switch runs (jits-xfvd.19 contract 07). Base branch: always in_place. */
export type SwitchMode = "keep_watching" | "in_place";

/** A switch lands when the new item's time is within this of the resume target. */
export const LAND_TOLERANCE_S = 0.25;
/** timeUpdateEventInterval while a switch is pending (restored to 0.25 at idle). */
export const SWITCH_TIME_UPDATE_S = 0.1;
/** Longest wait for the held still before replaceAsync is issued anyway. */
export const HELD_FRAME_CAP_MS = 150;
/** A pending switch drops its held still after this long (the pill stays). */
export const SWITCH_HOLD_CAP_MS = 4000;
/** "landing" lasts this long, then the state returns to "idle" and heldFrame clears. */
export const SWITCH_SETTLE_MS = 300;
/**
 * The keep-watching engine extrapolates A from its last time update at most
 * this far (2.5 pending update intervals): a stalled A sends none (review L1).
 */
const A_EXTRAPOLATE_MAX_MS = 250;
/** Paused, no frame event after the post-seek readyToPlay: land after this. */
export const PAUSED_LAND_FALLBACK_MS = 350;

export const IDLE_SWITCH_STATE: SwitchState = {
  phase: "idle",
  seq: 0,
  fromId: null,
  targetId: null,
  startedAt: null,
  approximate: false,
  restoring: false,
  heldFrame: null,
  landedAt: null,
  failed: null,
  mode: null,
  fromSlot: null,
  incomingSlot: null,
  leadMs: null,
};

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
  switchAngle: (
    nextId: string,
    atSeconds: number,
    opts?: { approximate?: boolean; offsets?: { fromMs: number | null; toMs: number | null } },
  ) => void;
  /** Both slot players, fixed for the screen's life (jits-xfvd.19). Base branch: the one player twice. */
  players: readonly [VideoPlayer, VideoPlayer];
  /** The slot on screen (jits-xfvd.19). Base branch: always 0. */
  frontSlot: 0 | 1;
  /** Wire each slot's VideoView onFirstFrameRender to this (jits-xfvd.19). */
  onSlotFirstFrame: (slot: 0 | 1) => void;
  /** The current angle switch (jits-xfvd.16): its phase, held still, landing and failure. */
  switchState: SwitchState;
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

type SwitchTimer = "gate" | "holdCap" | "settle" | "pausedLand";

type SwapKind = "angle" | "quality" | "restore" | "angleRestore";

type KeepWatchingTimer = "play" | "ready" | "pausedLand" | "cap" | "abandon" | "settle";

/** The keep-watching engine's entry points (see `kwFnsRef`). */
type SwitchOffsets = { fromMs: number | null; toMs: number | null };

interface KeepWatchingFns {
  /** Why this switch must run in place (section 9), or null for keep_watching. */
  blocker: (opts: { offsets?: SwitchOffsets } | undefined) => InPlaceReason | null;
  start: (nextId: string, opts: { approximate?: boolean; offsets: SwitchOffsets }) => void;
  onPlayIntent: (playing: boolean) => void;
  onRate: (rate: number) => void;
  onUserSeek: (targetS: number) => void;
  onFrontError: () => void;
  /** Background or outside navigation: finish a landing, abandon a pending switch. */
  onLeave: (reason: "background" | "navigation") => void;
  onUnmount: () => void;
  incomingStatus: (p: VideoPlayer, status: string, message: string | null) => void;
  incomingTime: (p: VideoPlayer, t: number) => void;
  incomingDuration: (p: VideoPlayer, duration: number) => void;
  incomingFrame: () => void;
  incomingEnded: (p: VideoPlayer) => void;
}

const INERT_KEEP_WATCHING: KeepWatchingFns = {
  blocker: () => "disabled",
  start: () => undefined,
  onPlayIntent: () => undefined,
  onRate: () => undefined,
  onUserSeek: () => undefined,
  onFrontError: () => undefined,
  onLeave: () => undefined,
  onUnmount: () => undefined,
  incomingStatus: () => undefined,
  incomingTime: () => undefined,
  incomingDuration: () => undefined,
  incomingFrame: () => undefined,
  incomingEnded: () => undefined,
};

/**
 * One keep-watching switch in flight (jits-xfvd.19, contract 07): A (the
 * front player) keeps playing while B (the other slot) loads the target
 * angle hidden under it, is brought into step, and takes over at LAND.
 */
interface KeepWatchingRun {
  seq: number;
  targetId: string;
  A: VideoPlayer;
  B: VideoPlayer;
  fromSlot: 0 | 1;
  inSlot: 0 | 1;
  cls: NetworkClass;
  /** Not sync-checked: the caller said approximate, or the offsets are unknown. */
  approximate: boolean;
  fromMs: number | null;
  toMs: number | null;
  tapAt: number;
  /** map(A's time at the tap): how late the landing was is measured from here. */
  tapMappedS: number;
  rendition: TargetRendition;
  data: MatchVideoPlayback | null;
  signedAt: number;
  durationBS: number | null;
  /** B's item generation (a retry is a new one); null while signing or after an error. */
  gen: number | null;
  /** B's replaceAsync for `gen` resolved. */
  settled: boolean;
  loadIssuedAt: number;
  /** B's seek to t0 went out (only then a ready event or a frame counts). */
  seekIssued: boolean;
  ready: boolean;
  /** B's view has drawn a frame of the current item (a paused landing waits for one when it can). */
  bFrameDrawn: boolean;
  /** replaceAsync to ready at the target (ms), of the latest load. */
  readyMs: number | null;
  t0S: number;
  covered: boolean;
  /** The lead (wall seconds) of the current target; 0 when paused. */
  leadS: number;
  /** The lead chosen at the first load (telemetry and switchState.leadMs). */
  leadMs: number | null;
  /** Planned as playing (lead, scheduled play, chase) or paused (exact, land on the frame). */
  playMode: boolean;
  rate: number;
  bPlaying: boolean;
  playCalledAt: number | null;
  startLatencyMs: number | null;
  /** B has shown an advancing time update since its latest play() or re-seek. */
  advanced: boolean;
  /** The time B advances from (t0, or a hidden re-seek's target). */
  baseT: number;
  bSample: { t: number; at: number } | null;
  inStep: number;
  filter: DriftFilter;
  lastErrorS: number | null;
  retargets: number;
  hiddenReseeks: number;
  loadRetries: number;
  landing: boolean;
  /** B reached its end while pending (a shorter angle). */
  ended: boolean;
  timers: Partial<Record<KeepWatchingTimer, ReturnType<typeof setTimeout>>>;
  rampTimers: Array<ReturnType<typeof setTimeout>>;
}

/** Angle switches and their restores seek and play at the swap's settle (contract 3.7). */
function seeksAtSettle(kind: SwapKind | null): boolean {
  return kind === "angle" || kind === "angleRestore";
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

function safely(fn: () => void): void {
  try {
    fn();
  } catch {
    // The player was released (screen unmounting).
  }
}

/** Both slot players: 250 ms time updates and pitch-corrected speed. */
function setupSlotPlayer(p: VideoPlayer): void {
  p.timeUpdateEventInterval = TIME_UPDATE_S;
  p.preservesPitch = true;
}

/** A player's timeUpdateEventInterval, written only on a change. */
function setIntervalOn(p: VideoPlayer, seconds: number): void {
  safely(() => {
    if (p.timeUpdateEventInterval !== seconds) p.timeUpdateEventInterval = seconds;
  });
}

/** preferredForwardBufferDuration back to the platform default (0 = automatic on iOS, 20 on Android). */
function restoreForwardBuffer(p: VideoPlayer): void {
  safely(() => {
    p.bufferOptions = { ...p.bufferOptions, preferredForwardBufferDuration: Platform.OS === "android" ? 20 : 0 };
  });
}

/**
 * A slot player goes back to holding nothing (contract 07 section 2.1 and
 * 7): silent, normal volume and speed, paused, item cleared (its decoder
 * freed). The rate is written before the pause: on iOS a rate write can
 * start an AVPlayer.
 */
function releaseSlot(p: VideoPlayer): void {
  safely(() => {
    p.muted = true;
    p.volume = 1;
    if (p.playbackRate !== 1) p.playbackRate = 1;
    p.pause();
  });
  safely(() => {
    void p.replaceAsync(null).catch(() => undefined);
  });
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
 * keeps the one telemetry session (it counts the switch and times tap to
 * landing). `presign` signs the other playable angles when the screen
 * learns them, so a switch normally skips the sign round trip.
 *
 * Angle switch phase 1 (jits-xfvd.16): a switch takes a native still of the
 * outgoing frame before the swap (`switchState.heldFrame`, for the screen's
 * overlay), seeks and plays at the swap's settle instead of after
 * readyToPlay, lands within LAND_TOLERANCE_S of the target (paused: the
 * post-seek first frame, or PAUSED_LAND_FALLBACK_MS after the post-seek
 * readyToPlay), and on failure restores the previous angle at its moment of
 * the tap instead of failing playback. See `SwitchState`.
 *
 * Silent switch: expo-video always runs the iOS audio session in the
 * `.playback` category, so the film is audible with the ringer off (expo-av
 * needed `playsInSilentModeIOS`).
 *
 * Adaptive quality (jits-xfvd.12): the start selection picks the 720p or
 * 360p copy before the first sign, and `useQualitySession` may step it down
 * or up mid-session. A quality swap is the SAME in-place swap as an angle
 * switch (`swapSource`, same id at the exact current position, held frame,
 * play intent and rate kept, landed only after the resume seek), but it is
 * not an angle switch in telemetry. Signed sources are cached per (angle,
 * rendition); every sign (first, re-sign, retry, angle switch, presign)
 * asks for the session's current target rendition.
 */
export function useVideoPlayback(id: string | undefined, startSeconds?: number | null): VideoPlayback {
  // Two slot players for the screen's life (jits-xfvd.19): the front one is
  // on screen; the other holds no item (no decoder) except during a
  // keep-watching switch, when it loads the incoming angle.
  const player0 = useVideoPlayer(null, setupSlotPlayer);
  const player1 = useVideoPlayer(null, setupSlotPlayer);
  const players = React.useMemo(() => [player0, player1] as const, [player0, player1]);
  const [frontSlot, setFrontSlot] = React.useState<0 | 1>(0);
  const frontSlotRef = React.useRef<0 | 1>(0);
  /** The front player, moved synchronously at a keep-watching landing (ahead of the render). */
  const frontRef = React.useRef<VideoPlayer>(player0);
  const player = players[frontSlot];
  // One session per screen: `videoId` stays the angle it opened on. It
  // follows the front player (rebound at a keep-watching landing).
  const telemetry = usePlaybackTelemetry(player, { surface: "match", videoId: id ?? null, angle: null, angleCount: null });
  const [activeId, setActiveId] = React.useState(id);
  const activeIdRef = React.useRef(id);
  /** Signed sources by `${angle id}:${target rendition}` (the active one and every pre-signed one). */
  const signedRef = React.useRef(new Map<string, { data: MatchVideoPlayback; at: number }>());
  const presigningRef = React.useRef(new Set<string>());
  /** The ids the screen last asked to pre-sign (re-signed at a new rendition after a quality swap). */
  const presignIdsRef = React.useRef<string[]>([]);
  /** The generation an angle switch or a quality swap loaded, until its first frame shows. */
  const switchGenRef = React.useRef<number | null>(null);
  /**
   * What the in-flight swap is (telemetry and the controller treat them
   * apart). "restore" puts the file back after a failed quality swap;
   * "angleRestore" puts the previous angle back after a failed angle switch.
   */
  const swapKindRef = React.useRef<SwapKind | null>(null);
  /**
   * The quality swap in flight, from its start to its landing, failure or
   * supersession (review H1, H2): the file it replaces, so a failed sign
   * puts that one back instead of failing playback.
   */
  const qualityPendingRef = React.useRef<{ prev: MatchVideoPlayback | null; holdFrame: boolean } | null>(null);
  /** The signed source on (or going to) the player. */
  const currentDataRef = React.useRef<MatchVideoPlayback | null>(null);
  /** The served rendition and availability of the file on (or going to) the player. */
  const servedRef = React.useRef<ReturnType<typeof servedOf> | null>(null);
  /**
   * The switched-in item's resume seek has landed (or it needed none). Until
   * then a first frame may be the item's frame 0, so the switch is not
   * counted as landed and the held frame stays (review M2).
   */
  const switchSeekLandedRef = React.useRef(true);
  /** The generation whose resume seek has been issued (markLoaded). */
  const seekIssuedGenRef = React.useRef<number | null>(null);
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
  /** The generation whose first frame is on screen (ahead of the `frameGen` render). */
  const frameShownGenRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ---- One angle switch's state (jits-xfvd.16, contract section 3) ----
  const [switchState, setSwitchStateValue] = React.useState<SwitchState>(IDLE_SWITCH_STATE);
  const switchStateRef = React.useRef<SwitchState>(IDLE_SWITCH_STATE);
  const setSwitch = React.useCallback((next: SwitchState) => {
    switchStateRef.current = next;
    if (mountedRef.current) setSwitchStateValue(next);
  }, []);
  /** The outgoing angle's own time at the tap (fractional seconds): a failed switch restores it there. */
  const switchFromAtRef = React.useRef(0);
  /** The resume target the switched-in item lands on (clamped to a shorter angle's end once known). */
  const landAtRef = React.useRef(0);
  /** The generation whose resume seek was issued at its replaceAsync settle, and the target it seeked to. */
  const settleSeekRef = React.useRef<{ gen: number; at: number } | null>(null);
  /**
   * The held still's gate: while it is closed, `replace` parks the new
   * source, so the thumbnail of the outgoing frame is taken while the player
   * still describes the outgoing asset. It opens when the thumbnail settles
   * or after HELD_FRAME_CAP_MS. `replaced`: a replaceAsync was issued since
   * (a thumbnail resolving after that is discarded).
   */
  const gateRef = React.useRef<{ seq: number; open: boolean; pending: PlaybackSource | null; replaced: boolean } | null>(null);
  const switchTimersRef = React.useRef<Partial<Record<SwitchTimer, ReturnType<typeof setTimeout>>>>({});
  const clearSwitchTimer = React.useCallback((name: SwitchTimer) => {
    const t = switchTimersRef.current[name];
    if (t) clearTimeout(t);
    delete switchTimersRef.current[name];
  }, []);
  const setSwitchTimer = React.useCallback(
    (name: SwitchTimer, ms: number, fn: () => void) => {
      clearSwitchTimer(name);
      switchTimersRef.current[name] = setTimeout(() => {
        delete switchTimersRef.current[name];
        if (mountedRef.current) fn();
      }, ms);
    },
    [clearSwitchTimer],
  );
  React.useEffect(
    () => () => {
      for (const name of Object.keys(switchTimersRef.current) as SwitchTimer[]) clearSwitchTimer(name);
    },
    [clearSwitchTimer],
  );
  const setUpdateInterval = React.useCallback(
    (seconds: number) =>
      safely(() => {
        if (frontRef.current.timeUpdateEventInterval !== seconds) frontRef.current.timeUpdateEventInterval = seconds;
      }),
    [],
  );
  /** Back to idle (the landing settled, the restore failed, or an outside navigation). */
  const switchToIdle = React.useCallback(
    (next: SwitchState) => {
      for (const name of ["gate", "holdCap", "settle", "pausedLand"] as SwitchTimer[]) clearSwitchTimer(name);
      setSwitch({ ...next, phase: "idle", heldFrame: null, restoring: false });
      setUpdateInterval(TIME_UPDATE_S);
    },
    [clearSwitchTimer, setSwitch, setUpdateInterval],
  );
  // A failed switch restores the previous angle, and a failed restore shows
  // the retry panel; both are defined further down (they need swapSource).
  const failSwitchRef = React.useRef<() => void>(() => undefined);
  const restoreFailedRef = React.useRef<() => void>(() => undefined);

  // ---- The keep-watching switch (jits-xfvd.19, contract 07) ----
  /** The keep-watching switch in flight (pending or landing), else null. */
  const kwRef = React.useRef<KeepWatchingRun | null>(null);
  /**
   * The engine's entry points, rebuilt every render (they only read refs):
   * effects, listeners and timers call through this, defined further down.
   */
  const kwFnsRef = React.useRef<KeepWatchingFns>(INERT_KEEP_WATCHING);
  /** A's latest accepted time update (the event, not the getter), for extrapolation. */
  const aSampleRef = React.useRef<{ t: number; at: number } | null>(null);
  /** The source the front player was last asked to load (the source effect never reissues it). */
  const issuedSourceRef = React.useRef<PlaybackSource | null>(null);

  // The quality policy (shared with the multi-angle player). A decision is
  // applied with `swapSource` below, through a ref (it is defined later).
  const applyQualityRef = React.useRef<(d: QualityDecision) => boolean>(() => false);
  const quality = useQualitySession({
    telemetry,
    readConditions: () => {
      const current = sourceRef.current;
      return {
        playing: playingRef.current,
        seeking: holdRef.current != null,
        rate: rateRef.current,
        // No quality decision while any angle switch is not idle (contract 07 section 6).
        swapInFlight:
          signingRef.current || !loadedRef.current || switchGenRef.current != null || switchStateRef.current.phase !== "idle",
        frameShown: current != null && frameShownGenRef.current === current.generation,
      };
    },
    apply: (d) => applyQualityRef.current(d),
  });
  const feed = quality.feed;

  /** Hand a signed source to the player, resuming at the current position. */
  const attach = React.useCallback(
    (data: MatchVideoPlayback, epoch: number, holdFrame: boolean, swapped = false) => {
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
      currentDataRef.current = data;
      setSource(nextSource);
      telemetry.sourceAttached(data.sourceKind ?? "original");
      const served = servedOf(data);
      servedRef.current = served;
      telemetry.renditionAttached(served.served, data.playbackProfile ?? null);
      // A plain (re-)sign: the level follows what this file serves now. A
      // swap's file is recorded when it lands (frameLanded).
      if (!swapped) quality.attached(served.served, served.available);
    },
    [telemetry, quality],
  );

  /** The in-flight quality swap will not land (superseded, failed or errored). */
  const dropQualitySwap = React.useCallback(() => {
    const pending = qualityPendingRef.current;
    qualityPendingRef.current = null;
    if (pending) quality.failed();
    if (swapKindRef.current === "quality") swapKindRef.current = null;
  }, [quality]);

  /**
   * A quality swap's sign failed: put the file it was replacing back, at the
   * exact position behind the held frame, play intent and speed untouched.
   * Playback never fails over a lighter copy that could not be signed.
   */
  const restoreAfterQualityFailure = React.useCallback(
    (prev: MatchVideoPlayback, holdFrame: boolean) => {
      const epoch = ++epochRef.current;
      signingRef.current = false;
      swapKindRef.current = "restore";
      switchGenRef.current = epoch;
      attach(prev, epoch, holdFrame);
      setPhase("ready");
    },
    [attach],
  );

  const sign = React.useCallback(
    async (
      silent: boolean,
      opts: { switched?: boolean; holdFrame?: boolean; rendition?: TargetRendition; quality?: boolean; kind?: SwapKind } = {},
    ) => {
      const target = activeIdRef.current;
      if (!target) {
        telemetry.signOutcome("absent");
        setPhase("absent");
        return;
      }
      const epoch = ++epochRef.current;
      signingRef.current = true;
      if (!silent) setPhase("loading");
      const rendition = opts.rendition ?? (await quality.signTarget());
      if (epoch !== epochRef.current) return;
      let result: Result<MatchVideoPlayback | null>;
      try {
        result = await getMatchVideoPlaybackResult(supabase, target, { rendition });
      } catch (e) {
        // A thrown sign fails an angle switch (or its restore) like a failed one.
        if (opts.kind !== "angle" && opts.kind !== "angleRestore") throw e;
        result = { ok: false, error: { code: "UNKNOWN", message: e instanceof Error ? e.message : String(e) } };
      }
      // A newer sign (or switch) started, or the screen unmounted.
      if (epoch !== epochRef.current) return;
      signingRef.current = false;
      const next = phaseFor(result);
      const playable = next === "ready" && result.ok && result.data != null;
      if (!playable && (opts.kind === "angle" || opts.kind === "angleRestore")) {
        // No silent fallback for a switch (contract 3.5): a failed switch
        // restores the previous angle; a failed restore shows the retry panel.
        telemetry.signOutcome(next === "loading" ? "pending" : next === "ready" ? "failed" : next);
        if (opts.kind === "angle") failSwitchRef.current();
        else restoreFailedRef.current();
        return;
      }
      if (opts.quality && !(next === "ready" && result.ok && result.data)) {
        // A failed quality swap is not a failed video (review H1).
        const pending = qualityPendingRef.current;
        dropQualitySwap();
        switchGenRef.current = null;
        if (pending?.prev) {
          restoreAfterQualityFailure(pending.prev, pending.holdFrame);
          return;
        }
      }
      telemetry.signOutcome(next === "ready" ? "ok" : next === "loading" ? "pending" : next);
      if (next === "ready" && result.ok && result.data) {
        signedRef.current.set(`${target}:${rendition}`, { data: result.data, at: Date.now() });
        if (opts.switched) switchGenRef.current = epoch;
        attach(result.data, epoch, opts.holdFrame === true, opts.switched === true);
      } else if (opts.switched) {
        dropQualitySwap();
        switchGenRef.current = null;
      }
      setPhase(next);
    },
    [telemetry, attach, quality, dropQualitySwap, restoreAfterQualityFailure],
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
    // A keep-watching switch never carries over (contract 07 section 3.6):
    // a landing finishes, a pending one is abandoned silently.
    kwFnsRef.current.onLeave("navigation");
    ownIdsRef.current = new Set(id ? [id] : []);
    activeIdRef.current = id;
    setActiveId(id);
    setEntryId(id);
    telemetry.setMeta({ videoId: id ?? null });
    switchGenRef.current = null;
    swapKindRef.current = null;
    qualityPendingRef.current = null;
    switchSeekLandedRef.current = true;
    // No switch carries over into another recording (contract 3.8).
    gateRef.current = null;
    settleSeekRef.current = null;
    switchToIdle({ ...IDLE_SWITCH_STATE, seq: switchStateRef.current.seq });
    // A fresh open: a new start selection (and controller) for it.
    void quality.begin();
    // Like a fresh open: start at the new route's `?t=` (review m2).
    const s0 = startRef.current;
    const start = s0 != null && Number.isFinite(s0) && s0 > 0 ? s0 : 0;
    positionRef.current = start;
    setPositionS(start);
    holdRef.current = null;
    streakRef.current = false;
    silentCountRef.current = 0;
    void sign(false);
  }, [id, sign, telemetry, quality, switchToIdle]);

  const retry = React.useCallback(() => setAttempt((n) => n + 1), []);

  const onPlayerError = React.useCallback(
    (_message?: string | null) => {
      // A keep-watching switch whose front angle errors is abandoned first
      // (front_error, no tag); the front then takes today's re-sign path.
      kwFnsRef.current.onFrontError();
      if (signingRef.current) return;
      // The item of a pending angle switch (or its restore) failed: no
      // silent re-sign (contract 3.5).
      const gen = sourceRef.current?.generation;
      const pendingKind = gen != null && gen === switchGenRef.current ? swapKindRef.current : null;
      if (pendingKind === "angle") {
        failSwitchRef.current();
        return;
      }
      if (pendingKind === "angleRestore") {
        restoreFailedRef.current();
        return;
      }
      loadedRef.current = false;
      setLoaded(false);
      if (streakRef.current || silentCountRef.current >= MAX_SILENT_RESIGNS) {
        setPhase("failed");
        return;
      }
      streakRef.current = true;
      silentCountRef.current += 1;
      telemetry.resigned();
      // A quality swap (or its restore) that errored keeps its held frame
      // through the re-sign: no poster flash (review R2-L1).
      const kind = swapKindRef.current;
      const holdFrame = (kind === "restore" || kind === "quality") && sourceRef.current?.holdFrame === true;
      if (kind === "restore") swapKindRef.current = null;
      // A quality swap that errored does not land; the re-sign uses its level.
      dropQualitySwap();
      // The re-sign is a new generation: the old swap can never land now.
      switchGenRef.current = null;
      void sign(true, holdFrame ? { holdFrame } : {});
    },
    [sign, telemetry, dropQualitySwap],
  );
  const onPlayerErrorRef = React.useRef(onPlayerError);
  React.useEffect(() => {
    onPlayerErrorRef.current = onPlayerError;
  });

  /**
   * The item on the player is a superseded angle: a newer angle switch (or
   * restore) is still signing. It is never loaded (review M1) and never
   * started (review L6).
   */
  const supersededWhileSigning = () => signingRef.current && seeksAtSettle(swapKindRef.current);

  const startPlayback = React.useCallback(() => {
    safely(() => {
      // Setting the rate on iOS sets AVPlayer.rate, which also starts playback:
      // only ever touch it on the way into play().
      if (frontRef.current.playbackRate !== rateRef.current) frontRef.current.playbackRate = rateRef.current;
      frontRef.current.play();
    });
  }, []);

  /**
   * The current item is loaded and ready: seek to the resume point. Playback
   * then starts from the play-intent effect, which runs on `loaded`.
   */
  const markLoaded = React.useCallback(() => {
    const current = sourceRef.current;
    if (!current || loadedRef.current || settledGenRef.current !== current.generation) return;
    // A newer angle switch (or restore) is still signing: this item is a
    // superseded angle. It never loads, so it does not seek, play, report
    // time, or move the point the new angle resumes at (review M1).
    if (supersededWhileSigning()) return;
    let ready = false;
    safely(() => {
      ready = frontRef.current.status === "readyToPlay";
    });
    if (!ready) return;
    clearAutoplayTimer();
    loadedRef.current = true;
    setLoaded(true);
    safely(() => {
      if (frontRef.current.duration > 0) {
        durationRef.current = frontRef.current.duration;
        setDurationS(frontRef.current.duration);
      }
    });
    let at = resumeAtRef.current;
    resumeAtRef.current = null;
    // A shorter angle cannot resume past its end (review m1).
    let duration = 0;
    safely(() => {
      duration = frontRef.current.duration;
    });
    if (at && duration > 0 && at > duration - END_EPSILON_S) {
      at = Math.max(0, duration - END_EPSILON_S);
      positionRef.current = at;
      progressBaseRef.current = at;
    }
    if (current.generation === switchGenRef.current && !at) switchSeekLandedRef.current = true;
    const settleSeek = settleSeekRef.current;
    if (settleSeek && settleSeek.gen === current.generation) {
      // The resume seek went out at the swap's settle (contract 3.7). Seek
      // again only when the clamp moved the target or the item is more than
      // LAND_TOLERANCE_S away from it (a fallback, counted nowhere).
      settleSeekRef.current = null;
      let now = Number.NaN;
      safely(() => {
        now = frontRef.current.currentTime;
      });
      if (at && (at !== settleSeek.at || !(Math.abs(now - at) <= LAND_TOLERANCE_S))) {
        landAtRef.current = at;
        holdRef.current = { at, left: SEEK_HOLD_MAX_UPDATES };
        feed();
        telemetry.expectWait();
        setPositionS(at);
        const target = at;
        safely(() => {
          frontRef.current.currentTime = target;
        });
      }
      // Paused, the view may draw no new frame for a seek: land after a beat.
      if (
        seeksAtSettle(swapKindRef.current) &&
        current.generation === switchGenRef.current &&
        !switchSeekLandedRef.current &&
        !playingRef.current
      ) {
        const gen = current.generation;
        setSwitchTimer("pausedLand", PAUSED_LAND_FALLBACK_MS, () => {
          if (switchGenRef.current !== gen || switchSeekLandedRef.current || playingRef.current) return;
          switchSeekLandedRef.current = true;
          frameLandedRef.current(gen);
        });
      }
    } else if (at) {
      seekIssuedGenRef.current = current.generation;
      holdRef.current = { at, left: SEEK_HOLD_MAX_UPDATES };
      // The controller sees the seek hold BEFORE telemetry closes any open stall (review M3).
      feed();
      telemetry.expectWait();
      setPositionS(at);
      safely(() => {
        frontRef.current.currentTime = at;
      });
    }
  }, [telemetry, feed, setSwitchTimer]);

  const autoplayTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearAutoplayTimer = () => {
    if (autoplayTimerRef.current) clearTimeout(autoplayTimerRef.current);
    autoplayTimerRef.current = null;
  };
  React.useEffect(() => clearAutoplayTimer, []);

  /**
   * The angle switch (or its restore) landed (contract 3.3): the still stays
   * up for the screen's crossfade, and the state settles to idle
   * SWITCH_SETTLE_MS later. A restore is not a landed switch in telemetry.
   */
  const landSwitch = React.useCallback(
    (kind: "angle" | "angleRestore") => {
      const st = switchStateRef.current;
      clearSwitchTimer("holdCap");
      clearSwitchTimer("pausedLand");
      if (kind === "angle") {
        telemetry.switchLanded();
        if (st.phase === "pending" && st.heldFrame != null) telemetry.switchHeldStill();
      }
      if (st.phase !== "pending") return;
      const landed: SwitchState = { ...st, phase: "landing", landedAt: Date.now() };
      setSwitch(landed);
      setSwitchTimer("settle", SWITCH_SETTLE_MS, () => {
        const cur = switchStateRef.current;
        if (cur.seq !== landed.seq || cur.phase !== "landing") return;
        switchToIdle(cur);
      });
    },
    [telemetry, clearSwitchTimer, setSwitch, setSwitchTimer, switchToIdle],
  );

  /** A frame of generation `gen` is on screen (lifts the poster; ends a switch's wait). */
  const frameLanded = React.useCallback(
    (gen: number) => {
      // A switched-in item's frame before its resume seek lands may be its
      // frame 0: keep the held frame and do not count the switch yet.
      if (switchGenRef.current === gen && !switchSeekLandedRef.current) return;
      frameShownGenRef.current = gen;
      setFrameGen(gen);
      if (switchGenRef.current === gen) {
        switchGenRef.current = null;
        const kind = swapKindRef.current;
        swapKindRef.current = null;
        const served = servedRef.current;
        if (kind === "quality") {
          qualityPendingRef.current = null;
          // Not an angle switch: its own latency, and the level follows the served file.
          telemetry.qualitySwitchLanded();
          if (served) quality.landed(served.served, served.available);
          // Other angles were pre-signed at the old rendition.
          presignRef.current(presignIdsRef.current);
        } else if (kind === "angle" || kind === "angleRestore") {
          landSwitch(kind);
          if (served) quality.angleChanged(served.served, served.available);
        }
      }
      feed();
    },
    [telemetry, quality, feed, landSwitch],
  );
  const frameLandedRef = React.useRef(frameLanded);
  frameLandedRef.current = frameLanded;

  // Swap each newly signed URL into the one player. Only the latest swap's
  // outcome counts; a superseded swap that settles after it reloads the
  // latest URL (the native item may be the stale one).
  const swapRef = React.useRef({ seq: 0, doneSeq: 0 });
  const replace = React.useCallback(
    (next: PlaybackSource) => {
      issuedSourceRef.current = next;
      const gate = gateRef.current;
      if (gate && !gate.open) {
        // The held still is being taken off the outgoing item: wait for it.
        gate.pending = next;
        return;
      }
      if (gate) gate.replaced = true;
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
        if (next.generation === switchGenRef.current && seeksAtSettle(swapKindRef.current)) {
          // An angle switch (or its restore) seeks and plays right at the
          // settle, not after readyToPlay (contract 3.7): the new item then
          // buffers at the target instead of at 0. iOS applies a time set
          // during the replace right after it; Android can seek once
          // replaceAsync has resolved.
          const at = resumeAtRef.current;
          if (at) {
            settleSeekRef.current = { gen: next.generation, at };
            landAtRef.current = at;
            seekIssuedGenRef.current = next.generation;
            holdRef.current = { at, left: SEEK_HOLD_MAX_UPDATES };
            feed();
            telemetry.expectWait();
            safely(() => {
              frontRef.current.currentTime = at;
            });
          }
          if (playingRef.current) startPlayback();
        }
        // readyToPlay may have fired before this promise settled.
        markLoaded();
        if (!loadedRef.current) {
          autoplayTimerRef.current = setTimeout(() => {
            autoplayTimerRef.current = null;
            if (!mountedRef.current || loadedRef.current || settledGenRef.current !== next.generation) return;
            if (playingRef.current && !supersededWhileSigning()) startPlayback();
          }, AUTOPLAY_FALLBACK_MS);
        }
      };
      let pending: Promise<void>;
      try {
        pending = frontRef.current.replaceAsync({ uri: next.url });
      } catch (e) {
        settle(false, e instanceof Error ? e.message : String(e));
        return;
      }
      pending.then(
        () => settle(true),
        (e: unknown) => settle(false, e instanceof Error ? e.message : String(e)),
      );
    },
    [markLoaded, telemetry, startPlayback, feed],
  );
  const replaceRef = React.useRef(replace);
  replaceRef.current = replace;

  React.useEffect(() => {
    // A keep-watching landing hands the front an item its player already
    // holds (issued there as the incoming angle): never load it again.
    if (source && issuedSourceRef.current !== source) replace(source);
  }, [source, replace]);

  /** The held still's gate opens: issue the parked swap (the latest source). */
  const openGate = React.useCallback(
    (seq: number) => {
      const gate = gateRef.current;
      if (!gate || gate.seq !== seq || gate.open) return;
      gate.open = true;
      clearSwitchTimer("gate");
      const parked = gate.pending;
      gate.pending = null;
      if (parked && mountedRef.current) replaceRef.current(sourceRef.current ?? parked);
    },
    [clearSwitchTimer],
  );

  // The FRONT player's events (re-subscribed when a keep-watching landing
  // moves the front). Between the landing and that re-subscription the old
  // front's events are ignored: it is no longer the one on screen.
  React.useEffect(() => {
    const subs: Array<{ remove: () => void }> = [];
    const isFront = () => frontRef.current === player;
    safely(() => {
      subs.push(
        player.addListener("statusChange", ({ status, error }) => {
          if (!isFront()) return;
          if (status === "readyToPlay") markLoaded();
          else if (status === "error") {
            // A swap in flight reports through its own promise.
            if (settledGenRef.current == null || settledGenRef.current !== sourceRef.current?.generation) return;
            onPlayerErrorRef.current(error?.message ?? null);
          }
        }),
        player.addListener("sourceLoad", ({ duration }) => {
          if (!isFront()) return;
          if (duration > 0) {
            durationRef.current = duration;
            setDurationS(duration);
          }
        }),
        player.addListener("timeUpdate", ({ currentTime }) => {
          if (!isFront() || !loadedRef.current) return;
          const hold = holdRef.current;
          if (hold) {
            if (Math.abs(currentTime - hold.at) > SEEK_LANDED_S && hold.left > 0) {
              hold.left -= 1;
              return;
            }
            holdRef.current = null;
            if (
              !switchSeekLandedRef.current &&
              !seeksAtSettle(swapKindRef.current) &&
              sourceRef.current?.generation === switchGenRef.current
            ) {
              // The quality-swapped item reached its resume point: now a
              // frame on screen is the right instant.
              switchSeekLandedRef.current = true;
              frameLanded(sourceRef.current.generation);
            }
          }
          const gen = sourceRef.current?.generation;
          if (
            gen != null &&
            gen === switchGenRef.current &&
            !switchSeekLandedRef.current &&
            seeksAtSettle(swapKindRef.current) &&
            seekIssuedGenRef.current === gen &&
            playingRef.current &&
            currentTime >= landAtRef.current - LAND_TOLERANCE_S
          ) {
            // An angle switch lands on a time within LAND_TOLERANCE_S of its
            // target (contract 3.3), never on the looser seek hold. A time
            // already past the target also lands (review H1): playback has
            // moved on from it, and a stale time (frame 0, the old spot) is
            // always before it.
            switchSeekLandedRef.current = true;
            frameLanded(gen);
          }
          positionRef.current = currentTime;
          setPositionS(currentTime);
          aSampleRef.current = { t: currentTime, at: Date.now() };
          if (currentTime > progressBaseRef.current + 0.1 && sourceRef.current) {
            // Moving past the start point means a frame is on screen (the
            // fallback for an onFirstFrameRender that iOS can skip).
            frameLanded(sourceRef.current.generation);
          }
          if (streakRef.current && currentTime > progressBaseRef.current + PROGRESS_S) {
            streakRef.current = false;
          }
          // The quality controller's tick (smooth time, an open stall's length).
          feed();
        }),
        player.addListener("playToEnd", () => {
          if (!isFront()) return;
          playingRef.current = false;
          setPlaying(false);
        }),
      );
    });
    return () => {
      for (const sub of subs) safely(() => sub.remove());
    };
  }, [player, markLoaded, frameLanded, feed]);

  // expo-video pauses in the background (staysActiveInBackground is off):
  // show it paused, so the athlete resumes with Play instead of a Pause
  // button over a stopped film.
  React.useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      // (A keep-watching switch was already finished or abandoned by the layout-effect listener below.)
      if (next === "background") setPlaying(false);
    });
    return () => sub?.remove?.();
  }, []);

  // The athlete's play/pause intent drives the player once an item is loaded.
  React.useEffect(() => {
    playingRef.current = playing;
    // The controller sees the pause BEFORE telemetry closes an open stall (review M3).
    feed();
    telemetry.playIntent(playing);
    if (!loadedRef.current) {
      // Settled but not ready: iOS keeps a paused item "loading" until it is
      // asked to play, so Play kicks it (review H2) and Pause stops a
      // settle-time play() (review L1), like the autoplay backstop.
      const current = sourceRef.current;
      if (current && settledGenRef.current === current.generation) {
        if (playing) {
          if (!supersededWhileSigning()) startPlayback();
        } else safely(() => frontRef.current.pause());
      }
      return;
    }
    if (playing) startPlayback();
    else {
      safely(() => frontRef.current.pause());
      // Paused mid-switch after the post-seek readyToPlay: no time update
      // will land it, so the paused fallback does (contract 3.3).
      const gen = sourceRef.current?.generation;
      if (
        gen != null &&
        gen === switchGenRef.current &&
        seeksAtSettle(swapKindRef.current) &&
        seekIssuedGenRef.current === gen &&
        !switchSeekLandedRef.current
      ) {
        setSwitchTimer("pausedLand", PAUSED_LAND_FALLBACK_MS, () => {
          if (switchGenRef.current !== gen || switchSeekLandedRef.current || playingRef.current) return;
          switchSeekLandedRef.current = true;
          frameLandedRef.current(gen);
        });
      }
    }
    // A pending keep-watching switch follows the intent (contract 07 section 3.5).
    kwFnsRef.current.onPlayIntent(playing);
  }, [playing, loaded, startPlayback, telemetry, feed, setSwitchTimer]);

  React.useEffect(() => {
    rateRef.current = rate;
    feed();
    kwFnsRef.current.onRate(rate);
    if (!loadedRef.current || !playingRef.current) return;
    safely(() => {
      frontRef.current.playbackRate = rate;
    });
  }, [rate, loaded, feed]);

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
      // A seek during a pending angle switch: it lands at the new spot
      // (review H1); a paused one is landed by its first frame or fallback.
      const gen = sourceRef.current?.generation;
      if (gen != null && gen === switchGenRef.current && seeksAtSettle(swapKindRef.current) && !switchSeekLandedRef.current) {
        landAtRef.current = clamped;
      }
      // The controller sees the seek BEFORE telemetry closes an open stall (review M3).
      feed();
      telemetry.seekRequested();
      safely(() => {
        frontRef.current.currentTime = clamped;
      });
      // A keep-watching switch retargets B from the seek's target (contract 07 section 3.5).
      aSampleRef.current = { t: clamped, at: Date.now() };
      kwFnsRef.current.onUserSeek(clamped);
    },
    [telemetry, feed],
  );

  const toggle = React.useCallback(() => {
    const duration = durationRef.current || sourceRef.current?.durationSeconds || 0;
    if (!playingRef.current && duration > 0 && positionRef.current >= duration - END_EPSILON_S) seek(0);
    setPlaying((p) => !p);
  }, [seek]);

  const onFirstFrameRender = React.useCallback(() => {
    telemetry.firstFrame();
    const current = sourceRef.current;
    if (!current || settledGenRef.current !== current.generation) return;
    // Paused, no time update may come: a frame drawn after the resume seek
    // was issued is the seeked frame (review r2-m1). One drawn before it is
    // still ignored (it may be frame 0); playing, the time update decides.
    if (
      current.generation === switchGenRef.current &&
      !switchSeekLandedRef.current &&
      seekIssuedGenRef.current === current.generation &&
      !playingRef.current
    ) {
      switchSeekLandedRef.current = true;
    }
    frameLanded(current.generation);
  }, [telemetry, frameLanded]);

  const currentTimeNow = React.useCallback(() => {
    // A seek (or a switch's resume seek) in flight: its target is the truth.
    const hold = holdRef.current;
    if (hold) return hold.at;
    if (!loadedRef.current) return positionRef.current;
    let t = positionRef.current;
    safely(() => {
      const now = frontRef.current.currentTime;
      if (Number.isFinite(now) && now >= 0) t = now;
    });
    return t;
  }, []);

  /**
   * The ONE in-place swap, for an angle switch and for a quality swap: a new
   * URL into this same player at an exact fractional position, holding the
   * outgoing frame, keeping play intent and speed, landed only after the
   * resume seek lands. `kind` only changes the bookkeeping: an angle switch
   * moves `activeId` and is timed as a switch; a quality swap reloads the
   * same id at another rendition and is timed as a quality switch; an
   * "angleRestore" puts the previous angle back after a failed switch (it
   * moves `activeId`, but is not a switch in telemetry). An angle switch and
   * its restore seek and play at the replace's settle (contract 3.7).
   */
  const swapSource = React.useCallback(
    (nextId: string, atSeconds: number, target: TargetRendition, kind: "angle" | "quality" | "angleRestore") => {
      if (!nextId) return;
      if (kind === "angle" && nextId === activeIdRef.current) return;
      const at = Number.isFinite(atSeconds) && atSeconds > 0 ? atSeconds : 0;
      // An angle switch supersedes a quality swap still in flight.
      dropQualitySwap();
      if (kind === "angle") telemetry.switchStarted("seek");
      settleSeekRef.current = null;
      clearSwitchTimer("pausedLand");
      landAtRef.current = at;
      swapKindRef.current = kind;
      // Hold the outgoing frame only if one is up (else the poster stays).
      const current = sourceRef.current;
      const holdFrame = current != null && (frameGenRef.current === current.generation || current.holdFrame === true);
      if (kind === "quality") qualityPendingRef.current = { prev: currentDataRef.current, holdFrame };
      activeIdRef.current = nextId;
      setActiveId(nextId);
      // The new file resumes exactly here; play intent and speed carry over
      // untouched (the play-intent effect re-applies them once it loads).
      positionRef.current = at;
      setPositionS(at);
      holdRef.current = null;
      if (kind !== "quality") {
        // Another file, another clock. A quality swap keeps the timeline.
        durationRef.current = 0;
        setDurationS(0);
      }
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
      safely(() => frontRef.current.pause());
      const cached = signedRef.current.get(`${nextId}:${target}`);
      if (cached && Date.now() - cached.at < PRESIGN_FRESH_MS) {
        const epoch = ++epochRef.current;
        signingRef.current = false;
        switchGenRef.current = epoch;
        attach(cached.data, epoch, holdFrame, true);
        setPhase("ready");
        return;
      }
      // A superseded generation still in flight must not seek, play or land
      // this swap while its sign is pending (review M1): only the generation
      // this sign attaches is the switch's.
      switchGenRef.current = null;
      void sign(true, { switched: true, holdFrame, rendition: target, quality: kind === "quality", kind });
    },
    [telemetry, attach, sign, dropQualitySwap, clearSwitchTimer],
  );

  const switchAngle = React.useCallback(
    // Angle switches keep the session's rendition. A pending quality swap is
    // dropped FIRST, so the new angle signs at the level still served, never
    // at a superseded decision's rendition (review R2-M1).
    (nextId: string, atSeconds: number, opts?: { approximate?: boolean; offsets?: SwitchOffsets }) => {
      if (!nextId || nextId === activeIdRef.current) return;
      // The LOCK (owner, 2026-10-06; D5): no switch while one is in flight,
      // in either mode. Nothing changes: no state, telemetry or player.
      if (switchStateRef.current.phase !== "idle") return;
      const blocker = kwFnsRef.current.blocker(opts);
      if (blocker == null && opts?.offsets) {
        kwFnsRef.current.start(nextId, { approximate: opts.approximate, offsets: opts.offsets });
        return;
      }
      // in_place (= the shipped phase-1 switch, contract 07 section 9).
      if (blocker != null) telemetry.switchFallback(blocker);
      dropQualitySwap();
      const prev = switchStateRef.current;
      // A switch that had not landed yet (a restore included) is superseded:
      // its still is reused, since the player may already hold the
      // superseded target's frame 0 (contract 3.6).
      const superseding = prev.phase === "pending";
      if (superseding) telemetry.switchSuperseded();
      const seq = prev.seq + 1;
      // The outgoing angle's own time at the tap: a failed switch returns here.
      const fromAt = currentTimeNow();
      switchFromAtRef.current = fromAt;
      clearSwitchTimer("settle");
      clearSwitchTimer("pausedLand");
      // A superseded switch whose still is still being taken of the frame on
      // screen (no replaceAsync yet) hands that capture to this one (review
      // L2); otherwise an older gate's parked source is superseded here.
      const prevGate = gateRef.current;
      const inheritGate = superseding && prevGate != null && !prevGate.open && !prevGate.replaced;
      if (inheritGate) {
        prevGate.seq = seq;
        // The superseded switch's parked source must never go out as this
        // one (review M1): the gate replaces only once this switch's own
        // source is parked or attached.
        prevGate.pending = null;
      } else {
        gateRef.current = null;
        clearSwitchTimer("gate");
      }
      // A reused still keeps its own 4 s cap, timed from its capture (review L5).
      if (!superseding) clearSwitchTimer("holdCap");
      const current = sourceRef.current;
      const frameUp =
        current != null &&
        loadedRef.current &&
        (frameShownGenRef.current === current.generation || frameGenRef.current === current.generation);
      setSwitch({
        phase: "pending",
        seq,
        fromId: activeIdRef.current ?? null,
        targetId: nextId,
        startedAt: Date.now(),
        approximate: opts?.approximate === true,
        restoring: false,
        heldFrame: superseding ? prev.heldFrame : null,
        landedAt: null,
        failed: null,
        mode: "in_place",
        fromSlot: null,
        incomingSlot: null,
        leadMs: null,
      });
      setUpdateInterval(SWITCH_TIME_UPDATE_S);
      if (!superseding && frameUp) {
        // The held still: a native thumbnail of the frame on screen, taken
        // BEFORE the pause and before replaceAsync, which waits for it at
        // most HELD_FRAME_CAP_MS (contract 3.3).
        let pending: Promise<VideoThumbnail[]> | null = null;
        safely(() => {
          if (typeof frontRef.current.generateThumbnailsAsync === "function") pending = frontRef.current.generateThumbnailsAsync([fromAt]);
        });
        const thumbs = pending as Promise<VideoThumbnail[]> | null;
        if (thumbs && typeof thumbs.then === "function") {
          const gate = { seq, open: false, pending: null as PlaybackSource | null, replaced: false };
          gateRef.current = gate;
          // The gate may be handed to a superseding switch (or a restore):
          // always read its current seq.
          setSwitchTimer("gate", HELD_FRAME_CAP_MS, () => openGate(gate.seq));
          thumbs.then(
            (list) => {
              const still = Array.isArray(list) ? (list[0] ?? null) : null;
              const cur = switchStateRef.current;
              // A still that comes back after replaceAsync went out may
              // already describe the new asset: discarded.
              if (mountedRef.current && still && gateRef.current === gate && !gate.replaced && cur.seq === gate.seq && cur.phase === "pending") {
                setSwitch({ ...cur, heldFrame: still });
                // The still drops SWITCH_HOLD_CAP_MS after its capture.
                setSwitchTimer("holdCap", SWITCH_HOLD_CAP_MS, () => {
                  const now = switchStateRef.current;
                  if (now.phase === "pending" && now.heldFrame === still) setSwitch({ ...now, heldFrame: null });
                });
              }
              openGate(gate.seq);
            },
            () => openGate(gate.seq),
          );
        }
      }
      swapSource(nextId, atSeconds, quality.currentTarget(), "angle");
    },
    [swapSource, quality, dropQualitySwap, telemetry, currentTimeNow, clearSwitchTimer, setSwitch, setUpdateInterval, setSwitchTimer, openGate],
  );

  // A pending angle switch failed (contract 3.5): back to the angle it left,
  // at that angle's own moment of the tap, play intent and speed kept,
  // behind the same held still. Never a silent re-sign of the target.
  failSwitchRef.current = () => {
    const st = switchStateRef.current;
    if (st.phase !== "pending" || st.restoring) return;
    telemetry.switchFailed();
    const failed: SwitchFailure = { seq: st.seq, targetId: st.targetId ?? "", at: Date.now() };
    // A still still being taken (no replaceAsync yet) is of fromId, the
    // angle coming back: keep it for the restore (review L4).
    const gate = gateRef.current;
    if (!gate || gate.open || gate.replaced) {
      gateRef.current = null;
      clearSwitchTimer("gate");
    }
    clearSwitchTimer("pausedLand");
    switchGenRef.current = null;
    swapKindRef.current = null;
    signingRef.current = false;
    const back = st.fromId;
    if (!back) {
      setPhase("failed");
      switchToIdle({ ...st, failed });
      return;
    }
    setSwitch({ ...st, phase: "pending", restoring: true, targetId: back, fromId: st.targetId, approximate: false, failed });
    swapSource(back, switchFromAtRef.current, quality.currentTarget(), "angleRestore");
  };

  // The restore failed too: today's failed phase and retry panel (contract 3.5).
  restoreFailedRef.current = () => {
    switchGenRef.current = null;
    swapKindRef.current = null;
    signingRef.current = false;
    settleSeekRef.current = null;
    loadedRef.current = false;
    setLoaded(false);
    setPhase("failed");
    switchToIdle(switchStateRef.current);
  };

  // A quality decision: the same id, at the exact position right now.
  applyQualityRef.current = (d: QualityDecision) => {
    const id = activeIdRef.current;
    if (!id) return false;
    swapSource(id, currentTimeNow(), d.to, "quality");
    return true;
  };

  const presign = React.useCallback(
    (ids: string[]) => {
      presignIdsRef.current = ids;
      void quality.signTarget().then((rendition) => {
        for (const vid of ids) {
          const key = `${vid}:${rendition}`;
          if (!mountedRef.current || !vid || vid === activeIdRef.current || presigningRef.current.has(key)) continue;
          const cached = signedRef.current.get(key);
          if (cached && Date.now() - cached.at < PRESIGN_FRESH_MS) continue;
          presigningRef.current.add(key);
          void getMatchVideoPlaybackResult(supabase, vid, { rendition })
            .then((result) => {
              if (!mountedRef.current) return;
              if (result.ok && result.data && result.data.playability !== "processing") {
                signedRef.current.set(key, { data: result.data, at: Date.now() });
              }
            })
            .catch(() => undefined)
            .finally(() => presigningRef.current.delete(key));
        }
      });
    },
    [quality],
  );
  const presignRef = React.useRef(presign);
  presignRef.current = presign;

  // ======================================================================
  // The keep-watching switch engine (jits-xfvd.19, contract 07). A keeps
  // playing with its audio; B loads the target angle in the other slot,
  // hidden under it, is brought into step, and takes over at LAND (the
  // crossfade start). Everything below reads refs only, so the functions are
  // rebuilt every render and reached through `kwFnsRef`.
  // ======================================================================
  const phaseRef = React.useRef(phase);
  phaseRef.current = phase;
  /** Device tier, read once per screen (expo-device does not change). */
  const tierRef = React.useRef<"full" | "warm-only" | null>(null);

  {
    const kwClear = (run: KeepWatchingRun, ...names: KeepWatchingTimer[]) => {
      for (const name of names) {
        const t = run.timers[name];
        if (t) clearTimeout(t);
        delete run.timers[name];
      }
    };
    const kwClearAll = (run: KeepWatchingRun) => {
      kwClear(run, "play", "ready", "pausedLand", "cap", "abandon", "settle");
      for (const t of run.rampTimers) clearTimeout(t);
      run.rampTimers = [];
    };
    const kwTimer = (run: KeepWatchingRun, name: KeepWatchingTimer, ms: number, fn: () => void) => {
      kwClear(run, name);
      run.timers[name] = setTimeout(() => {
        delete run.timers[name];
        if (mountedRef.current && kwRef.current === run) fn();
      }, Math.max(0, ms));
    };
    /**
     * A's time now, extrapolated from its last time update (a seek in flight
     * answers with its target). Never more than A_EXTRAPOLATE_MAX_MS past
     * that update: a stalled A sends none, and must not be assumed to run on.
     */
    const aNow = (now = Date.now()): number => {
      const s = aSampleRef.current;
      if (!s) return currentTimeNow();
      const until = Math.min(now, s.at + A_EXTRAPOLATE_MAX_MS);
      return extrapolate(s, until, playingRef.current && holdRef.current == null, rateRef.current) ?? currentTimeNow();
    };
    const mapA = (run: KeepWatchingRun, tA: number) => mapToIncoming(tA, run.fromMs, run.toMs);
    const setRateOn = (p: VideoPlayer, r: number) =>
      safely(() => {
        if (p.playbackRate !== r) p.playbackRate = r;
      });

    /** t0 from A's time `aS` (3.3 step 1 when playing, 3.4 when paused). */
    const computeTarget = (run: KeepWatchingRun, aS: number) => {
      run.rate = rateRef.current;
      run.playMode = playingRef.current && run.rate > 0;
      const leadS = run.playMode ? leadFor(run.cls) : 0;
      const target = incomingTarget({
        aNowS: aS,
        leadS,
        rate: run.rate,
        fromOffsetMs: run.fromMs,
        toOffsetMs: run.toMs,
        durationBS: run.durationBS,
      });
      run.t0S = target.t0S;
      run.covered = target.covered;
      run.leadS = leadS;
    };

    /** B (paused) seeks to t0; it is ready again on its next ready event, frame, or the fallback. */
    const seekIncoming = (run: KeepWatchingRun) => {
      if (!run.settled) return; // the settle seeks to the latest t0
      kwClear(run, "ready", "pausedLand");
      run.ready = false;
      run.seekIssued = true;
      run.bSample = null;
      run.advanced = false;
      run.baseT = run.t0S;
      run.inStep = 0;
      run.filter.reset();
      const to = run.t0S;
      safely(() => {
        run.B.currentTime = to;
      });
      kwTimer(run, "ready", READY_FALLBACK_MS, () => onReady(run, "fallback"));
      // A re-seek of an item that was already ready (retarget, user seek,
      // pause or play, rate): iOS sends no new status and the view draws its
      // first frame once per item, so it is ready at its new target now.
      let alreadyReady = false;
      safely(() => {
        alreadyReady = run.B.status === "readyToPlay";
      });
      if (run.readyMs != null && alreadyReady) onReady(run, "status");
    };

    /** B stops (a user action or a retry): no scheduled play, no chase. */
    const holdIncoming = (run: KeepWatchingRun) => {
      kwClear(run, "play", "ready", "pausedLand");
      safely(() => run.B.pause());
      run.bPlaying = false;
      run.advanced = false;
      run.inStep = 0;
      run.filter.reset();
    };

    const startIncoming = (run: KeepWatchingRun) => {
      if (run.landing || run.bPlaying || !run.playMode) return;
      kwClear(run, "play");
      setRateOn(run.B, run.rate);
      safely(() => run.B.play());
      run.bPlaying = true;
      run.playCalledAt = Date.now();
      run.advanced = false;
      run.bSample = null;
      run.inStep = 0;
      run.filter.reset();
    };

    const loadIncoming = (run: KeepWatchingRun, data: MatchVideoPlayback, signedAt: number) => {
      run.data = data;
      run.signedAt = signedAt;
      if (data.durationSeconds != null && data.durationSeconds > 0) run.durationBS = data.durationSeconds;
      const gen = ++epochRef.current;
      run.gen = gen;
      run.settled = false;
      run.seekIssued = false;
      run.ready = false;
      run.bFrameDrawn = false;
      run.readyMs = null;
      run.bPlaying = false;
      run.advanced = false;
      run.bSample = null;
      run.inStep = 0;
      run.filter.reset();
      kwClear(run, "play", "ready", "pausedLand");
      computeTarget(run, currentTimeNow());
      if (run.leadMs == null) {
        run.leadMs = Math.round(run.leadS * 1000);
        const st = switchStateRef.current;
        if (st.seq === run.seq && st.phase === "pending") setSwitch({ ...st, leadMs: run.leadMs });
      }
      const B = run.B;
      safely(() => {
        B.muted = true;
        B.volume = 1;
      });
      safely(() => {
        B.bufferOptions = { ...B.bufferOptions, preferredForwardBufferDuration: INCOMING_FORWARD_BUFFER_S };
      });
      run.loadIssuedAt = Date.now();
      let pending: Promise<void>;
      try {
        pending = B.replaceAsync({ uri: data.url });
      } catch (e) {
        onSettle(run, gen, false, e instanceof Error ? e.message : String(e));
        return;
      }
      Promise.resolve(pending).then(
        () => onSettle(run, gen, true, null),
        (e: unknown) => onSettle(run, gen, false, e instanceof Error ? e.message : String(e)),
      );
    };

    const signIncoming = async (run: KeepWatchingRun) => {
      run.gen = null;
      run.settled = false;
      const rendition = run.rendition;
      let result: Result<MatchVideoPlayback | null>;
      try {
        result = await getMatchVideoPlaybackResult(supabase, run.targetId, { rendition });
      } catch (e) {
        result = { ok: false, error: { code: "UNKNOWN", message: e instanceof Error ? e.message : String(e) } };
      }
      if (!mountedRef.current || kwRef.current !== run || run.landing) return;
      if (!(phaseFor(result) === "ready" && result.ok && result.data)) {
        abandon(run, "sign_failed");
        return;
      }
      const at = Date.now();
      signedRef.current.set(`${run.targetId}:${rendition}`, { data: result.data, at });
      loadIncoming(run, result.data, at);
    };

    const onSettle = (run: KeepWatchingRun, gen: number, ok: boolean, message: string | null) => {
      if (!mountedRef.current || kwRef.current !== run || run.gen !== gen || run.landing) return;
      if (!ok) {
        onLoadError(run, message);
        return;
      }
      run.settled = true;
      // B stays paused at t0 until it is started (3.3 step 1).
      safely(() => run.B.pause());
      seekIncoming(run);
    };

    /** 7 and 7.1: a decoder error abandons and latches; the first other error retries once. */
    const onLoadError = (run: KeepWatchingRun, message: string | null) => {
      if (run.landing) return;
      if (isDecoderError(Platform.OS, message)) {
        markKeepWatchingUnsupported();
        abandon(run, "decoder_error");
        return;
      }
      const now = Date.now();
      if (run.loadRetries < LOAD_RETRY_MAX && now < run.tapAt + ABANDON_TIMEOUT_MS[run.cls]) {
        run.loadRetries += 1;
        telemetry.switchLoadRetried();
        holdIncoming(run);
        // A new generation: a late event of the failed item is ignored.
        run.gen = null;
        run.settled = false;
        run.seekIssued = false;
        run.rendition = quality.currentTarget();
        if (run.data && !retryNeedsResign(run.signedAt, now, message)) {
          const cached = signedRef.current.get(`${run.targetId}:${run.rendition}`);
          if (cached && cached.data.url !== run.data.url && now - cached.at < PRESIGN_FRESH_MS) loadIncoming(run, cached.data, cached.at);
          else loadIncoming(run, run.data, run.signedAt);
        } else void signIncoming(run);
        return;
      }
      abandon(run, "load_error");
    };

    /** 3.3 step 2 (playing) and 3.4 (paused): B is ready at its target. */
    const onReady = (run: KeepWatchingRun, via: "status" | "frame" | "fallback") => {
      if (run.landing || !run.settled || !run.seekIssued) return;
      if (run.ready) {
        // Paused: the frame after the post-seek readyToPlay lands sooner than the fallback.
        if (!run.playMode && via === "frame") land(run, 0);
        return;
      }
      run.ready = true;
      kwClear(run, "ready");
      const firstReady = run.readyMs == null;
      if (firstReady) run.readyMs = Date.now() - run.loadIssuedAt;
      if (!run.playMode) {
        if (via === "status") kwTimer(run, "pausedLand", PAUSED_LAND_FALLBACK_MS, () => landPaused(run));
        else if (via === "frame") land(run, 0);
        else landPaused(run);
        return;
      }
      if (!run.covered) {
        // B does not cover the moment: land at the clamped edge, no sync
        // check (3.5), with the normal crossfade (coordinator decision).
        land(run, 0);
        return;
      }
      if (via === "fallback" && firstReady) {
        // The first readiness after a load: iOS may not fill a paused item's
        // buffer, so play it muted now and chase. After a re-seek of a ready
        // item the start is still planned (review M2).
        startIncoming(run);
        return;
      }
      decideStartNow(run);
    };

    /**
     * A paused landing without a frame event after the seek: land when B
     * has drawn a frame (the new front must not show an empty view), else
     * wait READY_FALLBACK_MS more for one and land anyway then.
     */
    const landPaused = (run: KeepWatchingRun) => {
      if (run.bFrameDrawn) land(run, 0);
      else kwTimer(run, "pausedLand", READY_FALLBACK_MS, () => land(run, 0));
    };

    /** 3.3 step 3. */
    const decideStartNow = (run: KeepWatchingRun) => {
      const mapped = mapA(run, aNow());
      const startLatencyS = startLatencyFor(run.cls);
      const d = decideStart({
        waitS: waitUntilTarget(run.t0S, mapped, run.rate),
        startLatencyS,
        retargets: run.retargets,
        mappedANowS: mapped,
        leadS: run.leadS,
        readyMs: run.readyMs ?? 0,
        rate: run.rate,
        durationBS: run.durationBS,
      });
      if (d.kind === "schedule") kwTimer(run, "play", d.inMs, () => startIncoming(run));
      else if (d.kind === "retarget") {
        run.retargets += 1;
        telemetry.switchRetarget();
        run.t0S = d.t0S;
        // Past B's end: B lands at its edge once ready there (review M1).
        run.covered = d.covered;
        seekIncoming(run);
      } else startIncoming(run);
    };

    /** 3.3 step 4: one B time update while it plays hidden under A. */
    const onIncomingTime = (run: KeepWatchingRun, t: number) => {
      if (run.landing || !run.settled) return;
      const now = Date.now();
      const prev = run.bSample;
      run.bSample = { t, at: now };
      if (!run.bPlaying) return;
      if (!run.advanced) {
        if (!(t > (prev?.t ?? run.baseT) + 0.001)) return;
        run.advanced = true;
        if (run.startLatencyMs == null && run.playCalledAt != null) run.startLatencyMs = now - run.playCalledAt;
      }
      const mapped = mapA(run, aNow(now));
      const errorS = t - mapped;
      if (run.approximate || !run.covered) {
        // Not sync-checked: land once B has started at t0 (5.2).
        if (t >= run.t0S - START_AT_TARGET_SLACK_S || now - run.tapAt >= KEEP_WATCHING_CAP_MS[run.cls]) {
          land(run, errorS);
        }
        return;
      }
      const smoothed = run.filter.push(errorS, now);
      if (smoothed == null) {
        // Settling after a hidden re-seek: the cap still applies.
        if (now - run.tapAt >= KEEP_WATCHING_CAP_MS[run.cls]) land(run, errorS);
        return;
      }
      run.lastErrorS = smoothed;
      const d = decideChase({
        errorS: smoothed,
        inStep: run.inStep,
        rate: run.rate,
        hiddenReseeks: run.hiddenReseeks,
        mappedANowS: mapped,
        startLatencyS: startLatencyFor(run.cls),
        elapsedMs: now - run.tapAt,
        capMs: KEEP_WATCHING_CAP_MS[run.cls],
        approximate: false,
      });
      if (d.kind === "land" && !d.byCap && Math.abs(errorS) > SWAP_MAX_ERROR_S) {
        // The median is in step but this sample is not: not yet (review L5).
        run.inStep = 0;
        setRateOn(run.B, run.rate);
      } else if (d.kind === "land") land(run, d.errorS);
      else if (d.kind === "hold") {
        run.inStep = d.inStep;
        setRateOn(run.B, run.rate);
      } else if (d.kind === "nudge") {
        run.inStep = 0;
        setRateOn(run.B, d.rate);
      } else {
        run.hiddenReseeks += 1;
        telemetry.switchRetarget();
        const target = clampIncoming(d.toS, run.durationBS);
        const to = target.t;
        safely(() => {
          run.B.currentTime = to;
        });
        if (!target.covered) {
          // A has run past B's end: land at B's edge (review M1).
          run.t0S = to;
          run.covered = false;
          land(run, 0);
          return;
        }
        run.inStep = 0;
        run.bSample = null;
        run.advanced = false;
        run.baseT = to;
        run.filter.seeked(now);
      }
    };

    /** 3.3 step 5 (D2): at the cap, a B that has started lands with its error. */
    const onCap = (run: KeepWatchingRun) => {
      if (run.landing || !run.bPlaying || !run.advanced) return;
      let errorS = run.lastErrorS;
      if (errorS == null) {
        const b = extrapolate(run.bSample, Date.now(), true, run.rate);
        errorS = b != null ? b - mapA(run, aNow()) : 0;
      }
      land(run, errorS);
    };

    /** Section 4: equal-power ramp (exact), or a cut at the crossfade midpoint or the dip's bottom. */
    const audioAtLanding = (run: KeepWatchingRun, exact: boolean) => {
      const { A, B } = run;
      const cut = () =>
        safely(() => {
          A.muted = true;
          B.muted = false;
          B.volume = 1;
        });
      if (exact && AUDIO_RAMP) {
        safely(() => {
          B.volume = 0;
          B.muted = false;
        });
        const stepMs = CROSSFADE_MS / AUDIO_RAMP_STEPS;
        for (let k = 1; k <= AUDIO_RAMP_STEPS; k++) {
          run.rampTimers.push(
            setTimeout(() => {
              if (!mountedRef.current) return;
              const g = rampGains(k, AUDIO_RAMP_STEPS);
              safely(() => {
                A.volume = g.from;
                B.volume = g.to;
                if (k === AUDIO_RAMP_STEPS) {
                  A.muted = true;
                  A.volume = 1;
                }
              });
            }, k * stepMs),
          );
        }
        return;
      }
      run.rampTimers.push(
        setTimeout(
          () => {
            if (mountedRef.current) cut();
          },
          exact ? CROSSFADE_MS / 2 : DIP_MS,
        ),
      );
    };

    /** LAND (5.2): one state update moves the front to B; idle SWITCH_SETTLE_MS later. */
    const land = (run: KeepWatchingRun, errorS: number) => {
      if (run.landing || kwRef.current !== run) return;
      const data = run.data;
      const gen = run.gen;
      if (!data || gen == null) {
        // Defensive (review L3): nothing loaded to land on; the lock must still open.
        abandon(run, "load_error");
        return;
      }
      run.landing = true;
      kwClear(run, "play", "ready", "pausedLand", "cap", "abandon");
      const now = Date.now();
      const { B } = run;
      // B to the session's exact rate and play intent. A B that already
      // ended lands at its edge stopped, like a front reaching its end.
      if (run.ended) {
        playingRef.current = false;
        setPlaying(false);
      } else if (playingRef.current && rateRef.current > 0) {
        setRateOn(B, rateRef.current);
        if (!run.bPlaying) safely(() => B.play());
      } else safely(() => B.pause());
      restoreForwardBuffer(B);
      let tB = run.bSample?.t ?? run.t0S;
      safely(() => {
        const c = B.currentTime;
        if (Number.isFinite(c) && c >= 0) tB = c;
      });
      let durB = run.durationBS ?? 0;
      safely(() => {
        if (B.duration > 0) durB = B.duration;
      });
      // The role swap: from here the front (and every front ref) is B.
      frontRef.current = B;
      frontSlotRef.current = run.inSlot;
      const nextSource: PlaybackSource = {
        url: data.url,
        posterUrl: data.posterUrl,
        matchId: data.matchId ?? null,
        durationSeconds: data.durationSeconds ?? null,
        generation: gen,
      };
      issuedSourceRef.current = nextSource;
      sourceRef.current = nextSource;
      currentDataRef.current = data;
      settledGenRef.current = gen;
      seekIssuedGenRef.current = gen;
      frameShownGenRef.current = gen;
      loadedRef.current = true;
      switchGenRef.current = null;
      swapKindRef.current = null;
      switchSeekLandedRef.current = true;
      settleSeekRef.current = null;
      resumeAtRef.current = null;
      holdRef.current = null;
      progressBaseRef.current = tB;
      positionRef.current = tB;
      durationRef.current = durB;
      aSampleRef.current = { t: tB, at: now };
      // A different file: its own re-sign budget.
      streakRef.current = false;
      silentCountRef.current = 0;
      activeIdRef.current = run.targetId;
      ownIdsRef.current.add(run.targetId);
      setFrontSlot(run.inSlot);
      setSource(nextSource);
      setLoaded(true);
      setFrameGen(gen);
      setPositionS(tB);
      setDurationS(durB);
      setActiveId(run.targetId);
      const served = servedOf(data);
      servedRef.current = served;
      telemetry.sourceAttached(data.sourceKind ?? "original");
      telemetry.renditionAttached(served.served, data.playbackProfile ?? null);
      quality.angleChanged(served.served, served.available);
      // Not covered still crossfades (the approximate flag drives the "not synced" copy).
      const exact = !run.approximate && run.covered;
      audioAtLanding(run, !run.approximate);
      telemetry.switchLanded();
      telemetry.switchKeepWatchingLanded({
        leadMs: run.leadMs ?? 0,
        landedLateMs: Math.round((tB - run.tapMappedS) * 1000),
        syncErrorMs: Math.round(Math.abs(errorS) * 1000),
        exact: exact && run.playMode,
        afterRetry: run.loadRetries > 0,
      });
      recordSwitchTiming(run.cls, { readyMs: run.readyMs ?? now - run.loadIssuedAt, startLatencyMs: run.startLatencyMs });
      const st = switchStateRef.current;
      setSwitch({ ...st, phase: "landing", landedAt: now });
      kwTimer(run, "settle", SWITCH_SETTLE_MS, () => finishLanding(run));
    };

    /** SWITCH_SETTLE_MS after LAND: release the old front, back to idle (the lock opens). */
    const finishLanding = (run: KeepWatchingRun) => {
      if (kwRef.current !== run) return;
      kwClearAll(run);
      safely(() => {
        run.B.muted = false;
        run.B.volume = 1;
      });
      releaseSlot(run.A);
      setIntervalOn(run.A, TIME_UPDATE_S);
      setIntervalOn(run.B, TIME_UPDATE_S);
      kwRef.current = null;
      const cur = switchStateRef.current;
      if (mountedRef.current && cur.seq === run.seq && cur.phase === "landing") {
        setSwitch({ ...cur, phase: "idle", heldFrame: null, restoring: false, fromSlot: null, incomingSlot: null });
      }
    };

    /** Section 7: the switch ends without landing; A is untouched and the lock opens. */
    const abandon = (run: KeepWatchingRun, reason: AbandonReason) => {
      if (kwRef.current !== run || run.landing) return;
      kwClearAll(run);
      kwRef.current = null;
      restoreForwardBuffer(run.B);
      releaseSlot(run.B);
      setIntervalOn(run.A, TIME_UPDATE_S);
      setIntervalOn(run.B, TIME_UPDATE_S);
      const failure = FAILURE_ABANDON_REASONS.has(reason);
      if (reason !== "unmount" && mountedRef.current) {
        const st = switchStateRef.current;
        if (st.seq === run.seq) {
          setSwitch({
            ...st,
            phase: "idle",
            heldFrame: null,
            restoring: false,
            fromSlot: null,
            incomingSlot: null,
            failed: failure ? { seq: run.seq, targetId: run.targetId, at: Date.now() } : st.failed,
          });
        }
      }
      if (failure) telemetry.switchFailed();
      telemetry.switchAbandoned(reason);
    };

    const blocker = (opts: { offsets?: SwitchOffsets } | undefined): InPlaceReason | null => {
      if (!KEEP_WATCHING_ENABLED) return "disabled";
      if (keepWatchingUnsupported()) return "unsupported";
      if (tierRef.current == null) {
        try {
          tierRef.current = deviceTier(readDeviceInfo()).tier;
        } catch {
          tierRef.current = "warm-only";
        }
      }
      if (tierRef.current === "warm-only") return "warm_only";
      if (!opts?.offsets) return "no_offsets";
      if (phaseRef.current !== "ready") return "phase_not_ready";
      if (qualityPendingRef.current != null || swapKindRef.current === "quality" || swapKindRef.current === "restore") {
        return "quality_swap";
      }
      const current = sourceRef.current;
      const frameUp =
        current != null &&
        loadedRef.current &&
        !signingRef.current &&
        switchGenRef.current == null &&
        (frameShownGenRef.current === current.generation || frameGenRef.current === current.generation);
      return frameUp ? null : "front_not_ready";
    };

    const start = (nextId: string, opts: { approximate?: boolean; offsets: SwitchOffsets }) => {
      const A = frontRef.current;
      const fromSlot = frontSlotRef.current;
      const inSlot: 0 | 1 = fromSlot === 0 ? 1 : 0;
      const B = players[inSlot];
      const now = Date.now();
      const seq = switchStateRef.current.seq + 1;
      telemetry.switchStarted("keep_watching");
      const { fromMs, toMs } = opts.offsets;
      const offsetsKnown =
        typeof fromMs === "number" && Number.isFinite(fromMs) && typeof toMs === "number" && Number.isFinite(toMs);
      const cls = networkClassOf(networkKey(currentNetworkSnapshot()));
      const aS = currentTimeNow();
      const run: KeepWatchingRun = {
        seq,
        targetId: nextId,
        A,
        B,
        fromSlot,
        inSlot,
        cls,
        approximate: opts.approximate === true || !offsetsKnown,
        fromMs: offsetsKnown ? fromMs : null,
        toMs: offsetsKnown ? toMs : null,
        tapAt: now,
        tapMappedS: mapToIncoming(aS, offsetsKnown ? fromMs : null, offsetsKnown ? toMs : null),
        rendition: quality.currentTarget(),
        data: null,
        signedAt: 0,
        durationBS: null,
        gen: null,
        settled: false,
        loadIssuedAt: now,
        seekIssued: false,
        ready: false,
        bFrameDrawn: false,
        readyMs: null,
        t0S: 0,
        covered: true,
        leadS: 0,
        leadMs: null,
        playMode: playingRef.current,
        rate: rateRef.current,
        bPlaying: false,
        playCalledAt: null,
        startLatencyMs: null,
        advanced: false,
        baseT: 0,
        bSample: null,
        inStep: 0,
        filter: new DriftFilter(),
        lastErrorS: null,
        retargets: 0,
        hiddenReseeks: 0,
        loadRetries: 0,
        landing: false,
        ended: false,
        timers: {},
        rampTimers: [],
      };
      kwRef.current = run;
      setSwitch({
        phase: "pending",
        seq,
        fromId: activeIdRef.current ?? null,
        targetId: nextId,
        startedAt: now,
        // Unsynced (a null offset) is approximate too, so picture and audio agree (coordinator 2026-10-06).
        approximate: run.approximate,
        restoring: false,
        heldFrame: null,
        landedAt: null,
        failed: null,
        mode: "keep_watching",
        fromSlot,
        incomingSlot: inSlot,
        leadMs: null,
      });
      setIntervalOn(A, SWITCH_TIME_UPDATE_S);
      setIntervalOn(B, SWITCH_TIME_UPDATE_S);
      kwTimer(run, "abandon", ABANDON_TIMEOUT_MS[cls], () => abandon(run, "timeout"));
      kwTimer(run, "cap", KEEP_WATCHING_CAP_MS[cls], () => onCap(run));
      const cached = signedRef.current.get(`${nextId}:${run.rendition}`);
      if (cached && now - cached.at < PRESIGN_FRESH_MS) loadIncoming(run, cached.data, cached.at);
      else void signIncoming(run);
    };

    const live = (p?: VideoPlayer) => {
      const run = kwRef.current;
      if (!run || run.landing) return null;
      if (p && run.B !== p) return null;
      return run;
    };

    /**
     * During the 300 ms landing the old front is still audible: a pause or a
     * seek there silences and stops it at once (review L4); B is the front
     * and takes the action itself.
     */
    const quietOutgoing = (run: KeepWatchingRun, pause: boolean) => {
      for (const t of run.rampTimers) clearTimeout(t);
      run.rampTimers = [];
      safely(() => {
        run.A.muted = true;
        run.A.volume = 1;
        run.B.muted = false;
        run.B.volume = 1;
      });
      if (pause) safely(() => run.A.pause());
    };
    const landingRun = () => {
      const run = kwRef.current;
      return run && run.landing ? run : null;
    };

    kwFnsRef.current = {
      blocker,
      start,
      onPlayIntent: (want) => {
        const landingNow = landingRun();
        if (landingNow) {
          if (!want) quietOutgoing(landingNow, true);
          return;
        }
        const run = live();
        if (!run) return;
        const playMode = want && rateRef.current > 0;
        if (playMode === run.playMode) return;
        holdIncoming(run);
        // Pause: exact, from A's paused time (3.4). Play: a lead from A's time, B reused (3.3).
        if (playMode) run.retargets = 0;
        computeTarget(run, currentTimeNow());
        seekIncoming(run);
      },
      onRate: (r) => {
        const run = live();
        if (!run || r === run.rate) return;
        run.rate = r;
        if (run.bPlaying) {
          setRateOn(run.B, r);
          run.inStep = 0;
          run.filter.reset();
          return;
        }
        if (!run.playMode) return;
        kwClear(run, "play");
        computeTarget(run, currentTimeNow());
        seekIncoming(run);
      },
      onUserSeek: (targetS) => {
        const landingNow = landingRun();
        if (landingNow) {
          quietOutgoing(landingNow, true);
          return;
        }
        const run = live();
        if (!run) return;
        holdIncoming(run);
        run.retargets = 0;
        computeTarget(run, targetS);
        seekIncoming(run);
      },
      onFrontError: () => {
        const run = live();
        if (run) abandon(run, "front_error");
      },
      onLeave: (reason) => {
        const run = kwRef.current;
        if (!run) return;
        if (run.landing) finishLanding(run);
        else abandon(run, reason);
      },
      onUnmount: () => {
        const run = kwRef.current;
        if (!run) return;
        if (run.landing) {
          kwClearAll(run);
          kwRef.current = null;
          return;
        }
        abandon(run, "unmount");
      },
      incomingStatus: (p, status, message) => {
        const run = live(p);
        if (!run) return;
        if (status === "readyToPlay") {
          safely(() => {
            if (p.duration > 0) run.durationBS = p.duration;
          });
          if (run.settled && run.seekIssued) onReady(run, "status");
        } else if (status === "error" && run.settled) onLoadError(run, message);
      },
      incomingTime: (p, t) => {
        const run = live(p);
        if (run) onIncomingTime(run, t);
      },
      incomingDuration: (p, duration) => {
        const run = live(p);
        if (run && duration > 0) run.durationBS = duration;
      },
      incomingFrame: () => {
        const run = live();
        if (!run) return;
        if (run.gen != null) run.bFrameDrawn = true;
        if (run.settled && run.seekIssued) onReady(run, "frame");
      },
      incomingEnded: (p) => {
        const run = live(p);
        if (!run || !run.settled) return;
        // B ran out while pending (a shorter angle): land at its edge, the
        // normal crossfade, not approximate (review M1, coordinator).
        run.ended = true;
        run.covered = false;
        let end = run.t0S;
        safely(() => {
          if (Number.isFinite(p.currentTime)) end = p.currentTime;
        });
        run.t0S = end;
        land(run, 0);
      },
    };
  }

  // The incoming slot's events (either player may be it): the engine
  // ignores every player that is not B of a pending switch.
  React.useEffect(() => {
    const subs: Array<{ remove: () => void }> = [];
    for (const p of players) {
      safely(() => {
        subs.push(
          p.addListener("statusChange", ({ status, error }) =>
            kwFnsRef.current.incomingStatus(p, status, error?.message ?? null),
          ),
          p.addListener("timeUpdate", ({ currentTime }) => kwFnsRef.current.incomingTime(p, currentTime)),
          p.addListener("sourceLoad", ({ duration }) => kwFnsRef.current.incomingDuration(p, duration)),
          p.addListener("playToEnd", () => kwFnsRef.current.incomingEnded(p)),
        );
      });
    }
    return () => {
      for (const sub of subs) safely(() => sub.remove());
    };
  }, [players]);

  // Background and unmount (contract 07 section 3.6) are handled in LAYOUT
  // effects (review L2): their AppState listener is added before the
  // telemetry hook's passive one, and their cleanup runs before its unmount
  // flush, so the abandon is in the session event that flush sends.
  React.useLayoutEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "background") kwFnsRef.current.onLeave("background");
    });
    return () => sub?.remove?.();
  }, []);
  React.useLayoutEffect(
    () => () => {
      // No state update from here on (the screen is unmounting).
      mountedRef.current = false;
      kwFnsRef.current.onUnmount();
    },
    [],
  );

  /** Each slot's VideoView onFirstFrameRender: the incoming angle's, or the front's. */
  const onSlotFirstFrame = React.useCallback(
    (slot: 0 | 1) => {
      const run = kwRef.current;
      if (run && !run.landing && slot === run.inSlot) {
        kwFnsRef.current.incomingFrame();
        return;
      }
      if (slot === frontSlotRef.current) onFirstFrameRender();
    },
    [onFirstFrameRender],
  );

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
    switchState,
    players,
    frontSlot,
    onSlotFirstFrame,
  };
}

import type {
  QualityPreference,
  ServedRendition,
  StartReason,
  SwitchReason,
  TargetRendition,
} from "@jits/shared/utils";
import * as tracking from "@/lib/error-tracking/sentry";
import { ResidualStats } from "./multi-angle/sync-controller";

/**
 * Playback telemetry (jits-n2im.21): the input for the deferred HLS / ABR
 * decision (jr_be-1qz.19).
 *
 * One `PlaybackSession` aggregates one viewing session of one player: from
 * the screen (or reel card) opening to it closing, or to the app going to
 * the background. It is a pure state machine fed timestamps by
 * `usePlaybackTelemetry`, so the arithmetic is unit-tested without a player.
 *
 * Volume: exactly ONE Sentry event per reported session (`captureMessage`
 * "Video playback session", level info), never one per stall or tick. There
 * is no analytics sink in the app, so the numbers ride on the event's
 * `extra` and the dimensions worth filtering on are tags, the same pattern
 * as the upload telemetry (jits-n2im.7).
 *
 * Definitions (all wall-clock milliseconds unless the name says otherwise):
 *   timeToFirstFrameMs  first play intent -> first frame on screen. For the
 *                       match player the intent is the screen opening
 *                       (autoplay), so it includes signing the URL; for a
 *                       reel it is the athlete's tap. A frame counts once the
 *                       view reports its first frame AFTER the intent, or the
 *                       player reports it is playing, whichever is first.
 *   signMs              screen open -> signed URL handed to the player
 *                       (match player only; null for a reel).
 *   stall               the player dropped to "loading" while it was meant
 *                       to be playing, after the first frame, and not as the
 *                       direct result of a seek, a re-signed URL being swapped
 *                       in, or the resume seek after it. Those waits are
 *                       excluded so scrubbing or a URL renewal does not read
 *                       as a network problem. The exemption is BOUNDED: a
 *                       seek's ends on the first playback progress after it,
 *                       on playing, on readyToPlay, or SEEK_EXEMPT_MS after
 *                       the seek; a swap's ends on readyToPlay or progress.
 *                       (expo-video emits statusChange only on a change, so
 *                       a seek inside the buffer never produces the
 *                       loading -> readyToPlay pair that would clear it.)
 *   watchMs             time the player was actually playing (not stalled,
 *                       not paused, not backgrounded).
 *   rebufferRatio       stallMs / (watchMs + stallMs).
 *   signOutcome         match player: how the (latest) sign ended: ok,
 *                       failed, missing, absent, processing, or pending when
 *                       the athlete left before it answered. Every open of
 *                       the match player with a play intent is one event, so
 *                       startups abandoned during signing are counted too.
 *   timeToFirstFrameMs is null on a continuation after the background (a
 *   warm resume is not a startup).
 *   switchCount         match player: angle switches in this session. A switch
 *                       keeps the screen, the player and this session (it used
 *                       to remount all three), so one viewing of a match is
 *                       one event however many angles were watched.
 *   switchLatencyMs     median, over the switches whose new angle showed a
 *                       frame, of tap -> first frame of the new angle (the
 *                       view's onFirstFrameRender for the new item, or the
 *                       first playback progress on it). Null with none.
 *   switchLatencyMaxMs  the slowest of those switches.
 *   switchSwapCount / switchSeekCount / switchDipCount
 *                       multi-angle player: how each switch happened (an
 *                       opacity swap to a hot angle, an exact seek behind a
 *                       held frame, or a dip to black for clock-only sync).
 *   syncResidualP50Ms / syncResidualP95Ms / syncSamples
 *                       multi-angle player: absolute error of the lock-stepped
 *                       angles against the master clock, sampled every master
 *                       time update (smoothed), in ms.
 *   decoderCapEvents / decoderCapReasons
 *                       multi-angle player: times a standby was kept warm by
 *                       the decoder cap (weak phone) or demoted after a
 *                       decoder error, and why.
 *   After a switch, `durationS` and `maxPositionS` are on the file then on
 *   screen (each angle has its own clock), so across a switched session they
 *   mix angles; read them per session, not as one timeline.
 *
 * Adaptive quality (jits-xfvd.12, spec 05 section 5.6): the quality meta of
 * the session start (preference, settings, network key, start target and
 * reason), the rendition served at start and at the end, watch time per
 * served rendition (`msOn720 + msOn360 + msOnOriginal === watchMs` for a
 * match session), every quality switch (first 8 kept), its landing latency,
 * stalls before and after the first stall-driven step-down, the relapse
 * lock and the cap. A quality switch is NOT an angle switch: it never
 * counts in `switchCount` or the switch latency, and its reload is exempt
 * from stalls exactly like an angle swap. For a reel the quality fields are
 * null, 0 or false and the quality tags read `none`.
 */

/** How long a seek's "the next load is ours" exemption lasts at most. */
export const SEEK_EXEMPT_MS = 1500;
/** A position change bigger than this is a seek landing, not playback progress. */
const SEEK_JUMP_S = 1;

export type PlaybackSurface = "match" | "highlight";
/** Which file was played: the uploaded original, the slicer's normalized MP4, or a reel. */
export type PlaybackSourceKind = "original" | "normalized" | "highlight";
export type PlaybackEndReason = "unmount" | "background";
export type PlayerStatus = "idle" | "loading" | "readyToPlay" | "error";
export type PlaybackAngle = "mine" | "opponent" | "timekeeper";
export type SignOutcome = "ok" | "failed" | "missing" | "absent" | "processing" | "pending";

export interface PlaybackSessionMeta {
  surface: PlaybackSurface;
  videoId: string | null;
  /**
   * Match player: whose recording the session opened on ("timekeeper" for
   * the sideline angle, never folded into "opponent"). Null when unknown or
   * for a reel.
   */
  angle: PlaybackAngle | null;
  /** How many angles the match has (1 to 3); null when unknown. */
  angleCount: number | null;
  /** Match player: single player (P0) or the multi-angle player (dev flag). */
  playerMode?: "single" | "multi";
  /** Multi-angle player: whether two players may decode at once. */
  deviceTier?: "full" | "warm-only" | null;
}

export type SwitchMode = "swap" | "seek" | "dip";

export type SettingsSource = "server" | "cache" | "builtin";

/** What the start selection knew (set once per session). */
export interface PlaybackQualityMeta {
  qualityPreference: QualityPreference;
  settingsVersion: number;
  settingsSource: SettingsSource;
  adaptiveEnabled: boolean;
  networkKey: string;
  connectionExpensive: boolean;
  startTarget: TargetRendition;
  startReason: StartReason;
}

export interface QualitySwitchRecord {
  /** ms since the session opened. */
  atMs: number;
  from: TargetRendition;
  to: TargetRendition;
  reason: SwitchReason;
}

/** First quality switches kept per session. */
export const QUALITY_SWITCHES_KEPT = 8;

export interface PlaybackSessionSummary extends PlaybackSessionMeta {
  sourceKind: PlaybackSourceKind | null;
  /** Match player only (null for a reel). */
  signOutcome: SignOutcome | null;
  networkType: string | null;
  cellularGeneration: string | null;
  /** A continuation started when the app came back from the background. */
  resumed: boolean;
  endReason: PlaybackEndReason;
  sessionMs: number;
  signMs: number | null;
  timeToFirstFrameMs: number | null;
  /** The athlete wanted playback but left (or failed) before a first frame. */
  startupAbandoned: boolean;
  watchMs: number;
  watchMinutes: number;
  stallCount: number;
  stallMs: number;
  longestStallMs: number;
  rebufferRatio: number | null;
  seekCount: number;
  resignCount: number;
  completed: boolean;
  /** Player errors in this session (each one the match player answers with a silent re-sign). */
  errorCount: number;
  /** The last error's text, URLs scrubbed. */
  error: string | null;
  /** The session ended on an error with no playback after it. */
  endedInError: boolean;
  durationS: number | null;
  maxPositionS: number | null;
  switchCount: number;
  switchLatencyMs: number | null;
  switchLatencyMaxMs: number | null;
  switchSwapCount: number;
  switchSeekCount: number;
  switchDipCount: number;
  syncResidualP50Ms: number | null;
  syncResidualP95Ms: number | null;
  syncSamples: number;
  decoderCapEvents: number;
  decoderCapReasons: string | null;
  qualityPreference: QualityPreference | null;
  settingsVersion: number | null;
  settingsSource: SettingsSource | null;
  adaptiveEnabled: boolean | null;
  networkKey: string | null;
  connectionExpensive: boolean | null;
  startTarget: TargetRendition | null;
  startReason: StartReason | null;
  startRendition: ServedRendition | null;
  startFallback: boolean;
  playbackProfile: string | null;
  finalRendition: ServedRendition | null;
  qualitySwitchCount: number;
  qualityStepDownCount: number;
  qualityStepUpCount: number;
  qualitySwitches: QualitySwitchRecord[];
  qualitySwitchesTruncated: boolean;
  qualitySwitchLatencyMs: number | null;
  qualitySwitchLatencyMaxMs: number | null;
  msOn720: number;
  msOn360: number;
  msOnOriginal: number;
  stallsBeforeStepDown: number | null;
  stallMsBeforeStepDown: number | null;
  stallsAfterStepDown: number | null;
  stallMsAfterStepDown: number | null;
  qualityLockedLow: boolean;
  qualityCapReached: boolean;
  playerStartupMs: number | null;
}

/** Longest error text kept. */
const ERROR_MAX_CHARS = 200;

/** Signed URLs carry a token: never send one to telemetry. */
export function scrubPlaybackError(message: string | null | undefined): string | null {
  if (message == null) return null;
  return message.replace(/https?:\/\/\S+/g, "<url>").slice(0, ERROR_MAX_CHARS);
}

export class PlaybackSession {
  private meta: PlaybackSessionMeta;
  private readonly openedAt: number;
  private readonly resumed: boolean;
  private sourceKind: PlaybackSourceKind | null = null;
  private sourceAt: number | null = null;
  private networkType: string | null = null;
  private cellularGeneration: string | null = null;
  private intentAt: number | null = null;
  private wantPlay = false;
  private firstFrameAt: number | null = null;
  private playingSince: number | null = null;
  private watchMs = 0;
  private stallSince: number | null = null;
  private stallCount = 0;
  private stallMs = 0;
  private longestStallMs = 0;
  /** A seek was requested at this time: a load soon after is not a stall (bounded). */
  private seekAt: number | null = null;
  /** A new item is being swapped in: its load is not a stall until it is ready. */
  private swapPending = false;
  /** First position seen after an exemption started (undefined: none yet). */
  private exemptBase: number | undefined = undefined;
  private signOutcome: SignOutcome | null = null;
  private seekCount = 0;
  private resignCount = 0;
  private completed = false;
  private errorMessage: string | null = null;
  private errorCount = 0;
  /** An error with no playback after it (a re-sign that recovered clears it). */
  private unrecovered = false;
  private durationS: number | null = null;
  private maxPositionS: number | null = null;
  private switchCount = 0;
  /** A switch is waiting for the new angle's first frame (tap time). */
  private switchAt: number | null = null;
  private switchLatencies: number[] = [];
  private switchModes: Record<SwitchMode, number> = { swap: 0, seek: 0, dip: 0 };
  private residuals = new ResidualStats();
  private decoderCapEvents = 0;
  private decoderCapReasons = new Set<string>();
  // ---- adaptive quality ----
  private quality: PlaybackQualityMeta | null = null;
  private startRendition: ServedRendition | null = null;
  private currentRendition: ServedRendition | null = null;
  private playbackProfile: string | null = null;
  private msOn: Record<ServedRendition, number> = { "720": 0, "360": 0, original: 0 };
  private qualitySwitchCount = 0;
  private qualityStepDowns = 0;
  private qualityStepUps = 0;
  private qualitySwitches: QualitySwitchRecord[] = [];
  private qualitySwitchAt: number | null = null;
  private qualityLatencies: number[] = [];
  /** Stall figures frozen at the first stall-driven step-down. */
  private beforeStepDown: { count: number; ms: number } | null = null;
  private lockedLow = false;
  private capReached = false;
  private onStall: ((event: { kind: "start" | "end"; at: number }) => void) | null = null;

  constructor(
    meta: PlaybackSessionMeta,
    now: number,
    opts: {
      resumed?: boolean;
      sourceKind?: PlaybackSourceKind | null;
      wantPlay?: boolean;
      /** A continuation: the rendition already on the player. */
      rendition?: { served: ServedRendition; playbackProfile: string | null } | null;
      onStall?: (event: { kind: "start" | "end"; at: number }) => void;
    } = {},
  ) {
    this.meta = { ...meta };
    this.openedAt = now;
    if (meta.surface === "match" && !opts.resumed) this.signOutcome = "pending";
    this.resumed = opts.resumed ?? false;
    this.onStall = opts.onStall ?? null;
    // A continuation already has its source on the player.
    if (opts.sourceKind) {
      this.sourceKind = opts.sourceKind;
      this.sourceAt = now;
    }
    if (opts.rendition) {
      this.startRendition = opts.rendition.served;
      this.currentRendition = opts.rendition.served;
      this.playbackProfile = opts.rendition.playbackProfile;
    }
    if (opts.wantPlay) this.playIntent(true, now);
  }

  /** Called exactly where `stallCount` increments and where an open stall closes. */
  setStallListener(fn: ((event: { kind: "start" | "end"; at: number }) => void) | null): void {
    this.onStall = fn;
  }

  private emitStall(kind: "start" | "end", at: number): void {
    try {
      this.onStall?.({ kind, at });
    } catch {
      /* a listener never breaks telemetry */
    }
  }

  /** The start selection's meta (once per session; a continuation gets a copy). */
  setQuality(meta: PlaybackQualityMeta): void {
    this.quality = { ...meta };
  }

  /**
   * A file of this served rendition went to the player (every attach, and
   * the angle on screen changing in the multi-angle player). The first one
   * is the start rendition; each closes the current watch segment into the
   * previous rendition's bucket.
   */
  renditionAttached(served: ServedRendition, playbackProfile: string | null, now: number): void {
    if (this.startRendition === null) {
      this.startRendition = served;
      this.playbackProfile = playbackProfile;
    }
    if (this.playingSince != null) {
      this.stopWatchClock(now);
      this.playingSince = now;
    }
    this.currentRendition = served;
  }

  /**
   * A quality switch was issued (not an angle switch). Its reload is the
   * app's own wait (stall-exempt like an angle swap); the first stall-driven
   * step-down freezes the "before" stall figures, an open stall included.
   */
  qualitySwitchStarted(from: TargetRendition, to: TargetRendition, reason: SwitchReason, now: number): void {
    this.expectSwap(now);
    this.qualitySwitchCount += 1;
    const stepDown = reason !== "smooth";
    if (stepDown) this.qualityStepDowns += 1;
    else this.qualityStepUps += 1;
    if (this.qualitySwitches.length < QUALITY_SWITCHES_KEPT + 1) {
      this.qualitySwitches.push({ atMs: Math.max(0, now - this.openedAt), from, to, reason });
    }
    this.qualitySwitchAt = now;
    if (stepDown && this.beforeStepDown === null) {
      this.beforeStepDown = { count: this.stallCount, ms: this.stallMs };
    }
  }

  /** The quality swap's new file showed its first frame after the resume seek. */
  qualitySwitchLanded(now: number): void {
    if (this.qualitySwitchAt == null) return;
    this.qualityLatencies.push(Math.max(0, now - this.qualitySwitchAt));
    this.qualitySwitchAt = null;
  }

  /** The controller's sticky screen-session state (relapse lock, cap). */
  qualityFlags(flags: { lockedLow: boolean; capReached: boolean }): void {
    this.lockedLow = this.lockedLow || flags.lockedLow;
    this.capReached = this.capReached || flags.capReached;
  }

  setMeta(partial: Partial<PlaybackSessionMeta>): void {
    this.meta = { ...this.meta, ...partial };
  }

  setNetwork(type: string | null, cellularGeneration: string | null): void {
    this.networkType = type;
    this.cellularGeneration = cellularGeneration;
  }

  /** A (re-)signed URL went to the player. The first one fixes signMs. */
  sourceAttached(kind: PlaybackSourceKind, now: number): void {
    this.sourceKind = kind;
    if (this.sourceAt == null) this.sourceAt = now;
    // A later source (a re-sign) reloads the item: that wait is not a stall.
    else this.expectSwap(now);
  }

  /** How the latest sign ended (match player). */
  setSignOutcome(outcome: SignOutcome): void {
    this.signOutcome = outcome;
  }

  /** A new item is being swapped into the player: its load is ours. */
  expectSwap(now: number): void {
    this.closeStall(now);
    this.swapPending = true;
    this.exemptBase = undefined;
  }

  /** The app is about to seek (a user seek or a resume seek): a load soon after is ours. */
  expectWait(now: number): void {
    this.closeStall(now);
    this.seekAt = now;
    this.exemptBase = undefined;
  }

  private exempt(now: number): boolean {
    if (this.swapPending) return true;
    if (this.seekAt == null) return false;
    if (now - this.seekAt <= SEEK_EXEMPT_MS) return true;
    this.seekAt = null;
    return false;
  }

  private clearExemptions(): void {
    this.seekAt = null;
    this.swapPending = false;
    this.exemptBase = undefined;
  }

  /** A silent re-sign after a player error. */
  resigned(): void {
    this.resignCount += 1;
  }

  /** The athlete (or autoplay) wants playback, or wants it paused. */
  playIntent(want: boolean, now: number): void {
    this.wantPlay = want;
    if (want && this.intentAt == null) this.intentAt = now;
    // Paused on purpose: an open stall is over (the wait is the athlete's).
    if (!want) this.closeStall(now);
  }

  seekRequested(now: number): void {
    this.seekCount += 1;
    this.expectWait(now);
  }

  /**
   * The athlete switched angle (the tap). The new angle's load is the app's
   * own wait, not a stall; `switchLanded` measures how long it took.
   */
  switchStarted(now: number, mode?: SwitchMode): void {
    this.switchCount += 1;
    if (mode) this.switchModes[mode] += 1;
    this.switchAt = now;
    this.expectSwap(now);
  }

  /** The switched-to angle showed its first frame. Only the latest switch counts. */
  switchLanded(now: number): void {
    if (this.switchAt == null) return;
    this.switchLatencies.push(Math.max(0, now - this.switchAt));
    this.switchAt = null;
  }

  /** One smoothed sync error sample of a lock-stepped angle (seconds). */
  syncResidual(errorS: number): void {
    this.residuals.add(errorS);
  }

  /** A standby was kept warm by the decoder cap, or demoted after a decoder error. */
  decoderCap(reason: string): void {
    this.decoderCapEvents += 1;
    this.decoderCapReasons.add(reason);
  }

  /** The view rendered a frame (onFirstFrameRender). Only counts after the intent. */
  firstFrame(now: number): void {
    if (this.intentAt == null || this.sourceAt == null) return;
    if (this.firstFrameAt == null) this.firstFrameAt = now;
  }

  status(status: PlayerStatus, now: number): void {
    if (status === "loading") {
      if (this.exempt(now)) return;
      if (this.firstFrameAt != null && this.wantPlay && this.stallSince == null) {
        this.stallSince = now;
        this.stallCount += 1;
        this.emitStall("start", now);
      }
      return;
    }
    if (status === "readyToPlay") {
      this.clearExemptions();
      this.closeStall(now);
      return;
    }
    if (status === "error") this.closeStall(now);
  }

  playing(isPlaying: boolean, now: number): void {
    if (isPlaying) {
      this.closeStall(now);
      // Playing at all (even when started from native controls or a restore)
      // means the athlete wants playback; and any app-caused wait is over.
      this.wantPlay = true;
      this.clearExemptions();
      if (this.firstFrameAt == null && this.sourceAt != null) {
        // Playing implies a frame, and an intent (a reel's autoplay is off).
        if (this.intentAt == null) this.intentAt = now;
        this.firstFrameAt = now;
      }
      if (this.playingSince == null) this.playingSince = now;
      this.unrecovered = false;
      return;
    }
    this.stopWatchClock(now);
  }

  position(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds < 0) return;
    this.maxPositionS = Math.max(this.maxPositionS ?? 0, seconds);
    if (this.seekAt != null || this.swapPending) {
      // Updates after a seek may still report the old spot before the one
      // where it landed. A jump of more than SEEK_JUMP_S is the seek landing
      // (reset the baseline there); only a small forward step from the
      // baseline is playback progress, which ends the exemption.
      if (this.exemptBase === undefined) {
        this.exemptBase = seconds;
        return;
      }
      const step = seconds - this.exemptBase;
      if (Math.abs(step) > SEEK_JUMP_S) this.exemptBase = seconds;
      else if (step > 0.01) this.clearExemptions();
    }
  }

  duration(seconds: number): void {
    if (Number.isFinite(seconds) && seconds > 0) this.durationS = seconds;
  }

  ended(): void {
    this.completed = true;
  }

  error(message: string | null | undefined): void {
    this.errorMessage = scrubPlaybackError(message ?? "player error");
    this.errorCount += 1;
    this.unrecovered = true;
  }

  /**
   * Worth one event. Match player: every open with a play intent (autoplay
   * sets it at mount), even one that closed or failed while signing. Reel:
   * only once it was played. Continuation: only if something happened.
   */
  shouldReport(): boolean {
    if (this.errorCount > 0) return true;
    if (this.meta.surface === "highlight") {
      // A reel card that was never tapped is not a viewing session.
      return this.intentAt != null && this.sourceAt != null;
    }
    if (this.resumed) return this.watchMs > 0 || this.playingSince != null || this.stallCount > 0;
    return this.intentAt != null || this.sourceAt != null;
  }

  summary(now: number, endReason: PlaybackEndReason): PlaybackSessionSummary {
    this.closeStall(now);
    this.stopWatchClock(now);
    const ttff =
      !this.resumed && this.firstFrameAt != null && this.intentAt != null
        ? Math.max(0, this.firstFrameAt - this.intentAt)
        : null;
    // A sign that ended without a playable file is not an abandoned startup.
    const signBlocked = this.signOutcome != null && this.signOutcome !== "ok" && this.signOutcome !== "pending";
    const rebufferBase = this.watchMs + this.stallMs;
    const signMs =
      this.meta.surface === "match" && !this.resumed && this.sourceAt != null ? this.sourceAt - this.openedAt : null;
    return {
      ...this.meta,
      sourceKind: this.sourceKind,
      signOutcome: this.signOutcome,
      networkType: this.networkType,
      cellularGeneration: this.cellularGeneration,
      resumed: this.resumed,
      endReason,
      sessionMs: now - this.openedAt,
      signMs,
      timeToFirstFrameMs: ttff,
      startupAbandoned: this.intentAt != null && this.firstFrameAt == null && !signBlocked && !this.unrecovered,
      watchMs: this.watchMs,
      watchMinutes: Math.round((this.watchMs / 60_000) * 100) / 100,
      stallCount: this.stallCount,
      stallMs: this.stallMs,
      longestStallMs: this.longestStallMs,
      rebufferRatio: rebufferBase > 0 ? Math.round((this.stallMs / rebufferBase) * 10_000) / 10_000 : null,
      seekCount: this.seekCount,
      resignCount: this.resignCount,
      completed: this.completed,
      errorCount: this.errorCount,
      error: this.errorMessage,
      endedInError: this.unrecovered,
      durationS: this.durationS,
      maxPositionS: this.maxPositionS,
      switchCount: this.switchCount,
      switchLatencyMs: median(this.switchLatencies),
      switchLatencyMaxMs: this.switchLatencies.length > 0 ? Math.max(...this.switchLatencies) : null,
      switchSwapCount: this.switchModes.swap,
      switchSeekCount: this.switchModes.seek,
      switchDipCount: this.switchModes.dip,
      syncResidualP50Ms: this.residuals.percentile(50),
      syncResidualP95Ms: this.residuals.percentile(95),
      syncSamples: this.residuals.count,
      decoderCapEvents: this.decoderCapEvents,
      decoderCapReasons: this.decoderCapReasons.size > 0 ? [...this.decoderCapReasons].sort().join(",") : null,
      ...this.qualitySummary(ttff, signMs),
    };
  }

  private qualitySummary(
    ttff: number | null,
    signMs: number | null,
  ): Pick<
    PlaybackSessionSummary,
    | "qualityPreference"
    | "settingsVersion"
    | "settingsSource"
    | "adaptiveEnabled"
    | "networkKey"
    | "connectionExpensive"
    | "startTarget"
    | "startReason"
    | "startRendition"
    | "startFallback"
    | "playbackProfile"
    | "finalRendition"
    | "qualitySwitchCount"
    | "qualityStepDownCount"
    | "qualityStepUpCount"
    | "qualitySwitches"
    | "qualitySwitchesTruncated"
    | "qualitySwitchLatencyMs"
    | "qualitySwitchLatencyMaxMs"
    | "msOn720"
    | "msOn360"
    | "msOnOriginal"
    | "stallsBeforeStepDown"
    | "stallMsBeforeStepDown"
    | "stallsAfterStepDown"
    | "stallMsAfterStepDown"
    | "qualityLockedLow"
    | "qualityCapReached"
    | "playerStartupMs"
  > {
    const q = this.quality;
    const before = this.beforeStepDown;
    return {
      qualityPreference: q?.qualityPreference ?? null,
      settingsVersion: q?.settingsVersion ?? null,
      settingsSource: q?.settingsSource ?? null,
      adaptiveEnabled: q?.adaptiveEnabled ?? null,
      networkKey: q?.networkKey ?? null,
      connectionExpensive: q?.connectionExpensive ?? null,
      startTarget: q?.startTarget ?? null,
      startReason: q?.startReason ?? null,
      startRendition: this.startRendition,
      startFallback: q != null && this.startRendition != null && this.startRendition !== q.startTarget,
      playbackProfile: this.playbackProfile,
      finalRendition: this.currentRendition,
      qualitySwitchCount: this.qualitySwitchCount,
      qualityStepDownCount: this.qualityStepDowns,
      qualityStepUpCount: this.qualityStepUps,
      qualitySwitches: this.qualitySwitches.slice(0, QUALITY_SWITCHES_KEPT),
      qualitySwitchesTruncated: this.qualitySwitchCount > QUALITY_SWITCHES_KEPT,
      qualitySwitchLatencyMs: median(this.qualityLatencies),
      qualitySwitchLatencyMaxMs: this.qualityLatencies.length > 0 ? Math.max(...this.qualityLatencies) : null,
      msOn720: this.msOn["720"],
      msOn360: this.msOn["360"],
      msOnOriginal: this.msOn.original,
      stallsBeforeStepDown: before?.count ?? null,
      stallMsBeforeStepDown: before?.ms ?? null,
      stallsAfterStepDown: before ? this.stallCount - before.count : null,
      stallMsAfterStepDown: before ? this.stallMs - before.ms : null,
      qualityLockedLow: this.lockedLow,
      qualityCapReached: this.capReached,
      playerStartupMs: ttff !== null && signMs !== null ? Math.max(0, ttff - signMs) : null,
    };
  }

  private closeStall(now: number): void {
    if (this.stallSince == null) return;
    const ms = now - this.stallSince;
    this.stallMs += ms;
    this.longestStallMs = Math.max(this.longestStallMs, ms);
    this.stallSince = null;
    this.emitStall("end", now);
  }

  private stopWatchClock(now: number): void {
    if (this.playingSince == null) return;
    const ms = now - this.playingSince;
    this.watchMs += ms;
    // Watch time per served rendition (unbucketed before any attach: a reel).
    if (this.currentRendition) this.msOn[this.currentRendition] += ms;
    this.playingSince = null;
  }
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** The single coarse bucket a session lands in, for a Sentry tag. */
export function outcomeOf(
  s: PlaybackSessionSummary,
): "error" | "sign_failed" | "unavailable" | "abandoned_startup" | "completed" | "watched" | "idle" {
  if (s.endedInError) return "error";
  if (s.sourceKind == null && s.signOutcome === "failed") return "sign_failed";
  if (s.sourceKind == null && (s.signOutcome === "missing" || s.signOutcome === "absent" || s.signOutcome === "processing")) {
    return "unavailable";
  }
  if (s.startupAbandoned) return "abandoned_startup";
  if (s.completed) return "completed";
  return s.watchMs > 0 ? "watched" : "idle";
}

/**
 * Send one session as one Sentry event. Never throws: telemetry must not be
 * the thing that breaks playback (a doubled tracking module in a component
 * test may not even provide captureMessage).
 */
/** `video.playback.startup_bucket`, from `playerStartupMs`. */
export function startupBucket(ms: number | null): string {
  if (ms === null) return "none";
  if (ms < 1000) return "lt1s";
  if (ms < 2000) return "1to2s";
  if (ms < 2500) return "2to2.5s";
  if (ms < 3000) return "2.5to3s";
  if (ms < 5000) return "3to5s";
  return "gte5s";
}

/** `video.playback.rebuffer_bucket`, from `rebufferRatio`. */
export function rebufferBucket(ratio: number | null): string {
  if (ratio === null) return "none";
  if (ratio === 0) return "0";
  if (ratio < 0.01) return "lt1pct";
  if (ratio < 0.02) return "1to2pct";
  if (ratio < 0.05) return "2to5pct";
  return "gte5pct";
}

/** The Discover dimensions of one session (string values only). */
export function playbackTags(s: PlaybackSessionSummary): Record<string, string> {
  const match = s.surface === "match";
  const rendition = (r: string | null) => (match ? (r ?? "unknown") : "none");
  return {
    "video.playback.surface": s.surface,
    "video.playback.source": s.sourceKind ?? "unknown",
    "video.playback.network": s.networkType ?? "unknown",
    "video.playback.outcome": outcomeOf(s),
    // The player mode only means something for the match player (#53 review N1).
    ...(match ? { "video.playback.mode": s.playerMode ?? "single" } : null),
    "video.playback.rendition": rendition(s.startRendition),
    "video.playback.rendition_final": rendition(s.finalRendition),
    "video.playback.start_reason": (match && s.startReason) || "none",
    "video.playback.quality_pref": (match && s.qualityPreference) || "none",
    "video.playback.stepdown": match && s.stallsBeforeStepDown !== null ? "stall" : "none",
    "video.playback.network_key": (match && s.networkKey) || "none",
    "video.playback.stalled": s.stallCount > 0 ? "yes" : "no",
    "video.playback.startup_bucket": startupBucket(s.playerStartupMs),
    "video.playback.rebuffer_bucket": rebufferBucket(s.rebufferRatio),
  };
}

export function reportPlaybackSession(s: PlaybackSessionSummary): void {
  const capture = (tracking as Partial<typeof tracking>).captureMessage;
  if (typeof capture !== "function") return;
  try {
    capture("Video playback session", {
      level: "info",
      tags: playbackTags(s),
      extra: { ...s },
    });
  } catch {
    /* never fail playback over telemetry */
  }
}

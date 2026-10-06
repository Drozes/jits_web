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

  constructor(
    meta: PlaybackSessionMeta,
    now: number,
    opts: { resumed?: boolean; sourceKind?: PlaybackSourceKind | null; wantPlay?: boolean } = {},
  ) {
    this.meta = { ...meta };
    this.openedAt = now;
    if (meta.surface === "match" && !opts.resumed) this.signOutcome = "pending";
    this.resumed = opts.resumed ?? false;
    // A continuation already has its source on the player.
    if (opts.sourceKind) {
      this.sourceKind = opts.sourceKind;
      this.sourceAt = now;
    }
    if (opts.wantPlay) this.playIntent(true, now);
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
    return {
      ...this.meta,
      sourceKind: this.sourceKind,
      signOutcome: this.signOutcome,
      networkType: this.networkType,
      cellularGeneration: this.cellularGeneration,
      resumed: this.resumed,
      endReason,
      sessionMs: now - this.openedAt,
      signMs:
        this.meta.surface === "match" && !this.resumed && this.sourceAt != null ? this.sourceAt - this.openedAt : null,
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
    };
  }

  private closeStall(now: number): void {
    if (this.stallSince == null) return;
    const ms = now - this.stallSince;
    this.stallMs += ms;
    this.longestStallMs = Math.max(this.longestStallMs, ms);
    this.stallSince = null;
  }

  private stopWatchClock(now: number): void {
    if (this.playingSince == null) return;
    this.watchMs += now - this.playingSince;
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
export function reportPlaybackSession(s: PlaybackSessionSummary): void {
  const capture = (tracking as Partial<typeof tracking>).captureMessage;
  if (typeof capture !== "function") return;
  try {
    capture("Video playback session", {
      level: "info",
      tags: {
        "video.playback.surface": s.surface,
        "video.playback.source": s.sourceKind ?? "unknown",
        "video.playback.network": s.networkType ?? "unknown",
        "video.playback.outcome": outcomeOf(s),
        "video.playback.mode": s.playerMode ?? "single",
      },
      extra: { ...s },
    });
  } catch {
    /* never fail playback over telemetry */
  }
}

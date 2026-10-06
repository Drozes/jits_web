import type { NetworkKey } from "@jits/shared/utils";
import {
  FRAME_S,
  GAIN,
  HARD_SEEK_HIDDEN_S,
  MAX_NUDGE,
  SWAP_MAX_ERROR_S,
} from "@/lib/video/multi-angle/sync-controller";

/**
 * Keep-watching angle switch (jits-xfvd.19, contract
 * research/2026-10-multi-angle-playback/07-keep-watching-contract.md).
 *
 * The pure planner: constants, the incoming angle's target time, when to
 * start it, and one chase step. No React, no expo-video, and nothing from
 * `use-video-playback.ts`, so the multi-angle player (jits-xfvd.3) reuses it
 * for its "on demand" standby.
 *
 * Notation: A is the angle on screen, B the incoming one. `map(tA)` is A's
 * time on B's clock (the two sync offsets); `rate` is the session's speed.
 * A lead is WALL seconds, so its media length is `lead * rate`.
 */

export type NetworkClass = "fast" | "cellular" | "slow";

/** wifi | ethernet -> fast; cellular_5g | cellular_4g -> cellular; anything else (or null) -> slow. */
export function networkClassOf(key: NetworkKey | null): NetworkClass {
  if (key === "wifi" || key === "ethernet") return "fast";
  if (key === "cellular_5g" || key === "cellular_4g") return "cellular";
  return "slow";
}

/** OTA kill switch (D3): false restores the phase-1 in-place switch exactly. */
export const KEEP_WATCHING_ENABLED: boolean = true;
export const INITIAL_LEAD_S: Record<NetworkClass, number> = { fast: 1.0, cellular: 2.0, slow: 3.0 };
export const LEAD_MIN_S = 0.6;
export const LEAD_MAX_S = 5.0;
/** lead = clamp(LEAD_SAFETY * readyEwmaS + 0.2, LEAD_MIN_S, LEAD_MAX_S). */
export const LEAD_SAFETY = 1.3;
/** play() to the first advancing time update, before any sample (EWMA after). */
export const START_LATENCY_INITIAL_S = 0.12;
/** Settled but not "ready" after this long: play B muted at once (iOS paused-buffer). */
export const READY_FALLBACK_MS = 1000;
/** Late-ready retargets per switch (user actions do not count). */
export const MAX_RETARGETS = 2;
/** Hidden hard re-seeks of B while chasing. */
export const MAX_HIDDEN_RESEEKS = 3;
/** Consecutive samples within SWAP_MAX_ERROR_S (2 frames) that land the switch. */
export const IN_STEP_SAMPLES = 2;
/** Land anyway with the leftover offset this long after the tap (D2). */
export const KEEP_WATCHING_CAP_MS: Record<NetworkClass, number> = { fast: 4000, cellular: 8000, slow: 10000 };
/** No landing this long after the tap: the switch is abandoned (D6). Always > the cap. */
export const ABANDON_TIMEOUT_MS: Record<NetworkClass, number> = { fast: 8000, cellular: 12000, slow: 12000 };
/** One silent retry of an incoming load error, then abandon (owner, 2026-10-06). */
export const LOAD_RETRY_MAX = 1;
/** A retry re-signs when the URL was signed longer ago than this. */
export const RESIGN_IF_OLDER_THAN_MS = 30 * 60 * 1000;
/** false: the audio is cut at the crossfade's midpoint instead of ramped. */
export const AUDIO_RAMP: boolean = true;
/** Ramp steps over CROSSFADE_MS (every 40 ms). */
export const AUDIO_RAMP_STEPS = 6;
/** = motion duration.fast (the UI uses the token). */
export const CROSSFADE_MS = 240;
/** = moment.angleDip. */
export const DIP_MS = 80;
/** B's preferredForwardBufferDuration while pending (restored at the landing). */
export const INCOMING_FORWARD_BUFFER_S = 5;

/** Why a keep_watching switch ended without landing (section 7). */
export type AbandonReason =
  | "sign_failed"
  | "load_error"
  | "decoder_error"
  | "timeout"
  | "background"
  | "navigation"
  | "unmount"
  | "front_error";

/** Reasons that set `switchState.failed` and show the failure tag. */
export const FAILURE_ABANDON_REASONS: ReadonlySet<AbandonReason> = new Set<AbandonReason>([
  "sign_failed",
  "load_error",
  "decoder_error",
  "timeout",
]);

/** Why a switch ran in_place instead of keep_watching (section 9). */
export type InPlaceReason =
  | "disabled"
  | "unsupported"
  | "warm_only"
  | "no_offsets"
  | "front_not_ready"
  | "quality_swap"
  | "phase_not_ready";

/** B is never targeted closer than this to its end (the hook's END_EPSILON_S). */
const END_EPSILON_S = 0.5;

/** A's time on B's clock, unclamped (a negative time is before B started). */
export function mapToIncoming(tA: number, fromOffsetMs: number | null, toOffsetMs: number | null): number {
  const t = Number.isFinite(tA) ? tA : 0;
  if (typeof fromOffsetMs !== "number" || typeof toOffsetMs !== "number") return t;
  if (!Number.isFinite(fromOffsetMs) || !Number.isFinite(toOffsetMs)) return t;
  return t + (fromOffsetMs - toOffsetMs) / 1000;
}

/** clampB: inside B's file, END_EPSILON_S short of its end once the duration is known. */
export function clampIncoming(t: number, durationBS: number | null): { t: number; covered: boolean } {
  const end = durationBS != null && durationBS > 0 ? Math.max(0, durationBS - END_EPSILON_S) : null;
  if (!Number.isFinite(t) || t < 0) return { t: 0, covered: false };
  if (end != null && t > end) return { t: end, covered: false };
  return { t, covered: true };
}

/** The incoming angle's target time t0 (section 3.3 step 1 and 3.4), clamped to B's file. */
export function incomingTarget(input: {
  aNowS: number;
  leadS: number;
  rate: number;
  fromOffsetMs: number | null;
  toOffsetMs: number | null;
  durationBS: number | null;
}): { t0S: number; covered: boolean } {
  const raw = mapToIncoming(input.aNowS, input.fromOffsetMs, input.toOffsetMs) + Math.max(0, input.leadS) * input.rate;
  const { t, covered } = clampIncoming(raw, input.durationBS);
  return { t0S: t, covered };
}

/** Wall seconds until A's mapped time reaches t0 (negative = A already passed it). */
export function waitUntilTarget(t0S: number, mappedANowS: number, rate: number): number {
  const r = rate > 0 ? rate : 1;
  return (t0S - mappedANowS) / r;
}

/** 3.3 step 3: start B at the right moment, or retarget, or chase. */
export type StartDecision =
  | { kind: "schedule"; inMs: number }
  /** covered=false: the new target was clamped to B's edge (B does not cover it, 3.5). */
  | { kind: "retarget"; t0S: number; covered: boolean }
  | { kind: "chase" };

export function decideStart(input: {
  waitS: number;
  startLatencyS: number;
  retargets: number;
  mappedANowS: number;
  leadS: number;
  readyMs: number;
  rate: number;
  durationBS: number | null;
}): StartDecision {
  if (input.waitS >= input.startLatencyS) {
    return { kind: "schedule", inMs: Math.max(0, (input.waitS - input.startLatencyS) * 1000) };
  }
  if (input.retargets < MAX_RETARGETS) {
    // The lead was too short for this load: aim further ahead, by at least
    // what this load actually took.
    const leadS = Math.max(input.leadS, LEAD_SAFETY * (input.readyMs / 1000) + 0.2);
    const { t, covered } = clampIncoming(input.mappedANowS + leadS * input.rate, input.durationBS);
    return { kind: "retarget", t0S: t, covered };
  }
  return { kind: "chase" };
}

/** 3.3 step 4 and 5: one chase step from a smoothed error sample. */
export type ChaseDecision =
  | { kind: "land"; errorS: number; byCap: boolean }
  | { kind: "hold"; inStep: number }
  | { kind: "nudge"; rate: number }
  | { kind: "reseek"; toS: number };

/**
 * One chase step. A sample within 2 frames (SWAP_MAX_ERROR_S) counts as in
 * step and holds B at the session rate; IN_STEP_SAMPLES of them in a row
 * land. A bigger error nudges B's rate (and resets the count), and one past
 * HARD_SEEK_HIDDEN_S re-seeks B while re-seeks are left (else it nudges at
 * the full nudge). At or past the cap it lands with the error it has (D2).
 * An approximate angle is not sync-checked: the caller asks only once B has
 * started at t0, and it lands.
 */
export function decideChase(input: {
  errorS: number;
  inStep: number;
  rate: number;
  hiddenReseeks: number;
  mappedANowS: number;
  startLatencyS: number;
  elapsedMs: number;
  capMs: number;
  approximate: boolean;
}): ChaseDecision {
  const e = Number.isFinite(input.errorS) ? input.errorS : Number.POSITIVE_INFINITY;
  if (input.approximate) return { kind: "land", errorS: Number.isFinite(e) ? e : 0, byCap: false };
  if (Math.abs(e) <= SWAP_MAX_ERROR_S) {
    const inStep = input.inStep + 1;
    if (inStep >= IN_STEP_SAMPLES) return { kind: "land", errorS: e, byCap: false };
    if (input.elapsedMs >= input.capMs) return { kind: "land", errorS: e, byCap: true };
    return { kind: "hold", inStep };
  }
  if (input.elapsedMs >= input.capMs) return { kind: "land", errorS: Number.isFinite(e) ? e : 0, byCap: true };
  if (Math.abs(e) >= HARD_SEEK_HIDDEN_S && input.hiddenReseeks < MAX_HIDDEN_RESEEKS) {
    return { kind: "reseek", toS: Math.max(0, input.mappedANowS + input.startLatencyS * input.rate) };
  }
  const err = Number.isFinite(e) ? e : 0;
  const nudge = Math.max(-MAX_NUDGE, Math.min(MAX_NUDGE, err * GAIN));
  return { kind: "nudge", rate: input.rate * (1 - nudge) };
}

/** Equal-power gains for ramp step k of n (k = 0..n). */
export function rampGains(k: number, n: number): { from: number; to: number } {
  const x = n > 0 ? Math.min(1, Math.max(0, k / n)) : 1;
  return { from: Math.cos((x * Math.PI) / 2), to: Math.sin((x * Math.PI) / 2) };
}

/** 7.1: whether a retry must re-sign (URL older than RESIGN_IF_OLDER_THAN_MS, or a 400/401/403 message). */
export function retryNeedsResign(signedAtMs: number, nowMs: number, errorMessage: string | null): boolean {
  if (nowMs - signedAtMs > RESIGN_IF_OLDER_THAN_MS) return true;
  return errorMessage != null && /\b(400|401|403)\b/.test(errorMessage);
}

/** D7: an Android decoder failure (no retry, latch in_place). */
export function isDecoderError(os: string, errorMessage: string | null): boolean {
  return os === "android" && errorMessage != null && /codec|decoder|MediaCodec/i.test(errorMessage);
}

/** One frame: an approximate angle has "started at t0" from t0 minus this. */
export const START_AT_TARGET_SLACK_S = FRAME_S;

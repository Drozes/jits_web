# Angle switch phase 1.5: keep-watching switch in the shipped single player (contract)

Date: 2026-10-06. Author: PM agent (no product code). Bead: jits-xfvd.19 (phase 1.5, OTA). Builds on jits-xfvd.16 (phase 1, shipped in production OTA ff7e974d; contract `06-angle-switch-phase1-contract.md`). Reused by jits-xfvd.3 (multi-angle player, phase 2), see section 12. This file is the single source of truth for implementer slices K1 (engine) and K2 (UI) and for the independent reviewer. Where this file and the bead disagree, this file wins; raise the conflict instead of guessing. Untracked in the main checkout; implementers copy it into their branch under the same path.

All paths are under `apps/mobile/` unless stated. Line references are to `origin/development` 7f4c7b0d.

## 0. Owner feedback and decisions (2026-10-06, authoritative)

- After testing phase 1 on device: "When I switch, the video still stalls for a second."
- Wanted: keep playing angle 1 WITH ITS AUDIO until angle 2 is ready, then crossfade to angle 2. The switch may land later (tap at 11 s, land at 14 to 15 s); that is better than a stall. The chips flip at the crossfade.
- Confirmed earlier: no preload on cellular (this design downloads the new angle only after the tap); the angle switcher stays at the top; pill copy `Syncing angle` (exact-synced) / `Switching angle` (approximate).

- **Owner decision (2026-10-06, later the same day): LOCK the angle chips.** Once the athlete taps an angle, every angle chip is locked until the transition lands or the switch is abandoned. No supersede: taps on any chip are ignored (no haptic on an ignored tap). The tapped chip shows the pressed/busy treatment with `accessibilityState` busy + selected; every other chip is `disabled` and dimmed per the design system's disabled rule (`opacity-disabled` 0.5). The engine also rejects `switchAngle` while a switch is in flight (defensive). An abandon rule (section 7) guarantees the lock always releases. User seeks and skips stay allowed while pending (they retarget).

- **Owner answers (2026-10-06, final):** (1) a load error of the incoming angle gets ONE silent retry inside the abandon window (re-sign if the URL may be stale, replace the incoming item, same target logic), then abandon (section 7.1); (2) out of sync at the cap: land anyway with the leftover offset (D2 confirmed, section 3.3 step 5); (3) NO haptic on landing (the only switch haptic stays `haptics.select` on the accepted tap).

PM decisions recorded here:
- D1. "Chips flip at the crossfade": the bottom chrome (key-moment chips, caption, seek bar, clock) stays on angle 1 until the crossfade starts. The switcher shows the lock treatment from the tap (above) and its resting selected state moves to the new angle at the landing.
- D4. The lock releases when the state returns to `idle`: `SWITCH_SETTLE_MS` (300 ms) after the landing, when the crossfade has finished, or at once on an abandon. A tap during the crossfade is therefore also ignored.
- D5. The lock and the engine-side rejection apply to BOTH modes (keep_watching and the in_place fallback). The phase-1 in_place supersede branches become unreachable; they are left in place untouched in this bead (no change to shipped in_place behavior) and listed for cleanup in a follow-up.
- D6. Abandon hard timeout: 8 s on fast networks (Wi-Fi, Ethernet), 12 s on cellular and every other network, from the tap. Compiled constants in this bead; server-tunable later through the `standby` block of `get_playback_settings` (keys added to jr_be-du1.9 / jits-xfvd.17 scope).
- D2 (owner-confirmed 2026-10-06). A switch that cannot get in step within its cap lands anyway (crossfade with the leftover offset) rather than stalling.
- D3. The keep-watching path is guarded by an OTA constant (`KEEP_WATCHING_ENABLED`, default true); no server key in this release.
- D7. The silent retry is skipped for an Android decoder error (message matches `/codec|decoder|MediaCodec/i`): it is deterministic on that device, so the switch abandons at once and latches in_place for later switches.

## 1. Why phase 1 still stalls

Phase 1 (`lib/match-detail/use-video-playback.ts`, `swapSource` lines 1141 to 1203) uses ONE player: it pauses angle 1 (`player.pause()`, line 1186) and replaces its item. Whatever the seek and buffer cost (about 0.3 to 0.8 s on Wi-Fi, 0.6 to 1.9 s on LTE, plus a sign round trip on a pre-sign miss), the athlete watches a still and hears nothing for that long. One decoder cannot show angle 1 while angle 2 loads. Phase 1.5 adds a second player used only during a switch.

## 2. Dual-player design

### 2.1 Two slots, front and incoming

- The hook owns TWO expo-video players for the screen's lifetime, created at mount with `useVideoPlayer(null, setup)` (same setup as today: `timeUpdateEventInterval = 0.25`, `preservesPitch = true`). A player with a null source holds no item and no decoder, so the second one costs nothing until a switch.
- `frontSlot: 0 | 1` names the slot on screen. The other slot is idle (null source) except during a keep-watching switch, when it is the **incoming** slot.
- Roles swap at the landing: the incoming slot becomes `frontSlot`. The old front is released `SWITCH_SETTLE_MS` (300 ms) after the landing, when the crossfade has finished: `pause()`, `muted = true`, `volume = 1`, `playbackRate = 1`, then `replaceAsync(null)` (clears the item and frees its decoder).
- Never move a player between views: each slot has its own `VideoView`, bound to that slot's player for the screen's life (expo-video on Android cannot drive one player from two views).
- Android decoders: at most two are in use, and only between the incoming load and the release. A warm-only device (section 9) never takes this path.

### 2.2 Views and z-order (K2)

- Two stacked `VideoView`s, `StyleSheet.absoluteFill`, `contentFit="contain"`, `nativeControls={false}`.
- **Android: `surfaceType="textureView"` on both views**, set at mount and never changed (stacked SurfaceViews ignore alpha and z-order; the multi-angle prototype already uses textureView, `components/film-room/multi-angle/angle-stack.tsx:81`). iOS: default.
- Z-order rule: the TOP view is `switchState.phase === "landing" ? switchState.fromSlot : frontSlot`. The other view sits directly under it at opacity 1 (an occluded layer at full opacity keeps rendering normally; a transparent one might be throttled on iOS, research 01 risks).
- The crossfade fades the TOP view (the outgoing angle 1, still live and playing) from 1 to 0, revealing the incoming angle underneath. After `idle`, the top view is the new front at opacity 1 again (reset instantly; the view under it holds a released player and is covered).
- The poster (`source.posterUrl && !frameShown`) applies to the front slot only, as today.

## 3. Sync timing

Notation: `A` = front player (angle 1), `B` = incoming player (angle 2). `map(tA)` = `translateAngleTime(tA, fromOffsetMs, toOffsetMs).t` (`packages/shared/src/utils/key-moments.ts`), in fractional seconds, never floored. `rate` = the session's playback rate. `extrapolate` and `DriftFilter`, `correctionFor`, `FRAME_S`, `SWAP_MAX_ERROR_S`, `HARD_SEEK_HIDDEN_S` come from `lib/video/multi-angle/sync-controller.ts` (reused read-only, not edited). `clampB(t)` = `min(max(t, 0), durB - END_EPSILON_S)` once B's duration is known (DB `durationSeconds` until then).

### 3.1 Constants (exported from `lib/match-detail/keep-watching.ts`, K1)

```ts
export const KEEP_WATCHING_ENABLED = true;          // OTA kill switch (D3)
export const INITIAL_LEAD_S: Record<"fast" | "cellular" | "slow", number> = { fast: 1.0, cellular: 2.0, slow: 3.0 };
// fast = wifi | ethernet; cellular = cellular_5g | cellular_4g; slow = every other network key
export const LEAD_MIN_S = 0.6;
export const LEAD_MAX_S = 5.0;
export const LEAD_SAFETY = 1.3;                      // lead = clamp(LEAD_SAFETY * readyEwmaS + 0.2)
export const START_LATENCY_INITIAL_S = 0.12;          // play() to first advancing time, EWMA after
export const READY_FALLBACK_MS = 1000;                // settled but not "ready": kick play() muted (iOS paused-buffer)
export const MAX_RETARGETS = 2;                       // late-ready retargets per switch (user actions do not count)
export const MAX_HIDDEN_RESEEKS = 3;                  // hidden hard re-seeks while chasing
export const IN_STEP_SAMPLES = 2;                     // consecutive samples with |e| <= SWAP_MAX_ERROR_S (2 frames)
export const KEEP_WATCHING_CAP_MS: Record<"fast" | "cellular" | "slow", number> = { fast: 4000, cellular: 8000, slow: 10000 };
export const AUDIO_RAMP = true;                        // false: audio cut at the crossfade midpoint
export const AUDIO_RAMP_STEPS = 6;                     // over CROSSFADE_MS (240) = every 40 ms
export const CROSSFADE_MS = 240;                       // = motion duration.fast (UI uses the token)
export const DIP_MS = 80;                              // = moment.angleDip
export const INCOMING_FORWARD_BUFFER_S = 5;            // B's preferredForwardBufferDuration while pending; restored at landing
export const ABANDON_TIMEOUT_MS: Record<"fast" | "cellular" | "slow", number> = { fast: 8000, cellular: 12000, slow: 12000 };
export const LOAD_RETRY_MAX = 1;                        // owner 2026-10-06: one silent retry of a load error, then abandon
export const RESIGN_IF_OLDER_THAN_MS = 30 * 60 * 1000;  // a retry re-signs when the URL was signed longer ago than this
// Hard timeout from the tap: no landing by then -> abandon (section 7). Always > KEEP_WATCHING_CAP_MS.
// Later read from get_playback_settings standby.abandonMsFast / abandonMsCellular / abandonMsSlow when jits-xfvd.17 ships (builtin = these values).
```

### 3.2 Lead store (`lib/match-detail/switch-lead-store.ts`, K1)

- In-memory module store (one app run), keyed by network class (`fast | cellular | slow`, from `networkKey(currentNetworkSnapshot())` in `lib/video/quality/network-store.ts`).
- Records, per landed keep-watching switch, `readyMs` = time from B's `replaceAsync` issue to B ready at its target (3.3 step 2), and `startLatencyMs` = `B.play()` to B's first advancing `timeUpdate`. EWMA with alpha 0.3.
- `leadFor(class)` = with no sample: `INITIAL_LEAD_S[class]`; else `clamp(LEAD_SAFETY * readyEwmaS + 0.2, LEAD_MIN_S, LEAD_MAX_S)`.
- `startLatencyFor(class)` = EWMA or `START_LATENCY_INITIAL_S`.

### 3.3 Playing (rate > 0, play intent on)

1. **Sign and load.** On the tap, `targetId`'s signed source comes from the pre-sign cache at the controller's current target (`quality.currentTarget()`), or is signed (failure: section 7). When the source is in hand: `lead = leadFor(class)`, `t0 = clampB(map(A.now) + lead * rate)`. Set on B: `muted = true`, `volume = 1`, `playbackRate = rate`, `bufferOptions.preferredForwardBufferDuration = INCOMING_FORWARD_BUFFER_S`; call `B.replaceAsync({ uri })`; at its settle set `B.currentTime = t0` (the phase-1 seek-at-settle rule, contract 06 section 3.7). B stays paused. Record `leadMs = lead * 1000` for telemetry.
2. **Ready.** B is ready at its target when the first of these happens for B's current generation: its `statusChange` reports `readyToPlay` after the seek was issued; its view's `onFirstFrameRender` fires after the seek was issued; or `READY_FALLBACK_MS` after settle (then call `B.play()` muted at once, go to step 4: iOS may not fill a paused item's buffer). Record `readyMs`.
3. **Wait for A to reach t0.** `waitS = (t0 - map(extrapolate(A sample, now, playing, rate))) / rate`.
   - If `waitS >= startLatencyFor(class)`: schedule `B.play()` (rate already set) at `waitS - startLatency`.
   - Else (A already passed t0, the "late" case): if `retargets < MAX_RETARGETS`, `retargets += 1`, `t0 = clampB(map(A.now) + max(lead, LEAD_SAFETY * readyMs/1000 + 0.2) * rate)`, seek B (still paused, `B.currentTime = t0`), back to step 2. Else go to step 4 at once (chase).
4. **Hidden chase until in step.** B plays muted UNDER A. While pending, both players use `timeUpdateEventInterval = 0.1`. On each B `timeUpdate`: `e = tB - map(extrapolate(A sample))`, smoothed by a `DriftFilter`. Apply `correctionFor(e, rate, /* visible */ false)`:
   - `hold` (|e| <= one frame): count an in-step sample;
   - `nudge`: set `B.playbackRate` to the nudged rate, reset the in-step count;
   - `seek` (|e| > `HARD_SEEK_HIDDEN_S`): if `hiddenReseeks < MAX_HIDDEN_RESEEKS`, hard re-seek B to `map(A.now) + startLatency * rate`, `hiddenReseeks += 1`; else keep nudging.
   - LAND (section 5) as soon as `IN_STEP_SAMPLES` consecutive samples have `|e| <= SWAP_MAX_ERROR_S` (2 frames, 66.7 ms). On landing, B's rate is set back to exactly `rate`.
5. **Cap (D2).** If not landed `KEEP_WATCHING_CAP_MS[class]` after the tap and B has shown at least one advancing `timeUpdate`, LAND anyway with the current error (logged as `syncErrorAtLandMs`). If B has not started by the cap, A keeps playing and the switch keeps waiting under the pill until `ABANDON_TIMEOUT_MS[class]` after the tap, then it is ABANDONED (section 7). A pending switch ends only by a landing or an abandon.

### 3.4 Paused (play intent off, or rate 0)

- No lead. `t0 = clampB(map(A.currentTime))` exactly. Load B as in 3.3 step 1, seek at settle, stay paused.
- LAND on B's first frame rendered after the seek was issued (its view's `onFirstFrameRender`), or `PAUSED_LAND_FALLBACK_MS` (350, the phase-1 constant) after B's post-seek `readyToPlay`. Both pictures are still, so the crossfade is perfect.

### 3.5 Changes during a pending switch

- **Pause while playing-mode pending:** pause A and B (cancel the scheduled `play()`), then continue as 3.4 from A's paused time (re-seek B exactly).
- **Play while paused-mode pending:** start A; continue as 3.3 from step 1's lead computation, re-seeking the already-loaded B (no reload). `retargets` resets.
- **Rate change (0.25x, 0.5x, 2x):** apply to A as today; set `B.playbackRate` if B plays; if B has not started, recompute t0 with the new rate and re-seek B. Lead is wall seconds, so media lead = `lead * rate` (smaller in slow motion, larger at 2x). `retargets` does not count it.
- **User seek or skip (seek bar, plus or minus 10 s, moment chip):** A seeks as today. B: pause, cancel the scheduled play, recompute `t0` from A's seek target (`clampB(map(target) + lead * rate)` when playing, exact when paused) and re-seek B; continue at step 2. `retargets` resets; it is a user action.
- **A reaches its end (`playToEnd`):** A stops (play intent off, as today). Continue as 3.4 at `clampB(map(A end))`.
- **B does not cover the moment** (`map(A.now + lead * rate) < 0`, B started later; or beyond B's end): `t0` is the clamped edge; LAND as soon as B is ready there, with the dip (as for an approximate angle) and no sync check, because there is no matching moment.

### 3.6 The lock (no supersede), background, outside navigation, unmount

- **Lock (owner decision):** while `switchState.phase !== "idle"`, `switchAngle` is a no-op in the engine (defensive; it returns without touching state, telemetry or players) and the UI ignores every chip tap (section 11.1). There is no supersede, no cancel-by-tapping-back and no queued tap in keep_watching. The keep_watching engine has no supersede code path; `switchSuperseded()` is never called by it.
- **App to background while pending:** ABANDON with reason `background` (section 7), without the failure tag (it is not a failure). While `landing`: finish the landing synchronously (role swap, release A) before the background pause.
- **Outside navigation** (the effect at lines 580 to 607): ABANDON with reason `navigation` (no tag), then today's behavior on the front slot.
- **Unmount:** ABANDON with reason `unmount` (no tag, no state updates after unmount): clear all switch timers and audio-ramp timers; expo-video releases both players with the hook.

### 3.7 New exports (base branch for K1 and K2)

The ONE authoritative list of every new or changed exported TypeScript surface. Put this on a base branch as stubs (types, constants, and functions or components that throw `not implemented` or render null) so K1 and K2 build in parallel against it. Sections 3.1, 5.1, 5.4 and 11.1 describe the same items; if they ever disagree, this block wins.

```ts
// ============================================================================
// apps/mobile/lib/match-detail/keep-watching.ts   (NEW, owner K1; pure, no React, no expo imports
// except types; must NOT import use-video-playback.ts so jits-xfvd.3 can reuse it)
// ============================================================================
import type { NetworkKey } from "@jits/shared/utils";

export type NetworkClass = "fast" | "cellular" | "slow";
/** wifi | ethernet -> fast; cellular_5g | cellular_4g -> cellular; anything else (or null) -> slow. */
export function networkClassOf(key: NetworkKey | null): NetworkClass;

export const KEEP_WATCHING_ENABLED: boolean;                        // true
export const INITIAL_LEAD_S: Record<NetworkClass, number>;           // { fast: 1.0, cellular: 2.0, slow: 3.0 }
export const LEAD_MIN_S: number;                                     // 0.6
export const LEAD_MAX_S: number;                                     // 5.0
export const LEAD_SAFETY: number;                                    // 1.3
export const START_LATENCY_INITIAL_S: number;                        // 0.12
export const READY_FALLBACK_MS: number;                              // 1000
export const MAX_RETARGETS: number;                                  // 2
export const MAX_HIDDEN_RESEEKS: number;                             // 3
export const IN_STEP_SAMPLES: number;                                // 2
export const KEEP_WATCHING_CAP_MS: Record<NetworkClass, number>;     // { fast: 4000, cellular: 8000, slow: 10000 }
export const ABANDON_TIMEOUT_MS: Record<NetworkClass, number>;       // { fast: 8000, cellular: 12000, slow: 12000 }
export const LOAD_RETRY_MAX: number;                                 // 1
export const RESIGN_IF_OLDER_THAN_MS: number;                        // 1_800_000
export const AUDIO_RAMP: boolean;                                    // true
export const AUDIO_RAMP_STEPS: number;                               // 6
export const CROSSFADE_MS: number;                                   // 240
export const DIP_MS: number;                                         // 80
export const INCOMING_FORWARD_BUFFER_S: number;                      // 5

/** Why a keep_watching switch ended without landing (section 7). */
export type AbandonReason =
  | "sign_failed" | "load_error" | "decoder_error" | "timeout"
  | "background" | "navigation" | "unmount" | "front_error";
/** Reasons that set `switchState.failed` and show the failure tag. */
export const FAILURE_ABANDON_REASONS: ReadonlySet<AbandonReason>;   // sign_failed, load_error, decoder_error, timeout

/** Why a switch ran in_place instead of keep_watching (section 9). */
export type InPlaceReason = "disabled" | "unsupported" | "warm_only" | "no_offsets" | "front_not_ready" | "quality_swap" | "phase_not_ready";

/** The incoming angle's target time t0 (section 3.3 step 1 and 3.4), clamped to B's file. */
export function incomingTarget(input: {
  aNowS: number;                 // A's own time now (fractional seconds)
  leadS: number;                 // wall-clock lead; 0 when paused
  rate: number;                  // session rate (> 0)
  fromOffsetMs: number | null;
  toOffsetMs: number | null;
  durationBS: number | null;     // B's duration if known
}): { t0S: number; covered: boolean };   // covered=false: the edge was clamped (section 3.5 "does not cover")

/** Wall seconds until A's mapped time reaches t0 (negative = A already passed it). */
export function waitUntilTarget(t0S: number, mappedANowS: number, rate: number): number;

/** 3.3 step 3: start B at the right moment, or retarget, or chase. */
export type StartDecision =
  | { kind: "schedule"; inMs: number }
  | { kind: "retarget"; t0S: number }
  | { kind: "chase" };
export function decideStart(input: {
  waitS: number; startLatencyS: number; retargets: number;
  mappedANowS: number; leadS: number; readyMs: number; rate: number; durationBS: number | null;
}): StartDecision;

/** 3.3 step 4 and 5: one chase step from a smoothed error sample. */
export type ChaseDecision =
  | { kind: "land"; errorS: number; byCap: boolean }
  | { kind: "hold"; inStep: number }
  | { kind: "nudge"; rate: number }
  | { kind: "reseek"; toS: number };
export function decideChase(input: {
  errorS: number; inStep: number; rate: number; hiddenReseeks: number;
  mappedANowS: number; startLatencyS: number; elapsedMs: number; capMs: number; approximate: boolean;
}): ChaseDecision;

/** Equal-power gains for ramp step k of n (k = 0..n). */
export function rampGains(k: number, n: number): { from: number; to: number };

/** 7.1: whether a retry must re-sign (URL older than RESIGN_IF_OLDER_THAN_MS, or a 400/401/403 message). */
export function retryNeedsResign(signedAtMs: number, nowMs: number, errorMessage: string | null): boolean;
/** D7: an Android decoder failure (no retry, latch in_place). */
export function isDecoderError(os: string, errorMessage: string | null): boolean;

// ============================================================================
// apps/mobile/lib/match-detail/switch-lead-store.ts   (NEW, owner K1; in-memory module store)
// ============================================================================
export function leadFor(cls: NetworkClass): number;                  // seconds
export function startLatencyFor(cls: NetworkClass): number;          // seconds
export function recordSwitchTiming(cls: NetworkClass, sample: { readyMs: number; startLatencyMs: number | null }): void;
export function __resetSwitchLeadStoreForTests(): void;

// ============================================================================
// apps/mobile/lib/match-detail/use-video-playback.ts   (CHANGED, owner K1)
// ============================================================================
export type SwitchMode = "keep_watching" | "in_place";

export interface SwitchState {
  // ...all phase-1 fields unchanged (phase, seq, fromId, targetId, startedAt, approximate,
  //    restoring, heldFrame, landedAt, failed)...
  /** How this switch runs; null when idle before any switch. */
  mode: SwitchMode | null;
  /** keep_watching: the slot the outgoing angle plays in (top view during landing); null for in_place. */
  fromSlot: 0 | 1 | null;
  /** keep_watching: the slot the new angle loads in; null for in_place. */
  incomingSlot: 0 | 1 | null;
  /** keep_watching: the lead chosen at load (ms of wall time); null otherwise. */
  leadMs: number | null;
}
// IDLE_SWITCH_STATE gains: mode: null, fromSlot: null, incomingSlot: null, leadMs: null

export interface VideoPlayback {
  // ...all existing members unchanged; `player`, `onFirstFrameRender`, `frameShown`, `source`,
  //    `positionS`, `durationS` now describe the FRONT slot...
  /** CHANGED: opts.offsets added. A no-op while switchState.phase !== "idle" (the lock). */
  switchAngle: (
    nextId: string,
    atSeconds: number,
    opts?: { approximate?: boolean; offsets?: { fromMs: number | null; toMs: number | null } },
  ) => void;
  /** ADDED: both slot players, fixed for the screen's life. */
  players: readonly [VideoPlayer, VideoPlayer];
  /** ADDED: the slot on screen. */
  frontSlot: 0 | 1;
  /** ADDED: wire each slot's VideoView onFirstFrameRender to this. */
  onSlotFirstFrame: (slot: 0 | 1) => void;
}

// ============================================================================
// apps/mobile/lib/video/playback-telemetry.ts and use-playback-telemetry.ts   (CHANGED, owner K1)
// ============================================================================
export type SwitchMode = "swap" | "seek" | "dip" | "keep_watching";   // telemetry's own SwitchMode gains "keep_watching"

export interface PlaybackTelemetry {
  // ...existing members unchanged...
  /** A keep_watching switch landed: lead (ms), landed-late (media ms), |error| at LAND (ms), exact-synced? */
  switchKeepWatchingLanded: (s: { leadMs: number; landedLateMs: number; syncErrorMs: number; exact: boolean; afterRetry: boolean }) => void;
  /** A late-ready retarget or a hidden re-seek. */
  switchRetarget: () => void;
  /** A switch ran in_place for a fallback reason. */
  switchFallback: (reason: InPlaceReason) => void;
  /** A keep_watching switch was abandoned. */
  switchAbandoned: (reason: AbandonReason) => void;
  /** The one silent retry of an incoming load error (7.1). */
  switchLoadRetried: () => void;
  /** A chip tap ignored by the lock (called by the screen). */
  switchTapIgnored: () => void;
}
// PlaybackSessionSummary gains: switchKeepWatchingCount, switchLeadMs, switchLandedLateMs, switchSyncErrorP95Ms,
//   switchRetargetCount, switchFallbackCount, switchFallbackReasons (string[], first 4), switchAbandonedCount,
//   switchAbandonReasons (string[], first 4), switchIgnoredTapCount, switchLoadRetryCount, switchLoadRetryLandedCount.

// ============================================================================
// apps/mobile/components/film-room/angle-view-stack.tsx   (NEW, owner K2)
// ============================================================================
export interface AngleViewStackProps {
  players: readonly [VideoPlayer, VideoPlayer];
  frontSlot: 0 | 1;
  switchState: Pick<SwitchState, "phase" | "seq" | "mode" | "fromSlot" | "incomingSlot" | "approximate">;
  onSlotFirstFrame: (slot: 0 | 1) => void;
  posterUrl: string | null;
  frameShown: boolean;
  reduceMotion: boolean;
}
export function AngleViewStack(props: AngleViewStackProps): JSX.Element;

// ============================================================================
// apps/mobile/components/film-room/angle-switcher.tsx   (CHANGED, owner K2)
// ============================================================================
interface AngleSwitcherProps {
  // ...existing props unchanged (busyId keeps its phase-1 meaning: the busy + selected chip)...
  /** ADDED: the lock. While true every chip except busyId is disabled and dimmed (0.5), no haptic. Default false. */
  locked?: boolean;
  /** ADDED: called when a locked chip is tapped (wired to telemetry.switchTapIgnored). */
  onIgnoredTap?: () => void;
}
```

## 4. Audio

- During pending: A plays unmuted at `volume = 1`; B is `muted = true`. A muted player does not take Android audio focus (`AudioFocusManager`) and does not change the iOS session.
- Exact-synced landing, `AUDIO_RAMP = true`: at the landing set `B.volume = 0`, `B.muted = false`, then over `CROSSFADE_MS` in `AUDIO_RAMP_STEPS` steps (JS timers, not UI animation) set equal-power gains: step k of n, `x = k/n`, `A.volume = cos(x * pi/2)`, `B.volume = sin(x * pi/2)`. At the end `A.muted = true`, `A.volume = 1` (A is released 60 ms later at settle).
- `AUDIO_RAMP = false` (kill switch if ramps are uneven on a device): cut at `CROSSFADE_MS / 2`: `A.muted = true`, `B.muted = false`, `B.volume = 1`.
- Approximate angle or not-covered landing: cut at the bottom of the dip (`DIP_MS`), same as the ramp-off cut.
- Reduce Motion changes the picture only; the audio ramp stays.
- No haptic on landing (owner, 2026-10-06). The only switch haptic is `haptics.select` on the accepted tap.

## 5. `switchState` semantics (changes to contract 06 section 3)

### 5.1 Type changes (K1, `use-video-playback.ts`)

```ts
export type SwitchMode = "keep_watching" | "in_place";

export interface SwitchState {
  // ...every phase-1 field unchanged...
  /** How this switch runs. Null when idle before any switch. */
  mode: SwitchMode | null;
  /** keep_watching: the slot the outgoing angle plays in (the top view during landing). Null for in_place. */
  fromSlot: 0 | 1 | null;
  /** keep_watching: the slot the new angle loads in. Null for in_place. */
  incomingSlot: 0 | 1 | null;
  /** keep_watching: the lead chosen at load (ms of wall time). Null otherwise. */
  leadMs: number | null;
}
```
`IDLE_SWITCH_STATE` gains `mode: null, fromSlot: null, incomingSlot: null, leadMs: null`.

### 5.2 Semantics in keep_watching mode

- `pending`: from the tap until the landing. A keeps playing with its audio; `activeId` stays the FROM angle (D1); `positionS`, `durationS`, `currentTimeNow`, `frameShown`, `player` all describe A.
- `heldFrame` is NOT used (always null): A is live on screen. (The paused case does not need it either: A's paused view stays on screen.)
- `landedAt`: the moment the crossfade starts (the engine's LAND decision). `switchLatencyMs` = tap to `landedAt`.
- At LAND, in one state update: `phase = "landing"`, `landedAt`, `activeId = targetId`, `frontSlot = incomingSlot`, `positionS` and `durationS` from B, `quality.angleChanged(served, available)`, `telemetry.switchLanded()`.
- `landing` lasts `SWITCH_SETTLE_MS` (300); then `idle`, the old slot is released, `fromSlot` and `incomingSlot` clear, both players back to `timeUpdateEventInterval = 0.25`.
- `restoring` is never true in keep_watching (A never stopped; a failure just ends the switch, section 7).
- `approximate` (clock-only or unsynced angle): the same flow; the UI uses the 80 ms dip instead of the crossfade; the sync check in 3.3 step 4 is skipped (land when B has started at t0, i.e. the first advancing `timeUpdate` at or after t0 minus one frame), because the offset itself is uncertain.

### 5.3 Semantics in in_place mode

Exactly phase 1 (contract 06), unchanged: held still, `activeId` moves at the tap, chrome snapshot, restore on failure. `mode = "in_place"`, slots null.

### 5.4 API changes on `VideoPlayback` (K1)

```ts
// CHANGED: opts gains the two angles' sync offsets (from get_match_details sync_offset_ms).
// Without `offsets` the switch runs in_place (the engine cannot map times continuously).
switchAngle: (nextId: string, atSeconds: number, opts?: { approximate?: boolean; offsets?: { fromMs: number | null; toMs: number | null } }) => void;
// ADDED
players: readonly [VideoPlayer, VideoPlayer];
frontSlot: 0 | 1;
/** Wire each slot's VideoView onFirstFrameRender to this (front slot: same as onFirstFrameRender). */
onSlotFirstFrame: (slot: 0 | 1) => void;
// UNCHANGED, now meaning the FRONT slot's player: player, onFirstFrameRender, frameShown, source, positionS, durationS
```
`atSeconds` stays the target time at the tap (used by in_place, and as `map(A.now)` sanity); keep_watching computes its own `t0`.

## 6. Adaptive quality

- B signs at `quality.currentTarget()`; the served file's rendition and availability are recorded at LAND (`quality.angleChanged`).
- While any switch is not `idle`, the controller sees `swapInFlight = true` (add `switchStateRef.current.phase !== "idle"` to `readConditions`), so no quality decision is applied mid-switch.
- A tap while a quality swap is in flight (A reloading in place) runs `in_place` (phase-1 path), as today.
- Stalls: the session's stall feed comes from telemetry bound to the FRONT player, so B's hidden startup never counts as a stall; after LAND, B's stalls count.
- `INCOMING_FORWARD_BUFFER_S` is restored on B at LAND to the default (`bufferOptions` with `preferredForwardBufferDuration` 0 on iOS = automatic, 20 on Android).

## 7. Abandon (the lock always releases)

A keep_watching switch that does not land is ABANDONED. One function, `abandonSwitch(reason)`, does all of it:
1. tear down the incoming player: cancel scheduled play and ramp timers, `pause()`, `muted = true`, `volume = 1`, `playbackRate = 1`, `replaceAsync(null)`;
2. A is untouched (it never stopped; `activeId` never moved);
3. both players back to `timeUpdateEventInterval = 0.25`;
4. `switchState` to `idle` (keeping `seq`), which unlocks the chips;
5. for a FAILURE reason only: `failed = { seq, targetId, at }` and `telemetry.switchFailed()`; the screen shows the phase-1 tag `Could not load {label}. Tap it to try again.` and announces it once;
6. `telemetry.switchAbandoned(reason)`.

| Reason | Trigger | Failure tag |
|---|---|---|
| `sign_failed` | the target's sign returns anything but ready, or throws | yes |
| `load_error` | B's `replaceAsync` rejects, or B reports `status: "error"`, before LAND, AFTER the one silent retry (7.1) | yes |
| `timeout` | no LAND within `ABANDON_TIMEOUT_MS[class]` of the tap | yes |
| `background` | app to background while pending | no |
| `navigation` | outside navigation while pending | no |
| `unmount` | screen unmount while pending | no (no state updates) |
| `front_error` | A errors while pending (then today's silent re-sign path for A) | no |
| `decoder_error` | an Android decoder load error of B (no retry, D7) | yes |

Android decoder errors: a load error whose message matches `/codec|decoder|MediaCodec/i` is NOT retried (D7): the switch abandons at once with reason `decoder_error` (failure tag shown) and sets `keepWatchingUnsupported = true` for the app run, so later switches run in_place (counted in `switchFallbackCount`).

### 7.1 The one silent retry (owner, 2026-10-06)

On the FIRST load error of the incoming angle (B's `replaceAsync` rejects, or B reports `status: "error"`, before LAND), when it is not a decoder error and the abandon deadline has not passed:
1. `loadRetries += 1` (max `LOAD_RETRY_MAX` = 1 per switch), `telemetry.switchLoadRetried()`. No UI change: A keeps playing, the pill stays, the chips stay locked, no tag.
2. Re-sign the target at `quality.currentTarget()` when its cached URL was signed more than `RESIGN_IF_OLDER_THAN_MS` ago or the error looks like an auth or expiry failure (HTTP 400, 401 or 403 in the message); otherwise reuse the cached URL. A sign failure here abandons with `sign_failed`.
3. Replace B's item (`replaceAsync` with the URL; a new B generation, so a late event of the failed item is ignored), muted, same rate, same forward buffer.
4. Same target logic: recompute `t0` from A's position NOW (3.3 step 1 when playing, 3.4 when paused) with the current lead; `retargets` and `hiddenReseeks` keep their counts. Continue at 3.3 step 2.
5. The abandon deadline is NOT reset: it stays `ABANDON_TIMEOUT_MS[class]` from the tap, so the lock still always releases in time.
6. A second load error in the same switch abandons with `load_error`. If the retry lands, telemetry records it as a retried landing (`switchLoadRetryLandedCount`).

No restore is ever needed in keep_watching; `restoring` stays false.

## 8. Telemetry (K1)

One `Video playback session` event per viewing session, unchanged otherwise.
- **Rebind:** `usePlaybackTelemetry(frontPlayer, ...)`; its player-listener effect already re-subscribes when the player changes. On re-subscribe it must also resync the session's playing state from the new player (`session.playing(player.playing, now)`), so the role swap is not seen as a pause or a stall. The incoming player is never observed while hidden.
- `SwitchMode` (in `lib/video/playback-telemetry.ts`) gains `"keep_watching"`. The single player now calls `switchStarted("keep_watching")` or `switchStarted("seek")` (in_place).
- New session fields:

| Field | Meaning |
|---|---|
| `switchKeepWatchingCount` | started keep-watching switches (via the mode counts) |
| `switchLeadMs` | median chosen lead (ms) over keep-watching switches; null with none |
| `switchLandedLateMs` | median over landed keep-watching switches of (B's time at LAND minus `map(A time at the tap)`), in ms of media time: how far past the tap moment the switch landed |
| `switchSyncErrorP95Ms` | p95 of the absolute error at LAND (exact-synced keep-watching switches only) |
| `switchRetargetCount` | late-ready retargets plus hidden re-seeks, summed |
| `switchFallbackCount` | switches that ran in_place for a reason other than the paused-or-in-place default (warm-only, decoder error, kill switch, missing offsets, quality swap in flight); reason string list in `switchFallbackReasons` (first 4) |
| `switchAbandonedCount` | keep-watching switches abandoned (section 7); reasons in `switchAbandonReasons` (first 4) |
| `switchIgnoredTapCount` | chip taps ignored by the lock (UI reports via `telemetry.switchTapIgnored()`) |
| `switchLoadRetryCount` | silent retries of an incoming load error (7.1) |
| `switchLoadRetryLandedCount` | switches that landed after a silent retry (so `switchLoadRetryCount - switchLoadRetryLandedCount` = retries that still ended in an abandon, together with `switchAbandonReasons`) |

`switchSupersededCount` stays in the event but is never incremented by keep_watching (the lock makes supersede impossible).

`switchLatencyMs` is tap to landing in both modes (unchanged definition from phase 1, landing now = crossfade start in keep_watching).

## 9. When keep_watching is NOT used (in_place = shipped phase 1)

Run `in_place` when any of these holds at the tap:
1. `KEEP_WATCHING_ENABLED` is false, or `keepWatchingUnsupported` (7);
2. `deviceTier(readDeviceInfo()).tier === "warm-only"` (`lib/video/multi-angle/device-tier.ts`, reused read-only);
3. the caller passed no `offsets`;
4. A is not loaded with a frame on screen (first load, re-sign, or a quality swap in flight);
5. the playback phase is not `ready`.

## 10. Data

No video bytes for B before the tap (owner: no preload on cellular). Per keep-watching switch, B downloads its moov (about 0.1 MB), one GOP at t0 and up to `INCOMING_FORWARD_BUFFER_S` (5 s) before LAND:

| | 720p copy (2 Mbps cap) | 360p copy (550 kbps cap) |
|---|---|---|
| B startup (moov + GOP + 5 s) | about 1.6 MB | about 0.5 MB |
| Each retarget or hidden re-seek | about 0.3 MB | about 0.1 MB |
| Extra over phase 1 | about 0 to 0.5 MB (re-seeks; A's own buffer was discarded in phase 1 too) | about 0 to 0.2 MB |

At LTE speeds the overlap download is about 1 to 2 s of the link, during which A plays from its own buffer (A rarely needs network for the next 2 s).

## 11. File ownership (exactly one slice edits each file)

| File | Owner |
|---|---|
| `lib/match-detail/use-video-playback.ts` | K1 |
| `lib/match-detail/keep-watching.ts` (new: constants, pure planner: lead, t0, wait, late decision, in-step check, cap) | K1 |
| `lib/match-detail/switch-lead-store.ts` (new) | K1 |
| `lib/video/playback-telemetry.ts`, `lib/video/use-playback-telemetry.ts` | K1 |
| `__tests__/support/fake-expo-video.ts` | **K1** (K2 consumes only) |
| `__tests__/lib/match-detail/use-video-playback.test.tsx`, new `__tests__/lib/match-detail/keep-watching.test.ts`, `switch-lead-store.test.ts`, telemetry tests | K1 |
| `app/(app)/video/[id].tsx` | **K2** |
| `components/film-room/angle-view-stack.tsx` (new: the two VideoViews, poster, z-order, crossfade of the top view, dip layer) | K2 |
| `components/film-room/switch-overlay.tsx` (in_place only; may reuse its dip layer) | K2 |
| `components/film-room/angle-switcher.tsx` (the lock: `locked`, busy + selected chip, disabled dimmed chips, `onIgnoredTap`) | K2 |
| `components/film-room/syncing-pill.tsx` (no change expected) | K2 |
| `lib/video/video-status-copy.ts`, `DESIGN.md` (registry row "Angle crossfade" now fades the live outgoing view; add "Audio crossfade" note) | K2 |
| `__tests__/screens/video-playback.test.tsx` (its own inline expo-video mock must create two players), component tests | K2 |

Read-only reuse (no edits): `lib/video/multi-angle/sync-controller.ts`, `lib/video/multi-angle/device-tier.ts`, `lib/video/quality/network-store.ts`, `packages/shared/src/utils/key-moments.ts`. Nothing under `components/film-room/multi-angle/` changes.

Merge order: K1 first, then K2 rebases. K2 builds against section 5 types from day one.

### 11.1 K2 UI contract

- `AngleViewStack` props:
  ```ts
  export interface AngleViewStackProps {
    players: readonly [VideoPlayer, VideoPlayer];
    frontSlot: 0 | 1;
    switchState: Pick<SwitchState, "phase" | "seq" | "mode" | "fromSlot" | "incomingSlot" | "approximate">;
    onSlotFirstFrame: (slot: 0 | 1) => void;
    posterUrl: string | null;
    frameShown: boolean;
    reduceMotion: boolean;
  }
  ```
  Top view per 2.2. At `landing` with `mode === "keep_watching"`: exact: top view opacity 1 to 0 over `duration.fast` on `easing.brandOut` (Reanimated, UI thread); approximate: black layer 0 to 1 over `moment.angleDip`, top view opacity set to 0 at the bottom, black 1 to 0 over `moment.angleDip`; Reduce Motion: top view opacity 0 at once (a cut). Back to the rule at `idle`. `in_place` mode: one visible view (the front), `SwitchOverlay` handles the still as in phase 1.
- `AngleSwitcher` (the LOCK, owner decision): new prop `locked: boolean` = `switchState.phase !== "idle"`; `busyId` = `switchState.phase === "pending" ? switchState.targetId : null` (for an in_place restore, the angle being restored).
  - While `locked`: every segment except `busyId` is `disabled` (no `onPress`, no haptic, no press scale), `accessibilityState={{ disabled: true, selected: false }}`, dimmed with `opacity-disabled` 0.5 (`DISABLED_OPACITY`). A tap on a disabled segment calls the optional `onIgnoredTap()` (wired to `telemetry.switchTapIgnored()`), nothing else.
  - The `busyId` segment renders the pressed/busy treatment: the selected surface (`ON_MEDIA.text` fill, `ON_MEDIA.ink` label, as today's selected segment) with `accessibilityState={{ selected: true, busy: true }}`; tapping it does nothing (no haptic).
  - During `landing` (`busyId` null, still `locked`): the new `activeId` segment shows selected (not dimmed) and the rest stay disabled until `idle` (D4).
  - Unlocked (`idle`): today's behavior (press scale, `haptics.select` on a new angle). No haptic at the landing or at an abandon (owner).
  - The plate variant on match detail never passes `locked` (default false).
- Chrome: in keep_watching the chrome renders LIVE from `activeId` (it is A until LAND, then B; no snapshot). The phase-1 chrome snapshot applies only when `switchState.mode === "in_place"`.
- Route params: in keep_watching, call `router.setParams({ id, t, approx })` at LAND (when `activeId` changes), not at the tap; in_place keeps the tap behavior.
- `SyncingPill`: unchanged (shows after 200 ms of `pending`, the athlete keeps watching A under it, hides at LAND).
- Announcements, failure tag, approximate note: unchanged (at LAND; failure from `failed`).
- `onSelect` passes `offsets: { fromMs: from?.sync_offset_ms ?? null, toMs: to?.sync_offset_ms ?? null }`.

## 12. How jits-xfvd.3 (multi-angle player, phase 2) reuses this

- Phase 2's owner policy: Wi-Fi one hot standby; cellular 4G/5G on demand; 3G and Data saver none. "On demand" IS this keep-watching flow: load the target in a free player after the tap, chase it into step hidden, crossfade with the audio ramp. A hot standby is the same machinery with the incoming already in step (land on the next sample).
- `keep-watching.ts` (pure planner) and `switch-lead-store.ts` must not import anything from `use-video-playback.ts`; phase 2 imports them directly. `AngleViewStack`'s z-order, crossfade and dip rules are the same rules the multi-angle `AngleStack` adopts.
- Telemetry fields (section 8) are shared, so phase-2 numbers compare directly.

## 13. Acceptance criteria (bead jits-xfvd.19)

On an iPhone 12 or newer and a Pixel 6a-class Android, Wi-Fi and LTE-conditioned (Network Link Conditioner "LTE" or equivalent), 20 switches per cell, playing:
1. **No frozen frame over 100 ms** on screen from tap to settle (240 fps capture: no run of identical frames longer than 100 ms while playing), and no black or wrong-moment frame.
2. **Audio continuous:** no silence over 50 ms across a switch (audio capture of the device output).
3. **Tap to crossfade p50 <= 1.5 s on Wi-Fi, <= 3 s on LTE** (telemetry `switchLatencyMs`).
4. **Sync at crossfade within 2 frames** for exact-synced angles: `switchSyncErrorP95Ms <= 67` on Wi-Fi; on LTE at most 10% of switches land by cap.
5. Paused: the switch lands paused on the exact moment; Wi-Fi p50 tap to crossfade <= 600 ms.
6. Key-moment chips, caption and seek bar flip at the crossfade, not at the tap; the tapped segment shows the busy treatment from the tap; the pill shows after 200 ms.
7. Slow motion (0.25x, 0.5x) and 2x: lands in step at the session rate.
8. Seek, skip, pause and play during a pending switch: no stall, lands at the new moment.
9. LOCK: from the tap until `idle`, taps on any chip do nothing (no haptic, no state change, engine rejects a direct `switchAngle`); the tapped chip reads busy + selected to VoiceOver and TalkBack, the others disabled and dimmed to 0.5.
10. ABANDON always unlocks: sign failure, load error and the hard timeout (8 s Wi-Fi, 12 s cellular, measured with a blackholed target URL) each leave A playing uninterrupted, show `Could not load {label}. Tap it to try again.` once with one announcement, and unlock; a single injected load error is retried silently and the switch still lands (no tag); two load errors abandon; the retry never extends the abandon deadline; background, outside navigation and unmount abandon silently. An Android decoder error latches later switches to in_place.
11. Warm-only Android tier: every switch runs in_place (phase 1), counted in `switchFallbackCount`.
12. No bytes for the other angle before the tap (proxy capture), and never more than 2 decoders (Android).
13. Telemetry: one session event per viewing; new fields present; existing fields unchanged.
14. Full gate green (`npm run typecheck`, `npm run test`), independent review clean, OTA shipped, `/canvas-sync` of board 33 (the switcher's lock look changes it).

## 14. Test list (minimum)

Owner-answer tests (2026-10-06) are marked [retry], [cap] and [no-haptic].


K1 (`fake-expo-video.ts` gains: two independent players per hook (`useVideoPlayer` returns a distinct fake per call), recorded `muted`, `volume`, `playbackRate`, `bufferOptions`, `replaceAsync(null)` releases, per-player controllable `timeUpdate` / `statusChange` / `playingChange` / settle order, fake clock):
- planner (pure): lead from EWMA and clamps per network class; t0 with rate and offsets; wait and late decision; retarget bound; in-step after 2 samples; cap landing; not-covered edges;
- engine: A never paused or muted before LAND; B muted until LAND; equal-power ramp values and the ramp-off cut; role swap and release at settle; `activeId` moves at LAND; quality decisions blocked while pending; telemetry rebinds with playing resync, no stall at the swap;
- paused mode lands on the post-seek frame and on the 350 ms fallback;
- pause, play, rate change, user seek, A end during pending;
- lock: `switchAngle` while pending or landing is a no-op (both modes); no supersede path exists in keep_watching (no supersede tests for it);
- [retry] first load error: one retry, no tag, chips still locked, `switchLoadRetried` once; re-sign only when the URL is older than 30 min or the error says 400/401/403, else the cached URL is reused; t0 recomputed from A's position at the retry; a late event of the failed generation ignored; retry then landing counts `switchLoadRetryLandedCount`; second load error abandons with `load_error`; a retry sign failure abandons with `sign_failed`; deadline unchanged by the retry (fake clock: error at 7.5 s on fast still abandons at 8 s); decoder-message error skips the retry (`decoder_error`, latch set);
- [cap] at `KEEP_WATCHING_CAP_MS` with B advancing and |e| > 2 frames: lands with the leftover offset, `switchSyncErrorP95Ms` reflects it;
- abandon for every reason in section 7: incoming torn down (`replaceAsync(null)`, muted), A untouched, state idle, `failed` and `switchFailed` only for failure reasons, `switchAbandoned(reason)` always; the timeout per network class (fake clock); Android decoder message sets the unsupported latch;
- every in_place trigger in section 9.

K2:
- `AngleViewStack`: z-order by phase, crossfade vs dip vs cut, opacity reset at idle, poster on front only, `onSlotFirstFrame` per slot, Android textureView on both;
- [no-haptic] no haptic at landing or abandon (haptics mock: exactly one `select` per accepted tap);
- `AngleSwitcher`: lock states (busy + selected on the tapped chip; others disabled, dimmed 0.5, no haptic, `onIgnoredTap` called); landing state; unlocked behavior unchanged; plate variant unaffected;
- screen: the failure tag after an abandon for a failure reason, none for background or navigation;
- screen: live chrome in keep_watching (no snapshot), snapshot only in in_place; `setParams` at LAND; offsets passed; announcements and failure tag unchanged.

## 15. OTA safety

All JS against APIs linked in build 25 (runtime 0.5.0): a second `useVideoPlayer`, `VideoView` `surfaceType` at mount, `muted`, `volume`, `playbackRate`, `currentTime`, `replaceAsync` (including `null`), `bufferOptions`, `timeUpdateEventInterval`, `generateThumbnailsAsync` (in_place only), `expo-device` (tier), Reanimated, expo-haptics. No native dependency, no `app.json` change: OTA-eligible. Rollback: `KEEP_WATCHING_ENABLED = false` in a follow-up OTA restores phase-1 behavior exactly.

## 16. Out of scope

Any preload (phase 2 policy), the multi-angle player itself, server-side kill switch (D3), moving the switcher, a match-timeline clock, Low Power Mode.

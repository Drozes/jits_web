# Angle switch phase 1 (single player): interface contract for the two parallel slices

Date: 2026-10-06. Author: PM agent (no product code). Beads: phase 0 baseline jits-xfvd.14, design jits-xfvd.15, this work jits-xfvd.16, standby settings (phase 2) jits-xfvd.17. Status: APPROVED SCOPE, owner decisions recorded below. Bead: jits-xfvd.16 (phase 1 single-player polish, OTA). This file is the single source of truth for implementer slices B1 (engine) and B2 (UI) and for the independent reviewer. Where this file and the bead disagree, this file wins; raise the conflict instead of guessing. This file is untracked; implementers copy it into their branch under the same path.

All paths are under `apps/mobile/` unless stated. Line references are to `origin/main` 335a2335 (production OTA aaa9bb67).

## 0. Owner decisions (2026-10-06, authoritative)

1. Copy approved: `Syncing angle` while switching to an exact-synced angle, `Switching angle` while switching to an approximate (clock-only or unsynced) angle. These replace the unpublished "Switching to {label}" note (the multi-angle player's `MULTI_ANGLE_COPY.switchingTo` is retired in phase 2, not here).
2. Preload: phase 1 preloads no video bytes (pre-sign only, as shipped). Phase 2 policy: Wi-Fi one hot standby; cellular 4G/5G on demand (no preload); 3G/2G/unknown and Data saver none.
3. Phase 1 ships now as its own OTA (JS only, runtime 0.5.0, build 25).
4. Design goes on a new canvas page "Proposed (Oct 6 angle switch)"; the stray "Page 4" is left alone.

## 1. Why (one paragraph)

The shipped switch (`lib/match-detail/use-video-playback.ts` `swapSource`, lines 777 to 832) pauses, swaps the URL with `replaceAsync`, waits for `readyToPlay` (which needs a buffer at t=0, because no seek is queued), and only then seeks exactly to the target (`markLoaded`, line 517). `holdFrame` only suppresses the poster; no image of the outgoing frame is drawn. On screen: a frozen frame and silence, likely black on iOS, then frame 0 of the other angle, then the target. Phase 1 seeks at swap settle, plays at settle, draws a real held still and crossfades it out on a precise landing, and tells the athlete a switch is in progress (pressed and busy segment, selection haptic, Syncing pill).

## 2. File ownership (exactly one slice edits each file)

| File | Owner |
|---|---|
| `lib/match-detail/use-video-playback.ts` | B1 |
| `lib/video/playback-telemetry.ts` | B1 |
| `lib/video/use-playback-telemetry.ts` | B1 |
| `__tests__/lib/match-detail/use-video-playback.test.tsx` | B1 |
| `__tests__/lib/video/playback-telemetry.test.ts` | B1 |
| `__tests__/lib/video/use-playback-telemetry.test.tsx` | B1 |
| `__tests__/support/fake-expo-video.ts` | **B1** (B2 may only consume it; if B2 needs a new fake capability it asks B1) |
| `app/(app)/video/[id].tsx` | **B2** |
| `components/film-room/angle-switcher.tsx` | B2 |
| `components/film-room/switch-overlay.tsx` (new) | B2 |
| `components/film-room/syncing-pill.tsx` (new) | B2 |
| `lib/film-room/use-angle-analyses.ts` (new) | B2 |
| `lib/video/video-status-copy.ts` | B2 |
| `lib/motion/tokens.ts` (add `moment.angleDip` = 80) | B2 |
| `DESIGN.md` (Motion registry rows, section 6) | B2 |
| `__tests__/screens/video-playback.test.tsx` (has its own inline `expo-video` mock, line 64) | B2 |
| `__tests__/components/film-room/*` new tests, `angle-switcher-best.test.tsx` | B2 |
| `__tests__/lib/film-room/use-angle-analyses.test.tsx` (new) | B2 |

Not touched in phase 1: anything under `lib/video/multi-angle/` and `components/film-room/multi-angle/` (phase 2, jits-xfvd.3), `lib/video/quality/*`, `packages/shared/*`.

Merge order: B1 first (it defines the types), then B2 rebases onto it. B2 builds its components against the types below from day one (they are pure props), and its screen test goes green once B1 is merged.

## 3. B1: the hook contract (`useVideoPlayback`)

### 3.1 New exports from `lib/match-detail/use-video-playback.ts`

```ts
import type { VideoThumbnail } from "expo-video";

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
  /** True while returning to fromId after a failed switch (section 3.5). */
  restoring: boolean;
  /** Native still of the outgoing frame, or null (section 3.3). */
  heldFrame: VideoThumbnail | null;
  /** Date.now() when this switch landed (section 3.4). Null until then. */
  landedAt: number | null;
  /** The most recent failed switch, until the next switchAngle call or an outside navigation. */
  failed: SwitchFailure | null;
}

/** A switch lands when the new item's time is within this of the resume target. */
export const LAND_TOLERANCE_S = 0.25;
/** timeUpdateEventInterval while a switch is pending (restored to 0.25 at idle). */
export const SWITCH_TIME_UPDATE_S = 0.1;
/** Longest wait for the held still before replaceAsync is issued anyway. */
export const HELD_FRAME_CAP_MS = 150;
/** A pending switch drops its held still after this long (the pill stays). */
export const SWITCH_HOLD_CAP_MS = 4000;
/** "landing" lasts this long, then the state returns to "idle" and heldFrame clears. Must be >= the longest UI transition (crossfade 240, dip 80 + 80). */
export const SWITCH_SETTLE_MS = 300;
/** Paused, no frame event after the post-seek readyToPlay: land after this. */
export const PAUSED_LAND_FALLBACK_MS = 350;
```

### 3.2 Changed and added members of `VideoPlayback`

```ts
// CHANGED: optional third argument; existing two-argument calls keep working (approximate defaults to false).
switchAngle: (nextId: string, atSeconds: number, opts?: { approximate?: boolean }) => void;
// ADDED
switchState: SwitchState;
```

Everything else on `VideoPlayback` keeps its meaning. `frameShown` keeps today's semantics (poster suppression). `positionS` during a pending switch keeps today's behavior (it moves to the target's `atSeconds` at once); B2 freezes the displayed chrome itself (section 4.5), B1 does not.

### 3.3 Phase transitions and the held still

Initial state: `{ phase: "idle", seq: 0, fromId: null, targetId: null, startedAt: null, approximate: false, restoring: false, heldFrame: null, landedAt: null, failed: null }`.

**idle or landing to pending (accepted `switchAngle(nextId, at, opts)`):** ignored, exactly as today, when `nextId` is falsy or equals the current `activeId`. Otherwise:
- `seq += 1`, `fromId = activeId before the call`, `targetId = nextId`, `startedAt = Date.now()`, `approximate = opts?.approximate === true`, `restoring = false`, `landedAt = null`, `failed = null`.
- `player.timeUpdateEventInterval = SWITCH_TIME_UPDATE_S`.
- Held still: if a frame of the current generation is on screen (`frameGenRef.current === sourceRef.current.generation`) and the player is loaded, call `player.generateThumbnailsAsync([currentTimeNow()])` BEFORE `player.pause()` and before `replaceAsync`. `replaceAsync` is issued when the thumbnail resolves or after `HELD_FRAME_CAP_MS`, whichever is first (the sign round trip on a pre-sign miss runs in parallel; the replace waits for both). If the thumbnail resolves before `replaceAsync` is issued and the switch is still this `seq` and `pending`, set `heldFrame`. **A thumbnail that resolves after `replaceAsync` was issued is discarded** (the player may already describe the new asset). A rejected thumbnail leaves `heldFrame` null; the switch proceeds.
- If no frame is on screen (first load still running), no still is captured and the poster rules apply as today.
- Telemetry: `switchStarted()` as today (or `switchSuperseded()` first, see 3.6).

**pending to landing (landed):** a switch lands when ALL of:
1. the generation loaded by this switch is the player's current generation (`switchGenRef`),
2. its resume seek has been issued (section 3.7), and
3. either (playing) a `timeUpdate` reports `Math.abs(currentTime - at) <= LAND_TOLERANCE_S`, or (paused) `onFirstFrameRender` fires after the seek was issued, or (paused, fallback) `PAUSED_LAND_FALLBACK_MS` passed since the post-seek `readyToPlay` with no frame event.
A switch with `at <= 0` needs no seek: it lands on the first frame of its generation.

On landing: `phase = "landing"`, `landedAt = Date.now()`, `telemetry.switchLanded()` (not for a restore, see 3.5), `telemetry.switchHeldStill()` once if `heldFrame` was non-null at landing, `quality.angleChanged(...)` as today. `heldFrame` is NOT cleared at landing: the overlay fades it out over the landed video.

The existing `SEEK_LANDED_S = 1.5` hold for ordinary seeks stays as it is; only the switch landing uses `LAND_TOLERANCE_S`.

**landing to idle:** `SWITCH_SETTLE_MS` after `landedAt`: `phase = "idle"`, `heldFrame = null`, `player.timeUpdateEventInterval = 0.25`. `seq`, `fromId`, `targetId`, `startedAt`, `approximate`, `landedAt` keep their last values (B2 may read them); `restoring = false`.

**Cap:** if a switch is still `pending` `SWITCH_HOLD_CAP_MS` after `startedAt`, set `heldFrame = null` (the still drops at once, no fade). The phase stays `pending` until it lands or fails.

### 3.4 What "landed" means for telemetry

`switchLatencyMs` (median per session) and `switchLatencyMaxMs` keep their names; their definition becomes tap (`switchStarted`) to landing as defined in 3.3 (within 0.25 s of the target, or the post-seek paused frame). Update the doc comment in `playback-telemetry.ts`.

### 3.5 Failure and restore

A pending angle switch (not a restore) FAILS when any of these happens before it lands:
- its sign returns anything but ready (`failed`, `missing`, `absent`, `processing`, or a thrown error),
- its `replaceAsync` rejects,
- the player reports `status: "error"` for its generation (no silent re-sign for a pending switch).

On failure:
- `failed = { seq, targetId, at: Date.now() }`, `telemetry.switchFailed()`.
- Restore: `activeId` returns to `fromId`; the hook swaps `fromId`'s signed source back in (cached in `signedRef`; sign it if missing) at `fromId`'s own time for the moment the switch started (the position on `fromId` captured at the tap, carried in fractional seconds), keeping play intent and rate. This mirrors `restoreAfterQualityFailure`.
- `switchState` during the restore: `phase = "pending"`, `restoring = true`, `targetId = fromId`, `fromId = the failed target`, `approximate = false`, `heldFrame` kept (it is still the last real picture of `fromId`), `seq` unchanged, `startedAt` unchanged.
- The restore lands by the same rule (3.3), then `landing`, then `idle`. A restore landing does NOT call `switchLanded()` and is not counted in switch latency.
- If the restore itself fails, behavior is today's: `phase` (the PlaybackPhase) becomes `"failed"` and the retry panel shows; `switchState` returns to `idle` with `failed` kept.
- The screen calls `router.setParams` for the target at the tap (today's behavior). On a restore B1 does not touch the route; B2 resets the route params to `fromId` when it sees `restoring` become true (section 4.6). The `ownIdsRef` set already treats both ids as our own echoes, so the route change is never an outside navigation.

### 3.6 Supersede

A `switchAngle` call while a switch is `pending` (including a restore) or `landing`:
- If the previous switch had not landed: `telemetry.switchSuperseded()`, then `switchStarted()` for the new one. Its `heldFrame` is REUSED (not recaptured: the player may already hold the superseded target's frame 0). `fromId` = the superseded switch's `targetId` (the current `activeId`).
- If the previous switch is `landing`: the landed frame is correct, so a NEW still is captured as in 3.3 and the old one is replaced.
- Superseded swaps keep today's generation guard (`swapRef` seq, `epochRef`): a late settle of a superseded item never lands the new switch.
- A quality swap in flight is dropped by an angle switch (today's `dropQualitySwap`). A quality decision while a switch is pending is not applied (the quality controller already sees `swapInFlight`).

### 3.7 Seek and play at swap settle (the mechanical fix)

For the generation loaded by an angle switch or a restore:
- In `replace`'s `settle(true)` (the `replaceAsync` resolution), when `resumeAtRef.current` is set: set `seekIssuedGenRef = generation`, `holdRef = { at, left: SEEK_HOLD_MAX_UPDATES }`, `telemetry.expectWait()`, `player.currentTime = at`; then, if the play intent is on, `startPlayback()` (rate then `play()`).
- `markLoaded` on `readyToPlay` for that generation must NOT issue the seek again, unless the player's time is more than `LAND_TOLERANCE_S` from `at` (a fallback re-seek, counted nowhere).
- iOS: a `currentTime` set while the replace is still in flight is stored by expo-video and applied right after `replaceCurrentItem` (`DangerousPropertiesStore`); set after it, it seeks the new item. Both are correct. Android: `replaceAsync` resolves right after `setMediaSource` and `prepare`, where `seekTo` is valid.
- `AUTOPLAY_FALLBACK_MS` stays as a backstop.
- First loads, silent re-signs and quality swaps keep today's ready-then-seek path in phase 1 (not in scope; a follow-up may adopt it).

### 3.8 Outside navigation and unmount

An outside navigation (the existing effect at lines 409 to 432) resets `switchState` to the initial state (keeping `seq`) and restores `timeUpdateEventInterval = 0.25`. Unmount clears all switch timers.

## 4. B2: UI contracts

### 4.1 `SwitchOverlay` (`components/film-room/switch-overlay.tsx`, new)

```ts
export interface SwitchOverlayProps {
  switchState: Pick<SwitchState, "phase" | "seq" | "heldFrame" | "approximate" | "restoring">;
  /** From useReduceMotion() at the screen (prop for testability). */
  reduceMotion: boolean;
  testID?: string; // default "switch-overlay"
}
```
Behavior (render it between the `VideoView` and the scrims, `StyleSheet.absoluteFill`, `pointerEvents="none"`, accessibility hidden):
- `heldFrame` null: render nothing (also when the cap clears it mid-switch: remove at once, no fade).
- `pending` with `heldFrame`: an `expo-image` of `heldFrame`, `contentFit="contain"`, opacity 1. Key the animated node on `seq`.
- `landing`, exact (`approximate === false`, or `restoring`): opacity 1 to 0 over `duration.fast` (240 ms) on `easing.brandOut`, Reanimated, UI thread.
- `landing`, approximate: the reel-contract dip. An `ON_MEDIA.black` layer fades 0 to 1 over `moment.angleDip` (80 ms), the still is removed, the black fades 1 to 0 over 80 ms. Total 160 ms.
- `reduceMotion`: no animation; at `landing` the still is removed at once (a cut).
- Every transition finishes within `SWITCH_SETTLE_MS` (300 ms). At `idle` it renders nothing.

### 4.2 `SyncingPill` (`components/film-room/syncing-pill.tsx`, new)

```ts
export interface SyncingPillProps {
  switchState: Pick<SwitchState, "phase" | "seq" | "startedAt" | "approximate" | "restoring">;
  reduceMotion: boolean;
  /** Called once per seq when the pill becomes visible (B2 wires it to playback.telemetry.switchPillShown). */
  onShown?: () => void;
  testID?: string; // default "syncing-pill"
}
export const SYNCING_PILL_DELAY_MS = 200;
export const SYNCING_PILL_MIN_MS = 400;
```
Behavior:
- Eligible while `phase === "pending" && !restoring`. It becomes visible only if still eligible `SYNCING_PILL_DELAY_MS` after `startedAt`. Once visible it stays at least `SYNCING_PILL_MIN_MS` and until no longer eligible, then hides. A new `seq` while visible keeps it up (no blink) and updates the label.
- Label: `approximate ? SWITCHING_ANGLE : SYNCING_ANGLE` from `video-status-copy.ts` (source strings `Syncing angle`, `Switching angle`), rendered in mono caps by style.
- Look: ground `ON_MEDIA.badge`, 1 px `ON_MEDIA.strong` border, radius 2, height 28, horizontal padding 10, text `font-mono-bold` `typeStep("micro")`, `TRACKING["caps-l"]`, `ON_MEDIA.text`, `TABULAR`. A 2 px sync bar on the pill's bottom edge: track `ON_MEDIA.track`, a band of `ON_MEDIA.text2` sweeping with `translateX`, linear, period `duration.shimmer` (1400 ms), UI thread, paused when the app is not active (`useAppActive`). No ellipsis characters. No blur.
- Motion: fade in over `duration.instant` (100 ms), fade out over `duration.fast` (240 ms). `reduceMotion`: appears and disappears in place, the bar is static (full width).
- Accessibility: hidden from screen readers (`accessibilityElementsHidden`, `importantForAccessibility="no-hide-descendants"`), `pointerEvents="none"`. No haptic.
- Placement is the screen's job (4.6): the pill renders at its intrinsic size.

### 4.3 `AngleSwitcher` (`components/film-room/angle-switcher.tsx`, changed)

```ts
interface AngleSwitcherProps {
  // ...all existing props unchanged...
  /** The angle that is selected and still switching (switchState.targetId while pending and not restoring). */
  busyId?: string | null;
}
```
- Segments move from `StatePressable dim` to `PressableScale` (press-in 0.97, `instant`; the 0.85 opacity dip under Reduce Motion, which `PressableScale` already does).
- Pressing a segment that is not `activeId` fires `haptics.select()` once, then `onSelect(id)`. Pressing the active segment does nothing (no haptic, no call).
- The `busyId` segment renders the selected surface (it is also `activeId`) with `accessibilityState={{ selected: true, busy: true }}`; no extra visual beyond the selected surface (the pill carries the progress).
- Both variants (`plate`, `film`) get the press scale and haptic; `busyId` is only passed by the player.
- `testID`s and accessibility labels stay as they are (the match-loop harness finds segments by them).

### 4.4 Analysis prefetch (`lib/film-room/use-angle-analyses.ts`, new)

```ts
import type { VideoAnalysis } from "@jits/shared/api/film-room";
import type { AnalysisState } from "@/lib/film-room/use-video-analysis";

export function useAngleAnalyses(videoIds: string[]): {
  /** The analysis of that angle, or null (not loaded, none, error, or id null). */
  analysisFor: (videoId: string | null | undefined) => VideoAnalysis | null;
  stateFor: (videoId: string | null | undefined) => AnalysisState;
};
```
- Reads `getVideoAnalysis(supabase, id)` once per id (deduplicated, cancelled on unmount), in parallel, as soon as the ids are known. Ids are the playable angles of the match (the same list the screen pre-signs). A changed list fetches only new ids.
- The screen replaces `useVideoAnalysis(activeId)` with this hook, falling back to `useVideoAnalysis` semantics for an `activeId` not in the list (an outside navigation before the match loads).

### 4.5 Chrome during a switch (screen)

- The displayed angle for chrome is `chromeId = switchState.phase === "pending" ? switchState.fromId : activeId` (for a restore, `fromId` is the failed target, so use `switchState.targetId` when `restoring`; simplest: snapshot at the moment the phase becomes `pending`).
- While `pending`, the bottom cluster (caption, `SeekBar`, clock, moment count, `MomentChips`) renders from a snapshot taken at the tap: `positionS`, duration and moments of the outgoing angle. At `landing` it switches to live values of the new angle in one render. The transport stays live (play and pause work during a switch).
- The 5 s approximate note: hidden while `pending`; shown at landing when the landed switch is approximate (today's `setApproxAt`, moved from the tap to the landing).

### 4.6 Screen wiring (`app/(app)/video/[id].tsx`)

- `onSelect` passes `{ approximate: !exact }` to `switchAngle`.
- `AngleSwitcher` gets `busyId={switchState.phase === "pending" && !switchState.restoring ? switchState.targetId : null}`.
- `SwitchOverlay` mounts above the `VideoView` and the poster, below the scrims.
- `SyncingPill` sits in a wrapper at `top: insets.top + 112`, centred, `pointerEvents="none"` (the slot of today's approximate note, which never shows at the same time).
- Announcements (via `AccessibilityInfo.announceForAccessibility`, once per seq): at `landing` of a non-restore switch, `switchAnnouncement(label, approximate)` (move it from `lib/video/multi-angle/copy.ts` semantics into `video-status-copy.ts` as a new function; do not edit the multi-angle file). At failure, the failure string once.
- Failure tag: while `switchState.failed` is set and `Date.now() - failed.at < FAILURE_TAG_MS` (4000), show `couldNotLoadAngle(label)` = `Could not load {label}. Tap it to try again.` in the approximate-note tag style (mono micro, `ON_MEDIA.text2` on `ON_MEDIA.badge`) in the same slot. When `restoring` becomes true, `router.setParams({ id: fromRestoreTarget, t, approx })` back to the restored angle.
- Telemetry: `onShown={() => playback.telemetry.switchPillShown()}`.

## 5. Telemetry additions (B1)

On `PlaybackTelemetry` (`lib/video/use-playback-telemetry.ts`) and `PlaybackSession` (`lib/video/playback-telemetry.ts`):

| Method | Called by | Session field (Sentry extra, one event per session) |
|---|---|---|
| `switchHeldStill()` | B1, once per landed switch whose still was up at landing | `switchHeldStillCount` |
| `switchPillShown()` | B2 via `onShown`, once per seq | `switchPillShownCount` |
| `switchFailed()` | B1, once per failed switch (3.5) | `switchFailedCount` |
| `switchSuperseded()` | B1, when a pending switch is superseded (3.6) | `switchSupersededCount` |

Existing `switchCount` counts started switches (unchanged). `switchLatencyMs` / `switchLatencyMaxMs` change definition only (3.4). No new tags. All counts start at 0 and ride every continuation like the existing switch fields.

## 6. DESIGN.md Motion registry rows (B2)

| Animation | Tier | Where | Trigger | Haptic | Reduce Motion |
|---|---|---|---|---|---|
| Angle crossfade | Moment | `SwitchOverlay` (match player) | An exact-synced angle switch lands: the held still fades out over `duration.fast` on the brand ease-out | `select` on the tap (switcher), none here | Cut |
| Angle dip | Moment | `SwitchOverlay` | An approximate angle switch lands: black in and out, `moment.angleDip` (80 ms) each way | none | Cut |
| Held frame | (no animation) | `SwitchOverlay` | A still of the outgoing frame while the new angle loads | none | Same |
| Syncing pill | Moment + Ambient | `SyncingPill` | A switch not landed after 200 ms: fades in (`instant`), sync bar sweeps (1400 ms, linear) while syncing, fades out (`fast`) | none | Shown in place, static bar |
| Angle segment press | Reactive | `AngleSwitcher` | Press scale 0.97 | `select` on a new angle | 0.85 dip, haptic kept |

## 7. Acceptance criteria (bead jits-xfvd.16)

1. On an iPhone 12 or newer and a Pixel 6a-class Android, 20 switches each on Wi-Fi and on LTE (Network Link Conditioner or equivalent), playing and paused: zero black frames and zero wrong-moment (frame 0) frames in 240 fps captures.
2. Wi-Fi, pre-signed: p50 tap to landed at most 400 ms, p90 at most 800 ms; LTE p50 at most 800 ms (device telemetry `switchLatencyMs`).
3. Pressed and selected state on the next frame after the tap, plus the selection haptic.
4. The pill never shows for a switch that lands within 200 ms; it always shows for a longer one and stays at least 400 ms.
5. Paused stays paused on the same instant; speed is kept.
6. Reduce Motion: cut, static pill, haptic kept.
7. VoiceOver and TalkBack: the busy tab state; one announcement at landing; none at the start.
8. An injected sign failure returns to the previous angle at the same moment with the failure tag and one announcement.
9. Full gate green (`npm run typecheck`, `npm run test`), independent review clean, OTA shipped, `/canvas-sync` redraws board 33.

## 8. Test list (minimum)

B1 (`fake-expo-video.ts` gains: a controllable order of `replaceAsync` settle vs `readyToPlay`, `generateThumbnailsAsync` with controllable resolve or reject and delay, a paused item that stays "loading", `timeUpdateEventInterval` recorded):
- seek issued at settle, not re-issued at ready; re-issued only when more than 0.25 s off;
- `play()` at settle when playing; no `play()` when paused;
- no landing before the seek is issued; landing at 0.25 s tolerance, not at 1.5 s;
- paused landing on the post-seek first frame, and the 350 ms fallback;
- held still set before replace; late thumbnail discarded; rejected thumbnail leaves null; cap at 4 s clears it;
- landing to idle after 300 ms clears the still and restores the 0.25 s interval;
- supersede A to B to C before landing: still reused, `switchSuperseded` counted, only C lands;
- supersede during landing: new still captured;
- failure paths (sign failed, replace rejected, player error): restore to `fromId` at the tap moment, `failed` set, `switchFailed` counted, restore not counted as a switch landing; restore failure shows the failed phase;
- quality swap during a pending switch is not applied; an angle switch drops a pending quality swap (existing tests keep passing);
- outside navigation resets `switchState`.

B2:
- `SwitchOverlay`: renders nothing at idle or with a null still; crossfade vs dip vs cut by `approximate` and `reduceMotion`; removes at once when the still is cleared while pending;
- `SyncingPill`: 200 ms delay, 400 ms minimum, label by `approximate`, hidden from accessibility, `onShown` once per seq, static under Reduce Motion;
- `AngleSwitcher`: haptic only on a new angle, `busy` state on `busyId`, labels and testIDs unchanged, Best angle tag unchanged;
- `useAngleAnalyses`: parallel fetch, dedupe, new ids only, cancellation;
- screen: chrome snapshot held while pending and swapped at landing; approximate note at landing; failure tag and route reset on restore; announcements once.

## 9. Out of scope (phase 1)

Video preload of any kind; the multi-angle player (phase 2, jits-xfvd.3 as amended); seek-at-settle for first loads, re-signs and quality swaps; moving the switcher to the bottom cluster; a match-timeline clock across angles; Low Power Mode; blur.

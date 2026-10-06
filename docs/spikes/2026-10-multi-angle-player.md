# Spike: multi-angle player v1, device prototype test plan

Date: 2026-10-05. Branch: `feat/multi-angle-player` (built on `feat/angle-switch-fix`, PR #51). Status: prototype behind a dev flag that is OFF by default; nothing here ships to athletes until the decision gate below passes. Research: `research/2026-10-multi-angle-playback/01-client-playback.md` (technology) and `03-ux-and-competitors.md` (product and UX). Design notes: `design/native-screens/proposals/2026-10-05-multi-angle-player/README.md`.

## 1. What is being tested

The multi-angle player replaces "one player, swap the source, seek" with one expo-video player per playable angle (at most three), each in its own stacked `VideoView`, with only the visible angle opaque. It is JavaScript only, against expo-video 3.0.16 APIs that build 25 (runtime 0.5.0) already links, so it is OTA-safe. The pieces under test:

| Piece | Code | Behaviour |
|---|---|---|
| Roles | `apps/mobile/lib/video/multi-angle/roles.ts` | The Best angle (server `is_primary`) is the master clock and the audio bed while an audio-synced angle is on screen; the visible angle plus at most one hot standby play in step; any third angle is warm (loaded, paused, re-seeked every 5 s). A clock-only angle plays alone with its own audio. |
| Drift loop | `sync-controller.ts`, `use-multi-angle-playback.ts` | On every master time update (250 ms): error = slave time minus target. Inside one frame (33 ms): rate back to the base rate. Up to 250 ms (visible) or 120 ms (hidden): nudge `playbackRate` by `-clamp(error x 0.5, +-5%)`. Beyond: exact re-seek, then a 750 ms settle. Errors are smoothed as the median of three samples. |
| Switch modes | `roles.ts` (`switchModeFor`) | `swap`: the target is hot and within two frames, so the switch is an opacity change. `seek`: an audio-synced target that is warm or out of step is seeked exactly and played behind a held thumbnail of the outgoing frame (`generateThumbnailsAsync`). `dip`: either end is clock-only, so an 80 ms dip to black, then the approximate cut with the target's own audio. |
| Android decoder cap | `device-tier.ts` | At most two decoders playing. A phone is "warm-only" (one playing decoder, audio follows the picture, every switch is a seek) unless it is API 31 or newer, reports at least 6 GiB of memory and a year class of 2020 or newer. `ANDROID_FORCE_WARM_ONLY` is a plain constant an OTA can flip. An HEVC original (no normalized H.264 file yet) is never a hidden standby on Android, and a decoder error demotes an angle to warm for the rest of the session. |
| Rendering | `components/film-room/multi-angle/angle-stack.tsx` | Android uses `surfaceType="textureView"` for the stacked views (stacked SurfaceViews ignore opacity and z-order). iOS uses the default layer. |
| Telemetry | `lib/video/playback-telemetry.ts` | One Sentry event per screen session, tagged `video.playback.mode = multi`, with `switchCount`, `switchLatencyMs` (median, tap to the new angle's first frame), `switchLatencyMaxMs`, `switchSwapCount`, `switchSeekCount`, `switchDipCount`, `syncResidualP50Ms`, `syncResidualP95Ms`, `syncSamples`, `decoderCapEvents`, `decoderCapReasons` and `deviceTier`. |

## 2. How to run it

1. Build or use a development client (the dev flag only turns on when `__DEV__` is true): `cd apps/mobile && EXPO_PUBLIC_MULTI_ANGLE_PLAYER=1 npx expo start --dev-client`. A release bundle never turns it on, whatever the environment says.
2. Fixtures: one real match with three angles, recorded with consent and never committed: two competitor phones that the slicer audio-synced (`sync_source = 'audio'`), and a timekeeper angle that is clock-only. Record each file's keyframe spacing first: `ffprobe -v error -select_streams v:0 -skip_frame nokey -show_entries frame=pts_time -of csv=p=0 <file>`. Run the matrix twice if the jr_be `feat/playback-encode` 1 s GOP lands mid-spike: once on the old encode, once on the new one.
3. `get_match_details` already returns `sync_offset_ms`, `sync_source` and `sync_confidence` (jr_be wave A, `20261005100400`), and `getMatchDetailView` maps them. An angle the slicer has not audio-synced (all NULL, or `clock`) is clock-only, so every switch to it is a dip. Pick a fixture match whose angles the slicer audio-synced (or set them with `set_match_video_sync` on a local stack) to exercise the lock-step path.
4. Watch the per-session Sentry event (`Video playback session`, tag `video.playback.mode:multi`). For the drift numbers, add a temporary on-screen overlay in the dev client (not committed) that prints each slave's last smoothed error.

## 3. Device matrix

| # | Class | Suggested device | Expected tier | Why it is in the matrix |
|---|---|---|---|---|
| 1 | Recent iPhone | iPhone 15 or 16 | full | The common athlete phone; the best case for swaps. |
| 2 | Older iPhone | iPhone 11 or 12 | full | Oldest likely iPhone: memory and thermal headroom. |
| 3 | Flagship Android | Pixel 8 or Galaxy S23 | full | Confirms two hot decoders and TextureView opacity swaps. |
| 4 | Mid-range Android | Galaxy A35 or Pixel 7a (6 to 8 GB) | full, close to the line | Where the heuristic decides; the most likely place for decoder trouble. |
| 5 | Budget Android | Galaxy A15 or Moto G (3 to 4 GB) | warm-only | Confirms warm-only is chosen and that a seek switch is acceptable. |

## 4. Scenarios (each on every device, Wi-Fi first, then LTE on devices 1, 4 and 5)

1. Open on the Best angle, play 10 minutes untouched (drift, battery, thermal).
2. Twenty switches between the two audio-synced angles while playing (swap path), at 1x and at 0.5x.
3. Ten switches to and from the clock-only timekeeper (dip path).
4. Ten switches while paused, then frame step forward and back five times each (seek path, paused landing).
5. Ten swipes left and right on the video (gesture path, including vertical-drag rejection).
6. Ten key-moment chip taps (clearest angle, once the planner keys exist; otherwise they must just seek).
7. Background the app mid-play for 30 s and return; then one switch (resume path).
8. Force a decoder failure on device 5 by opening a 1080p HEVC original as a standby (or a fourth video elsewhere in the stack) and confirm the demotion keeps playback going.

## 5. Metrics to capture

| Metric | How | Target (decision gate) |
|---|---|---|
| Switch latency, swap | `switchLatencyMs` on sessions with only swaps; also a 240 fps slow-motion camera on the screen for 5 switches per device | p50 under 100 ms on devices 1 to 4 |
| Switch latency, seek | same, seek-only sessions | p50 under 400 ms on Wi-Fi; p90 under 1 s |
| Switch latency, dip | same, dip-only sessions | under 400 ms, never a black frame longer than the dip |
| Residual sync error | `syncResidualP50Ms` / `syncResidualP95Ms` over scenario 1 | p95 under 67 ms (two frames) |
| Visible hard re-seeks | count in the overlay during scenario 1 | under 1 per minute (each one is a micro-freeze) |
| Audio continuity | listen during scenario 2: no gap, no change of room sound on audio-synced switches | none heard |
| Lip-sync on a visible slave | film the screen during a slap and bump at the start | within about 45 ms (BT.1359 detectability) |
| Memory | Xcode Instruments (Allocations), Android Studio profiler, peak during scenarios 1 and 2 | under 1.5x single-angle |
| Battery | Xcode energy gauge, Battery Historian; drain per 10 minutes | under 1.5x single-angle |
| Thermal | `ProcessInfo.thermalState`, Android thermal status, after 10 minutes | never "serious" |
| Data used | OS per-app data, scenario 1 on LTE | about 2x single-angle with two hot angles; about 1x on warm-only |
| Decoder failures | `decoderCapEvents`, `decoderCapReasons`, logcat `MediaCodec` errors | none with two hot angles on devices 1 to 4 |
| Stalls | `stallCount`, `rebufferRatio` against single-angle sessions on the same network | no regression |
| Tier chosen | `deviceTier` on the event | matches the matrix's expected tier |
| Hidden-layer behaviour (iOS) | does an opacity-0 standby keep decoding? Compare its `timeUpdate` rate and the swap latency with a standby left at opacity 1 under the visible view | swap stays under 100 ms |
| TextureView swap (Android) | visually: no flash, no stale frame, no z-order fight on swap | clean on devices 3 to 5 |

## 6. Decision gate

Ship the multi-angle player to the field (flag on by default for 0.5.0 installs in an OTA) only if devices 1 to 4 meet the swap, residual, memory, battery and decoder targets, and device 5 runs warm-only without failures with seek switches under 1 s. If a mid-range Android fails the decoder or thermal target, raise the heuristic's line (or flip `ANDROID_FORCE_WARM_ONLY`) and re-run device 4. If iOS throttles opacity-0 layers, keep the standby at opacity 1 underneath the visible view instead. If residual p95 is above two frames even on flagships, the JS loop is not enough and the v2 native coordination module (research 01, section 6 v2) moves up.

## 7. Known limits of the prototype

- A switch requested while another is still landing is ignored (at most 1.5 s).
- The moment-chip "clearest angle" reads `moment_angles` (or `momentAngles` / `moment_clarity`) off the analysis or the match; the jr_be keys are not settled, so it does nothing today.
- No cellular policy yet: on LTE, warm angles still buffer. Research 03 recommends pre-signing only on cellular.
- No first-run swipe hint and no page dots.
- `preferredForwardBufferDuration` is not lowered for warm angles yet (left at the platform default).

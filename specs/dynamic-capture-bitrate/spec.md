# Dynamic capture bitrate (mobile, OTA)

Status: build-ready spec (2026-10-26), amended 2026-10-26 after the independent implementation review (section 15). Feature approved by the owner on 2026-10-26 as "Option 1: dynamic capture bitrate" (research doc `research/2026-10-26-video-upload-while-recording.md`, section 3 Tier 1 item 1 and the section 7 review log).
Platform: `apps/mobile` only. No backend change, no native change. Ships by OTA on runtime 1.0.
Phase 2 (location-aware history and background network probe, owner decisions 2026-10-26) is section 16: bead `jits-n2im.33.7`, backend `jr_be-1qz.28`.
Beads: parent `jits-n2im.33`; implementation `jits-n2im.33.1`; device verification `jits-n2im.33.2`; follow-ups `jits-n2im.33.3` (server-configurable levels) and `jits-n2im.33.4` (jr_be `capture_bitrate_kbps` column, cross-repo).

All paths below are relative to `apps/mobile/` unless they start with `packages/`, `node_modules/` or `jr_be`. Line numbers were verified on this worktree (branch `feat/dynamic-capture-bitrate`, off `origin/development` `22a07128`) and on jr_be `origin/development` `bd3337b`.

---

## 1. Problem

A match recording is uploaded only after it stops, and the athlete waits for it (the upload is foreground-only today). The size of the file is the single biggest lever on that wait, and today nobody chooses it: `recordAsync` is called with only `maxDuration` (`lib/video/use-video-recorder.ts:492`) and `CameraView` gets no `videoBitrate` (`components/match-flow/camera-overlay.tsx:124-132`). On iOS that means HEVC at about 4.7 Mbps for 720p, about 350 MB for a 10-minute match, which takes about 9.5 minutes to send over a 5 Mbps uplink. Three phones in one gym share one uplink, so the real wait is longer.

The footage only has to be good enough to cut highlights from (720p is the default capture quality, and the reels and the 720p playback copy are re-encoded server-side anyway), so most of those bits buy nothing the athlete sees. On a weak network they cost minutes.

## 2. Goals and non-goals

### Goals
1. Before each match recording starts, choose the recording bitrate from the network conditions at the face-off and from this phone's recent upload history, within fixed per-platform levels and floors.
2. Never go below the platform floor for the capture quality; never change the bitrate or codec while a recording is running.
3. Never lose a clip because of this feature (an unsupported codec must not reject the recording).
4. Make every choice observable (Sentry) so the levels can be tuned.
5. Ship as a JS-only OTA on runtime 1.0 (expo-camera 17.0.10 already supports both knobs).

### Non-goals (this version)
- Changing the bitrate mid-recording, or any adaptive or segmented recording (Tier 3 of the research).
- A network probe upload before recording (no extra data, no added latency).
- Server-configurable levels (follow-up `jits-n2im.33.3`).
- Storing the bitrate on `match_videos` (follow-up `jits-n2im.33.4`, jr_be).
- Any UI or copy change. The athlete sees nothing new, so the design canvas is untouched.
- Web recording (WebM via `MediaRecorder`) is out of scope.
- Changing resolution, frame rate, lens or orientation.

## 3. Owner-agreed guidelines (requirements)

| Capture quality | Platform / codec ladder | Normal | Weak | Hard floor |
|---|---|---|---|---|
| 720p | iOS, HEVC (`hvc1`) | 3.0 Mbps | 2.5 Mbps | 2.0 Mbps |
| 720p | Android, H.264 (and iOS `avc1` fallback) | 4.0 Mbps | 3.0 Mbps | 3.0 Mbps |
| 1080p (D2) | iOS, HEVC (`hvc1`) | 4.5 Mbps | 4.0 Mbps | 3.5 Mbps |
| 1080p (D2) | Android, H.264 (and iOS `avc1` fallback) | 6.0 Mbps | 5.0 Mbps | 5.0 Mbps |

- Never below the floor. Never change the bitrate mid-recording.
- Today no codec or bitrate is set; iOS records HEVC at about 4.7 Mbps at 720p, so every iOS level is a reduction. (The Android baseline was never measured per platform; see open question Q1.)
- Values are bits per second in code (`3_000_000`), because both `videoBitrate` props take bits per second (`node_modules/expo-camera/src/Camera.types.ts:391-395`).

## 4. Decisions

Each PM decision is a **PM default; the owner may override it.**

**D1. Levels live in code.** One module, `lib/video/capture-bitrate.ts`, holds the table in section 3, the 8 Mbps threshold and the history constants as named exports. No admin setting yet. Follow-up `jits-n2im.33.3` makes them server-configurable (never below the code floors).

**D2. 1080p has its own levels** (flag `match_capture_1080p` ON): iOS HEVC normal 4.5, weak 4.0, floor 3.5 Mbps; Android H.264 normal 6.0, weak 5.0, floor 5.0 Mbps. The flag is OFF in prod (CLAUDE.md, jr_be timekeeper release bullet), so 720p is what ships in practice.

**D3. Inputs.** (a) NetInfo at the face-off: `type` (wifi, cellular, ethernet, none, ...), `details.cellularGeneration`, `isInternetReachable`. (b) A small persisted history of this phone's recent completed match-upload throughputs: the last 5 samples, each with network class and timestamp, in AsyncStorage; samples older than 14 days are dropped. The throughput comes from the upload telemetry that already computes it (`lib/video/upload-telemetry.ts:221-253`). No probe upload.

**D4. Classification.** "normal" when the median of the recent samples on the same network class is at least 8 Mbps. "weak" when that median is below 8 Mbps, or on cellular 3G or worse, or when the internet is not reachable, or offline. With no usable history: "weak" on cellular (any generation, including unknown) and "normal" on Wi-Fi or ethernet. The threshold is the named constant `CAPTURE_NORMAL_MIN_MBPS = 8`.
Reasoning: the upload has to keep up with the match, not trail it by minutes. At the iOS 720p normal level (3 Mbps) a 10-minute match is about 225 MB, which an 8 Mbps uplink sends in about 3.75 minutes, well inside the match's own length; below 8 Mbps the wait grows quickly, and the measured per-phone throughput already includes the sharing of one gym uplink between up to three phones, so a weak median is real evidence that this gym's link is the bottleneck. Cellular with no history defaults to weak because cellular uplinks are both slower and metered; Wi-Fi with no history defaults to normal because most gyms have Wi-Fi and the normal level is already a cut from today.

**D5. Codec and bitrate per platform.**
- iOS applies `videoBitrate` only when a codec is passed to `recordAsync` (`node_modules/expo-camera/ios/Current/CameraVideoRecording.swift:86-93`), and an unavailable codec REJECTS `recordAsync` (same lines, `CameraRecordingException`, message "Video Codec '...' is not supported on this device", `ios/Common/CameraExceptions.swift:33-37`). So: pass `codec: 'hvc1'` as a `recordAsync` option only when `CameraView.getAvailableVideoCodecsAsync()` lists `hvc1` (verified API: static method, `node_modules/expo-camera/src/CameraView.tsx:106-112`, returns `Promise<VideoCodec[]>`, `VideoCodec = 'avc1' | 'hvc1' | 'jpeg' | 'apcn' | 'ap4h'`). If `hvc1` is missing but `avc1` is listed, pass `codec: 'avc1'` and use the H.264 ladder. If the query fails or has not answered, pass no codec and no bitrate (today's behaviour).
- Finding: the iOS query (`ios/CameraViewModule.swift:374-375, 414-438`) builds a throwaway `AVCaptureSession` with the FRONT camera and reads `AVCaptureMovieFileOutput.availableVideoCodecTypes`, while the recording session uses the back camera. The lists are expected to match, but the check at record time uses the real output, so this spec adds a guard: if `recordAsync` rejects with the codec message, the recorder retries once immediately with no codec (section 7.4). The clip is never lost to a codec mismatch.
- Finding: on Android, `getAvailableVideoCodecsAsync` does not exist (no Android implementation; the JS throws `UnavailabilityError`), so it is never called there.
- Android: `videoBitrate` prop only (CameraX `Recorder.Builder().setTargetVideoEncodingBitRate`, `android/src/main/java/expo/modules/camera/ExpoCameraView.kt:551-557`, H.264). A prop change sets `shouldCreateCamera = true` (`ExpoCameraView.kt:182-186`) and `OnViewDidUpdateProps` recreates the camera (`CameraViewModule.kt:402-406`), so the value must be settled before recording and frozen with the existing capture-quality freeze (`lib/video/use-capture-quality.ts:33-71`, `components/match-flow/match-recorder-surface.tsx:157-189`).
- iOS `videoBitrate` is a plain property read at record start (`ios/Current/CameraView.swift:60`), so a prop change on iOS never reconfigures the session.

**D6. Re-entry after a relaunch mid-match.** Final value: **the weak level for the platform, always.** The frozen choice of the first attempt is NOT persisted per match in this version. Finding behind the change: on re-entry the viewfinder is locked on its first render (live step) and Android needs the `videoBitrate` prop at that first render to avoid a camera recreate, so the value must be computable synchronously; an AsyncStorage read of a persisted choice cannot guarantee that, and re-entry records at 720p anyway (`use-capture-quality.ts:40-42`), so the first attempt's choice (possibly 1080p) would not apply as is. The weak level is safe and fast. On iOS the codec on re-entry comes from the codec cache that is loaded at app start (section 7.3); if it is not known, no codec and no bitrate (today's behaviour). The orchestrator's "use the persisted choice if any" is therefore satisfied by its "else" branch only.

**D7. Practice matches** (`upload: false`): the same picker, no special case. (Practice mounts the same `MatchRecorderCamera`, `app/(app)/practice.tsx:197`.)

**D8. Observability.** No backend change. The decision (bitrate, codec, level, ladder, reason, network class, history median) is persisted on the local upload job and added to the existing Sentry "Match video uploaded" event, plus one breadcrumb when recording starts. Follow-up `jits-n2im.33.4` adds the columns in jr_be.

**D9. Kill switch.** Finding: `feature_flags` (jr_be `20260405000500_feature_flags.sql`) is a key/boolean table readable by every authenticated user, and `admin_set_feature_flag(p_key, p_enabled)` (jr_be `20260608000000_admin_platform_roles.sql:315-352`) is an admin-only UPSERT, so an admin can create a NEW key without any migration (this is how `match_capture_1080p` is flipped; that flag's row was seeded by migration `20261021100900` only so that it shows up with a description). However, the client reader `getFeatureFlag` (`packages/shared/src/api/location.ts:41-53`) reads a missing row as `false`, so a positive flag named `match_capture_dynamic_bitrate` would default OFF until someone inserts it, which is the opposite of "default ON".
Final value: an **inverted kill switch `match_capture_bitrate_off`**. Missing row or `false` = the feature is ON; `true` = the feature is OFF and recordings use today's behaviour (no codec, no bitrate). No migration. To kill it: an admin runs `select admin_set_feature_flag('match_capture_bitrate_off', true);` (or the Admin feature-flag screen, if it accepts a new key). It takes effect at the next face-off; no OTA. A flag read error, or a read slower than `CAPTURE_FLAG_TIMEOUT_MS = 1_500`, keeps the last value read (default: not disabled). The last value read is persisted (AsyncStorage `elo-capture-bitrate-off::v1`, `{ off: boolean }`), primed at app start and refreshed by one read at app start, so a relaunch re-entry (D6, which reads nothing) honours a switch flipped before the relaunch. With nothing persisted (never read on this install) re-entry treats the feature as on: that matches a missing row, and the weak level is itself the safe, fast choice (review M2). OTA rollback (`eas update:roll-back-to-embedded` or republishing the previous group) remains the second line.

Other PM decisions taken while writing the spec (also PM defaults):
- **D10. Network class for history matching** is coarse: `wifi`, `ethernet`, `cellular`, `other` (bluetooth, vpn, wimax, other). Cellular generations are pooled, because with 5 samples per-generation buckets would almost never have data. `none` and `unknown` are never matched against history.
- **D11. Usable history** = at least `CAPTURE_HISTORY_MIN_SAMPLES = 2` samples on the same class within 14 days, so one bad upload cannot flip the level alone.
- **D12. A valid throughput sample** needs at least 8 MiB sent in the run, at least 5 s of foreground time and no failed attempt in the run; throughput = bytes sent this run x 8 / (run duration minus time backgrounded). Time in the background is excluded because the upload is foreground-only and would otherwise read as a slow network; a run with a failed attempt is not a sample because its duration also holds the backoff sleeps, which the manager does not time separately (review minor 4).
- **D13. Stand-in before the inputs land:** no codec and no bitrate (today's behaviour), reason `pending`. If the clip locks before the inputs land (rare; they are read from the weight step on), the clip records exactly as today.

## 5. Behaviour overview

1. App start: `primeCaptureCodecCache()` loads the cached iOS codec list from AsyncStorage (no native call).
2. Face-off (the hook becomes active on the weight, ready or live step for a viewer who records, the same trigger as the quality flag): one parallel read of (a) NetInfo, (b) the throughput history, (c) on iOS the codec list (the cache, else the native query with a 2 s timeout), (d) the kill switch flag. Each input fails independently to a safe value.
3. Every render until the lock: `decision = pickCaptureBitrate({ quality, ...inputs })`. Quality can still change (the 1080p flag answer), and the decision follows it. **Android exception (review M1):** from the first render with the camera up, the decision is held; a decision that lands later is not applied for that face-off (it stays `pending`, today's recording). Only a quality change, which recreates the camera anyway, replaces the held decision, in that same render, so the bitrate always matches the quality's ladder and floor. iOS is not held, because its bitrate is only read at `recordAsync`.
4. Lock (live step, or a clip recording or stopping, once the face-off has been active): the decision is frozen together with the quality and lens. Nothing after this point changes it.
5. The `CameraView` gets `videoBitrate={decision.bitrateBps ?? undefined}`. The recorder takes the decision with the capture (quality, lens) as the clip starts and passes `codec` to `recordAsync` when the decision has one.
6. Upload: the decision rides on the persisted job; when the upload lands, the Sentry event carries it and a throughput sample is appended to the history.

## 6. The picker (pure function)

New file `lib/video/capture-bitrate.ts`. No React, no native imports, no AsyncStorage: pure and fully unit-testable.

### 6.1 Constants (named exports)

```ts
export const CAPTURE_BITRATE_OFF_FLAG = "match_capture_bitrate_off";
export const CAPTURE_NORMAL_MIN_MBPS = 8;
export const CAPTURE_HISTORY_MAX_SAMPLES = 5;
export const CAPTURE_HISTORY_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
export const CAPTURE_HISTORY_MIN_SAMPLES = 2;
export const CAPTURE_SAMPLE_MIN_BYTES = 8 * 1024 * 1024;
export const CAPTURE_SAMPLE_MIN_ACTIVE_MS = 5_000;
export const CAPTURE_CODEC_QUERY_TIMEOUT_MS = 2_000;
export const CAPTURE_NETWORK_TIMEOUT_MS = 1_000;
export const CAPTURE_FLAG_TIMEOUT_MS = 1_500;               // review M1
export const CAPTURE_HISTORY_FUTURE_TOLERANCE_MS = 60_000;  // picker and store alike

export type CaptureLadder = "hevc" | "h264";
export type CaptureLevel = "normal" | "weak";
export interface CaptureLevelSet { normal: number; weak: number; floor: number } // bits per second
export type CaptureBitrateLevels = Record<CaptureLadder, Record<MatchVideoCaptureQuality, CaptureLevelSet>>;

export const CAPTURE_BITRATE_LEVELS: CaptureBitrateLevels = {
  hevc: { "720p": { normal: 3_000_000, weak: 2_500_000, floor: 2_000_000 },
          "1080p": { normal: 4_500_000, weak: 4_000_000, floor: 3_500_000 } },
  h264: { "720p": { normal: 4_000_000, weak: 3_000_000, floor: 3_000_000 },
          "1080p": { normal: 6_000_000, weak: 5_000_000, floor: 5_000_000 } },
};
```

`MatchVideoCaptureQuality` is imported from `@jits/shared/api/match-video-upload` (as `use-capture-quality.ts:14` does).

### 6.2 Types

```ts
export type CaptureNetworkClass = "wifi" | "ethernet" | "cellular" | "other" | "none" | "unknown";

/** What the hook reads from NetInfo once at the face-off. */
export interface CaptureNetworkSnapshot {
  type: string | null;                 // NetInfo state.type
  cellularGeneration: string | null;   // state.details.cellularGeneration ("2g" | "3g" | "4g" | "5g" | null)
  isInternetReachable: boolean | null; // state.isInternetReachable (null = not yet known)
}

/** One persisted upload throughput sample (section 7.2). */
export interface ThroughputSample {
  ts: number;                                           // epoch ms the upload landed
  network: Exclude<CaptureNetworkClass, "none" | "unknown">;
  cellularGeneration: string | null;                    // informational only
  mbps: number;                                         // > 0, finite
}

export type CaptureBitrateReason =
  | "disabled"               // kill switch on
  | "ios_codec_unknown"      // iOS: codec list not known (query failed, timed out or not answered)
  | "ios_no_supported_codec" // iOS: neither hvc1 nor avc1 listed
  | "reentry"                // relaunch re-entry (D6)
  | "network_unknown"        // no NetInfo snapshot, or type "unknown" / null
  | "offline"                // type "none"
  | "no_internet"            // isInternetReachable === false
  | "cellular_slow_gen"      // cellular 2g or 3g
  | "history_good"           // median >= threshold
  | "history_weak"           // median < threshold
  | "no_history_wifi"
  | "no_history_ethernet"
  | "no_history_cellular"
  | "no_history_other"
  | "pending"                // hook stand-in, inputs not landed (D13); never returned by the picker
  | "codec_rejected";        // set by the recorder after a codec rejection (7.4); never returned by the picker

export interface CaptureBitrateInput {
  platform: string;                       // Platform.OS ("ios" | "android"; anything else = android rules)
  quality: MatchVideoCaptureQuality;
  disabled: boolean;                      // kill switch
  reentry: boolean;
  codecs: readonly string[] | null;       // iOS: the codec list, null = unknown; ignored on Android
  network: CaptureNetworkSnapshot | null; // null = NetInfo unavailable
  history: readonly ThroughputSample[];
  now: number;                            // epoch ms, for the 14-day window
  levels?: CaptureBitrateLevels;          // default CAPTURE_BITRATE_LEVELS; tests inject
}

export interface CaptureBitrateDecision {
  managed: boolean;                 // false = today's behaviour (no codec, no bitrate)
  bitrateBps: number | null;        // null when !managed
  codec: "hvc1" | "avc1" | null;    // iOS only; always null on Android and when !managed
  level: CaptureLevel | null;       // null when !managed
  ladder: CaptureLadder | null;     // null when !managed
  quality: MatchVideoCaptureQuality;
  reason: CaptureBitrateReason;
  clamped: boolean;                 // the table value was below the floor and the floor was used
  network: CaptureNetworkClass;
  cellularGeneration: string | null;
  historyMedianMbps: number | null; // median of the matching samples, null when none used
  historySamples: number;           // matching samples considered (0 when none)
}

export function pickCaptureBitrate(input: CaptureBitrateInput): CaptureBitrateDecision;
export function unmanagedDecision(quality: MatchVideoCaptureQuality, reason: CaptureBitrateReason): CaptureBitrateDecision;
export function captureNetworkClassOf(snapshot: CaptureNetworkSnapshot | null): CaptureNetworkClass;
export function medianMbps(samples: readonly ThroughputSample[]): number | null;
```

### 6.3 Algorithm (evaluated in this exact order; first match wins)

Let `cls = captureNetworkClassOf(network)`: `wifi` -> wifi, `ethernet` -> ethernet, `cellular` -> cellular, `none` -> none, `unknown` or null type or null snapshot -> unknown, any other string (bluetooth, vpn, wimax, other) -> other.

1. `disabled` -> unmanaged, reason `disabled`.
2. Ladder and codec:
   - `platform === "ios"`: `codecs === null` -> unmanaged, `ios_codec_unknown`. Else if `codecs` includes `"hvc1"` -> ladder `hevc`, codec `hvc1`. Else if it includes `"avc1"` -> ladder `h264`, codec `avc1`. Else -> unmanaged, `ios_no_supported_codec`.
   - Otherwise (Android): ladder `h264`, codec `null`.
3. `reentry` -> level `weak`, reason `reentry`.
4. `cls === "unknown"` -> `weak`, `network_unknown`.
5. `cls === "none"` -> `weak`, `offline`.
6. `network.isInternetReachable === false` -> `weak`, `no_internet`. (`null` means not yet known and does NOT trigger this.)
7. `cls === "cellular"` and `cellularGeneration` is `"2g"` or `"3g"` -> `weak`, `cellular_slow_gen`.
8. History: `matching = history.filter(s => s.network === cls && now - s.ts <= CAPTURE_HISTORY_MAX_AGE_MS && s.ts - now <= CAPTURE_HISTORY_FUTURE_TOLERANCE_MS /* 60 s, the store's tolerance */ && Number.isFinite(s.mbps) && s.mbps > 0)`. If `matching.length >= CAPTURE_HISTORY_MIN_SAMPLES`: median (even count = mean of the two middle values) `>= CAPTURE_NORMAL_MIN_MBPS` -> `normal`, `history_good`; else `weak`, `history_weak`. Set `historyMedianMbps` and `historySamples`.
9. No usable history: `wifi` -> `normal`, `no_history_wifi`; `ethernet` -> `normal`, `no_history_ethernet`; `cellular` (any generation incl. 4g, 5g, null) -> `weak`, `no_history_cellular`; `other` -> `weak`, `no_history_other`.
10. Bitrate: `set = levels[ladder][quality]`; `raw = set[level]`; `bitrateBps = Math.max(raw, set.floor)`; `clamped = raw < set.floor`. If `set` is missing or any of its numbers is not a finite positive integer, return unmanaged with the reason computed so far (defensive; unreachable with the constant table, but the follow-up makes the table server-provided).

In every branch the decision also reports `network: cls`, `cellularGeneration`, and the history fields (null/0 unless step 8 ran with usable history; when step 8 had 1 matching sample it still reports `historySamples: 1` and `historyMedianMbps: null`).

`unmanagedDecision(quality, reason)` returns `{ managed: false, bitrateBps: null, codec: null, level: null, ladder: null, quality, reason, clamped: false, network: "unknown", cellularGeneration: null, historyMedianMbps: null, historySamples: 0 }` (the picker fills `network` from the snapshot when it has one).

## 7. Supporting modules

### 7.1 Network snapshot (inside the hook module)

`readCaptureNetwork(): Promise<CaptureNetworkSnapshot | null>`: `NetInfo.fetch()` raced against `CAPTURE_NETWORK_TIMEOUT_MS`; maps `type`, `details?.cellularGeneration` (string or null) and `isInternetReachable` (boolean or null). Any throw or the timeout -> `null`. Do not reuse `lib/video/quality/network-store.ts`: its `NetworkSnapshot` (`packages/shared/src/utils/playback-quality.ts:49-53`) has no `isInternetReachable`, and that store belongs to playback.

### 7.2 Throughput history: `lib/video/capture-bitrate-history.ts`

- One AsyncStorage key, `elo-capture-throughput::v1`, holding a JSON array of `ThroughputSample`.
- `loadThroughputHistory(now = Date.now()): Promise<ThroughputSample[]>`: never throws. Missing key -> `[]`. Unparseable JSON or a non-array -> `[]` AND the key is removed (self-heal). Each element is validated (finite `ts`, `network` in the four allowed classes, finite `mbps > 0`, `cellularGeneration` string or null); invalid elements are dropped, as are samples older than 14 days or more than 1 minute in the future. Returns at most the newest 5, newest first.
- `recordThroughputSample(sample): Promise<void>`: never throws. Serialised through a module-level promise chain (read-modify-write, same reason as `upload-persistence.ts:113-130`). Loads, prepends, drops expired, keeps the newest `CAPTURE_HISTORY_MAX_SAMPLES` (5 across all classes, per D3), writes.
- `throughputSampleFromRun(info): ThroughputSample | null`: pure. Input `{ landedAt, bytesThisRun, durationMs, backgroundedMs, networkType, cellularGeneration }`. Returns null when `bytesThisRun < CAPTURE_SAMPLE_MIN_BYTES`, when `durationMs - backgroundedMs < CAPTURE_SAMPLE_MIN_ACTIVE_MS`, or when the class is `none` or `unknown`. Else `mbps = bytesThisRun * 8 / ((durationMs - backgroundedMs) / 1000) / 1e6`.
- `__resetCaptureHistoryForTests()`.

### 7.3 iOS codec cache: `lib/video/capture-codecs.ts`

- AsyncStorage key `elo-capture-codecs::v1`, value `{ os: string, codecs: string[] }` where `os = String(Platform.Version)`.
- Module state: `cached: string[] | null`.
- `primeCaptureCodecCache(): Promise<void>`: iOS only (no-op elsewhere), never throws; reads the key; if `os` equals the current `Platform.Version` and `codecs` is an array of strings, sets `cached`. Called once from `app/(app)/_layout.tsx` on mount (AsyncStorage only, no native call), so a relaunch re-entry has the list in memory (D6).
- `cachedCaptureCodecs(): string[] | null`: synchronous read of `cached`.
- `ensureCaptureCodecs(): Promise<string[] | null>`: iOS only (returns null elsewhere); returns `cached` if set; else calls `CameraView.getAvailableVideoCodecsAsync()` once per process at a time (dedupe the in-flight promise), raced against `CAPTURE_CODEC_QUERY_TIMEOUT_MS`. A non-empty array of strings is stored in `cached` and persisted; an empty array, a throw or a timeout returns null, caches nothing, and is retried at the next face-off. An empty list is not cached because the native helper returns `[]` when the front camera cannot be opened (`CameraViewModule.swift:418-426`), which says nothing about the back camera.
- `__resetCaptureCodecsForTests()`.

### 7.4 Recorder: codec rejection guard (`lib/video/use-video-recorder.ts`)

At `:491-492`, the recorder already copies the capture from `captureSource` into `recordCaptureRef`. Change:
- `RecordingCapture` (`:85-88`) gains `bitrate: CaptureBitrateDecision | null`.
- `recordAsync` options become `{ maxDuration: maxDurationSeconds, ...(codec ? { codec } : {}) }` where `codec = recordCaptureRef.current?.bitrate?.codec ?? null`. On Android the decision's codec is always null, so the option is never passed there.
- In the catch (`:555-590`): if a codec was passed on this attempt and the message matches `/video codec .* not supported/i`, then (once per `start()`) replace `recordCaptureRef.current` with a copy whose `bitrate` is `unmanagedDecision(quality, "codec_rejected")` (keeping the network/history fields of the original for telemetry), log a warning, and `continue` the loop immediately (no sleep, does not consume a not-ready attempt). A stop that has already arrived (a very short match) is handed to the retry as a pending stop (`pendingStopRef`, then `issuePendingStop` on the new promise), so the match still gets its clip (review minor 3); only an unmounted recorder exits with no clip. After the fallback, a further codec rejection is today's error; a not-ready rejection keeps today's not-ready retry.
- iOS caveat: expo-camera applies codec and bitrate with `setOutputSettings` on the movie output's connection, and the settings stay on that connection for later recordings in the same `CameraView`.
- The recorder must not read the decision again after `recordAsync` is issued; the bitrate is whatever the frozen decision said at that moment.
- One breadcrumb per started recording, category `video.capture`, message `capture bitrate`, data = the decision's `bitrateBps, codec, level, ladder, reason, network, historyMedianMbps` (through the same tolerant `call()` pattern as `upload-telemetry.ts:78-89`, or a small exported helper there).

### 7.5 The hook: `lib/video/use-capture-bitrate.ts`

```ts
export function useCaptureBitrate(args: {
  active: boolean;                    // same as useCaptureQuality's `active`
  locked: boolean;                    // same `locked`
  quality: MatchVideoCaptureQuality;  // the (possibly still changing) quality
  cameraUp: boolean;                  // the CameraView is rendered (Android hold, review M1)
}): CaptureBitrateDecision;
```

Rules (mirroring `use-capture-quality.ts:44-71`):
- `lockedRef` latched in a layout effect, as in the quality hook.
- First time `active` is true: if `lockedRef.current` is already true, this is a **re-entry**: compute once, synchronously in the same render path (state initialiser or a ref set before return), `pickCaptureBitrate({ platform: Platform.OS, quality, disabled: lastKnownKillSwitch(), reentry: true, codecs: cachedCaptureCodecs(), network: null, history: [], now: Date.now() })`, freeze it, and never read anything. Otherwise start the four reads in parallel (`readCaptureNetwork`, `loadThroughputHistory`, `ensureCaptureCodecs` on iOS, the kill switch via `getFeatureFlag(supabase, CAPTURE_BITRATE_OFF_FLAG)`), each wrapped so it resolves to its safe value (null, [], null, last known) and never rejects. When all four land, and only if still mounted and not locked, store them as `inputs` (one state update).
- Kill switch read: `res.ok` -> `disabled = res.data` and update the module-level last-known value; not ok or throw -> last-known value (default false).
- Before `inputs` land: return `unmanagedDecision(quality, "pending")`.
- After: return `pickCaptureBitrate({ ...inputs, quality, platform: Platform.OS, reentry: false, now: <time inputs landed> })`, memoised on `[inputs, quality]`.
- Freeze: on the first render where `locked` is true and the face-off has been active, the decision returned by that render is stored in a ref and returned on every later render, whatever `quality` or `inputs` do. Inputs landing after the lock are dropped (as `use-capture-quality.ts:65`). A viewfinder that is locked before it is first active (its opt-in settles a render late) is not frozen yet, so it still takes the re-entry path (review minor 2).
- Android hold (review M1): on Android, from the first render with `cameraUp`, the decision is held and returned on later renders; it is replaced only in a render whose `quality` differs from the held decision's. A `videoBitrate` change recreates the CameraX camera asynchronously (`unbindAll`), and a `recordAsync` racing that teardown can lose the clip, so no decision that lands after the camera mounted is applied. In practice the athlete's reads start on the weight step and land before the ready step mounts the camera; a timekeeper's camera is up from its first render, so on Android the timekeeper records as today (`pending`) unless re-entering. The kill switch read is bounded (`CAPTURE_FLAG_TIMEOUT_MS`) so it never holds the inputs back.
- Hook order inside `useViewfinderCapture` (`components/match-flow/match-recorder-surface.tsx:157-189`): call it right after `useCaptureQuality` (`:166`) with the same `active` (`faceoff && optedIn`) and `locked`, and `quality: videoQuality`.

Because `videoQuality` is itself frozen at the same lock and the decision is a function of `(inputs, quality)`, the camera's quality and bitrate always freeze together.

## 8. Integration points (file:line)

| # | File | Change |
|---|---|---|
| 1 | `lib/video/capture-bitrate.ts` (new) | Constants, types, `pickCaptureBitrate`, `unmanagedDecision`, `captureNetworkClassOf`, `medianMbps` (section 6). |
| 2 | `lib/video/capture-bitrate-history.ts` (new) | History store (7.2). |
| 3 | `lib/video/capture-codecs.ts` (new) | iOS codec cache (7.3). |
| 4 | `lib/video/use-capture-bitrate.ts` (new) | The hook (7.5) and `readCaptureNetwork` (7.1). |
| 5 | `components/match-flow/match-recorder-surface.tsx:157-189` | Call `useCaptureBitrate` after `useCaptureQuality` (`:166`); include `bitrate` in the `captureRef.current` object written at `:170-172` (deps gain the decision); add `videoBitrate: decision.bitrateBps ?? undefined` to the `Viewfinder` built at `:183-188`. |
| 6 | `components/match-flow/camera-overlay.tsx:40-49, 124-132` | `Viewfinder` gains `videoBitrate: number | undefined` (doc: "frozen with the quality; a change recreates the Android camera"); pass `videoBitrate={viewfinder.videoBitrate}` to `CameraView`. |
| 7 | `lib/video/use-video-recorder.ts:85-88, 400-402, 491-492, 555-590` | `RecordingCapture.bitrate`; codec option and rejection guard (7.4); pass `captureBitrate: recordCaptureRef.current?.bitrate ?? null` to `startMatchVideoUpload` next to `captureQuality` (`:400-402`). |
| 8 | `lib/video/video-upload-manager.ts:160-172, 1565-1585, 1331-1335` | `StartMatchVideoUploadParams.captureBitrate?: PersistedCaptureBitrate | null`; written to the job at creation; passed to `trackUploaded` as `captureBitrate: current.captureBitrate ?? null`. |
| 9 | `lib/video/upload-persistence.ts:62-110, 209-240` | `PendingUploadJob.captureBitrate?: PersistedCaptureBitrate | null` where `PersistedCaptureBitrate = { bitrateBps: number | null; codec: "hvc1" | "avc1" | null; level: "normal" | "weak" | null; ladder: "hevc" | "h264" | null; reason: string; network: string; historyMedianMbps: number | null }`. `normaliseJob` keeps it only if it is an object with those field types, else sets it to null (never rejects the job; the job is the only handle on the clip). Older bundles (OTA rollback) spread `...job` and ignore the field, so a rollback is safe. |
| 10 | `lib/video/upload-telemetry.ts:221-253` | `trackUploaded` takes `captureBitrate?: PersistedCaptureBitrate | null`. Keep the full NetInfo state it already fetches (`:229`) to also read `details.cellularGeneration`. Add to `extra`: `captureBitrateBps`, `captureCodec`, `captureLevel`, `captureLadder`, `captureReason`, `captureNetwork`, `captureHistoryMedianMbps` (all null when absent); add tag `video.capture.level` = level, or `unmanaged`, or `unknown` when absent. Then build a sample with `throughputSampleFromRun` from `done` and the fetched state, and `void recordThroughputSample(sample)` when non-null. Both inside try/catch: telemetry never fails an upload. |
| 11 | `app/(app)/_layout.tsx` | Mount `<CaptureBitrateBootstrap />` (`lib/video/capture-bitrate-bootstrap.tsx`): once on mount `primeCaptureCodecCache()`, and `primeCaptureBitrateOff()` then one `readCaptureBitrateOff()`. |
| 12 | `CHANGELOG.md` | Under `## [Unreleased]`, Mobile, **Added**: dynamic capture bitrate, the four new files, the kill switch key. |

No change to `packages/shared`, `app.json`, `app.config.js`, `package.json`, metro or babel.

## 9. Failure modes

| Failure | Behaviour | Reason in telemetry |
|---|---|---|
| iOS codec query throws, times out (2 s) or returns `[]` | No codec, no bitrate (today). Retried at the next face-off. | `ios_codec_unknown` |
| iOS lists neither hvc1 nor avc1 | No codec, no bitrate. | `ios_no_supported_codec` |
| iOS `recordAsync` rejects the codec anyway | One immediate retry without codec or bitrate; clip recorded as today. | `codec_rejected` |
| `getAvailableVideoCodecsAsync` on Android | Never called. | n/a |
| NetInfo throws or times out (1 s) | Snapshot null; weak level. | `network_unknown` |
| NetInfo says `isInternetReachable: null` | Not treated as offline; classified by type and history. | as classified |
| History key unparseable or not an array | Treated as empty, key removed; no-history default for the class. | `no_history_*` |
| History element malformed, expired or in the future | Dropped. | n/a |
| AsyncStorage throws on read or write | Read = empty history; write silently skipped. | n/a |
| Kill switch read fails or takes over 1.5 s | Last value read, persisted across launches (default: feature on). | n/a |
| Android: inputs land after the camera mounted | Not applied for this face-off; today's recording (no prop change after mount). | `pending` |
| iOS codec list answers after its 2 s timeout | This face-off records as today; the late answer still fills the memory and disk caches for the next. | `ios_codec_unknown` |
| Inputs not landed by the lock | Today's behaviour for that clip. | `pending` |
| Re-entry after relaunch | Weak level; iOS codec from the cache, else today's behaviour. | `reentry` / `ios_codec_unknown` |
| Quality flag answer lands after the decision | Before lock the decision follows (Android camera recreated on the ready step once, as the quality change already does); after lock ignored. | n/a |
| Malformed `captureBitrate` on a persisted job | Field set to null; job kept. | absent |
| Camera permission denied / viewfinder not mounted | No camera, nothing applied; the hook still reads inputs when active (cheap) but nothing records. | n/a |

## 10. Telemetry fields

On the "Match video uploaded" Sentry event (`extra`): `captureBitrateBps` (number|null), `captureCodec` ("hvc1"|"avc1"|null), `captureLevel` ("normal"|"weak"|null), `captureLadder` ("hevc"|"h264"|null), `captureReason` (a `CaptureBitrateReason`), `captureNetwork` (class at the face-off), `captureHistoryMedianMbps` (number|null). Tag: `video.capture.level` (`normal` | `weak` | `unmanaged` | `unknown`). Existing fields (`throughputBytesPerSec`, `networkType`, `durationMs`, `bytes`) stay unchanged, so file size and upload time can be compared by level.
Breadcrumb at record start: category `video.capture`, message `capture bitrate`, same data.

## 11. Acceptance criteria (implementation bead `jits-n2im.33.1`)

1. **Picker unit tests** (`__tests__/lib/video/capture-bitrate.test.ts`) cover every branch in 6.3 with its exact reason: disabled; iOS codecs null; iOS hvc1 present (hevc ladder, codec hvc1); iOS avc1 only (h264 ladder, codec avc1, H.264 values); iOS neither; Android always h264 and codec null even when `codecs` lists hvc1; reentry (weak, on both platforms, before any network check); network null; type `unknown`; type `none`; `isInternetReachable: false`; `isInternetReachable: null` does not trigger; cellular 2g and 3g; cellular 4g and 5g with good history (normal) and with weak history (weak); history median exactly 8 (normal) and 7.99 (weak); even-count median; history on a different class ignored; samples older than 14 days ignored; a single matching sample is not usable; no history on wifi (normal), ethernet (normal), cellular with null generation (weak), other e.g. `vpn` (weak).
2. **Value table test**: for each ladder x quality x level, `bitrateBps` equals section 3 exactly (8 cases), and no decision is ever below its floor (property-style loop over all inputs above).
3. **Floor clamp test**: with an injected `levels` where `weak < floor`, the result equals the floor and `clamped: true`; with an invalid set (NaN, 0, missing quality) the decision is unmanaged.
4. **History store tests** (`capture-bitrate-history.test.ts`): cap at 5 newest; 14-day expiry; future samples dropped; corrupt JSON returns [] and removes the key; malformed elements dropped; concurrent `recordThroughputSample` calls do not lose a sample; `throughputSampleFromRun` returns null under 8 MiB, under 5 s of foreground time and for `none`/`unknown`, and excludes backgrounded time from the rate.
5. **Codec cache tests** (`capture-codecs.test.ts`): Android never calls the native method; a timeout, a throw and `[]` return null and cache nothing; success caches in memory and AsyncStorage; a cache written under another `Platform.Version` is ignored; concurrent calls share one native call.
6. **Hook tests** (`use-capture-bitrate.test.ts`, pattern of `use-capture-quality.test.ts`): returns `pending` until inputs land; after inputs land returns the picker's decision and follows a quality change before the lock; once `locked` becomes true the returned decision is referentially stable through later quality changes and late input landings; first active while already locked returns the `reentry` weak decision synchronously on the first render and performs no reads; inactive never reads.
7. **Freeze integration test** (in `match-recorder-surface` or a recorder test): the `videoBitrate` prop passed to `CameraView` and the `bitrate` in `captureRef` do not change between the lock and the end of the recording, even when the 1080p flag answer, the network or the inputs change during it; the recorder passes the codec captured at `recordAsync` time and never re-reads the decision.
8. **Recorder tests** (`use-video-recorder.test.ts`): no `codec` option when the decision has none (Android, unmanaged, pending); `codec: "hvc1"` passed when decided; a "Video Codec 'hvc1' is not supported" rejection retries once immediately without codec and uploads with reason `codec_rejected`; a second rejection surfaces today's error; a not-ready rejection keeps today's retry behaviour; the decision reaches `startMatchVideoUpload` as `captureBitrate`.
9. **Persistence and telemetry tests**: `captureBitrate` round-trips through `saveUploadJob`/load; a malformed value loads as null without dropping the job; `trackUploaded` adds the fields and the tag, appends a valid sample, and still sends the event when the history write throws.
10. `npm run typecheck` (all workspaces) green.
11. `npm run test` (all workspaces) green, with no existing test weakened.
12. `cd apps/mobile && npx expo export --platform ios --no-bytecode` green (no native file touched, but this catches metro resolution of the new `expo-camera` static call and AsyncStorage imports).
13. Match-loop harness `npm run match-loop -- --tier core` if the local stack (jr_be Supabase, Metro, booted simulator) is available; it proves the match flow still runs end to end, but it CANNOT exercise this feature: the simulator has no camera and core runs revoke camera permission (`tools/match-loop/LOOP.md`, preflight). If the stack is not available, state that in the bead with the reason; it is not a blocker for the OTA, device verification `jits-n2im.33.2` is.
14. `CHANGELOG.md` updated; an independent reviewer (not the implementer) has reviewed the diff and the review is clean.

## 12. What cannot be verified without a physical device, and the device test plan (bead `jits-n2im.33.2`)

Not verifiable in unit tests or the simulator:
- That iOS AVFoundation honours `AVVideoAverageBitRateKey` for HEVC at these values, and that CameraX honours `setTargetVideoEncodingBitRate` (it is a target; devices may clamp to their encoder range).
- The real file bitrate, size and upload time.
- That `getAvailableVideoCodecsAsync` (front-camera throwaway session) does not disturb a live back-camera preview when it runs during the ready step.
- That the Android camera is not recreated mid-recording.
- Visual quality of reels and the 720p playback copy cut from weak-level footage.

Manual plan (preview or development OTA carrying the build, a physical HEVC-capable iPhone and a physical Android phone, a non-prod environment for the 1080p rows):
1. Fresh install state: clear app data (or delete `elo-capture-throughput::v1`) so there is no history.
2. **Wi-Fi, no history (normal)**: record a 2-minute practice match and a 2-minute real match. Expect reason `no_history_wifi`, level normal.
3. **Cellular, no history (weak)**: Wi-Fi off, record a 2-minute match. Expect `no_history_cellular`.
4. **Weak history on Wi-Fi**: throttle the Wi-Fi uplink below 8 Mbps (router QoS or Network Link Conditioner on the iPhone) and complete two uploads, then record on Wi-Fi. Expect `history_weak`.
5. **1080p**: turn `match_capture_1080p` on in the test environment and repeat steps 2 and 3.
6. **Kill switch**: `select admin_set_feature_flag('match_capture_bitrate_off', true);` in the test environment, record. Expect reason `disabled`, no codec, the old size (about 4.7 Mbps on iOS). Set it back to false.
7. **Re-entry**: start a match recording, force-quit the app during the live step, relaunch, resume the match from Home. Expect reason `reentry`, weak level.
8. **Codec query timing (iOS)**: on a fresh install go straight into a practice match so the first query runs while the ready viewfinder is up; the preview must not flicker or freeze and the recording must start.
9. For each recording, download the ORIGINAL object from the `match-videos` bucket (`<match_id>/<uploader_athlete_id>/<unix_ts>.mp4`) and run
   `ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height,bit_rate:format=bit_rate,duration,size -of json <file>`.
   Pass: `codec_name` is `hevc` when hvc1 was decided and `h264` for avc1 and Android; the video stream `bit_rate` (or format `bit_rate` minus about 0.1 Mbps of audio when the stream value is missing, as with some `.mov` files) is within plus or minus 20 percent of the target; dimensions match the quality; no clip lost.
10. Compare each Sentry "Match video uploaded" event against the recording: `captureBitrateBps`, `captureCodec`, `captureLevel`, `captureReason` match the expectation; the throughput sample was appended (check via a dev build log or the next decision's `historySamples`).
10b. **Android camera recreate (review M1)**: on the Android phone, (i) as a timekeeper (camera up from the first render) and (ii) as an athlete with the inputs slowed (a throttled network or slow backend, so they land after the ready step mounted the camera), go live and record. Expect reason `pending`, no `videoBitrate` change after the camera mounted (no preview blink on ready or at the live handoff), and the clip recorded and uploaded. Also confirm an athlete whose inputs landed on the weight step records at the decided level, and (review M2) that a relaunch re-entry with `match_capture_bitrate_off = true` set before the force-quit reports `disabled`.
11. **Quality check (owner)**: open the highlight reel and the 720p playback copy rendered from a weak-level 720p clip on each platform, side by side with a pre-change clip of a similar match. The owner signs off "good enough to clip". A failure here is a reason to raise the weak level before the production OTA.

Record measured bitrates, file sizes and upload times per platform x level x quality in bead `jits-n2im.33.2`.

## 13. Ship note (OTA)

- JS-only: four new TS files and edits to existing TS/TSX under `apps/mobile`. No native dependency change, no `app.json`/`app.config.js` change, no `packages/shared` API change, no runtime bump. It uses only native methods already in the 1.0 binary (`expo-camera` 17.0.10: `videoBitrate` prop on both platforms, `codec` record option and `getAvailableVideoCodecsAsync` on iOS; `@react-native-community/netinfo` 11.4.1; AsyncStorage). OTA-eligible for runtime **1.0** per the jits_web CLAUDE.md rule.
- Non-critical update (do not bump `update-critical-index.json`).
- No backend prerequisite. The kill switch row does not need to exist.
- Release order: implementation merged with green gates, then a preview/development OTA, then device verification `jits-n2im.33.2` passes and the owner signs off quality, then the production OTA.
- Rollback: set `match_capture_bitrate_off = true` (immediate, next face-off), or roll the OTA back. Persisted jobs written by this bundle stay readable by the previous bundle (the extra job field is ignored).
- No UI change, so no design canvas update and no `canvas-drift` impact.

## 14. Open questions (none block implementation)

- **Q1 (owner, before the production OTA):** Android's current default bitrate was never measured. If CameraX's 720p default on a given phone is below 4 Mbps, the normal level would RAISE that phone's bitrate. The device run in `jits-n2im.33.2` should record a pre-change Android clip's bitrate; if it is below the normal level, the owner decides whether to cap at the default (that would need a per-device measurement and is out of this version).
- **Q2 (owner):** D9 uses an inverted flag name (`match_capture_bitrate_off`) instead of `match_capture_dynamic_bitrate` default ON, because a missing row reads off and a positive flag would need a migration to default on. Confirm the name.
- **Q3 (owner):** D6 changed from "persisted choice, else weak" to "always weak" on re-entry (reason in D6). Confirm.
- **Q4 (ops):** whether the Admin feature-flag screen can create a new key, or only flip seeded rows. If only seeded rows, the kill switch is flipped with the SQL call in D9 (an admin session is required, because the function checks `is_admin()`), or the follow-up `jits-n2im.33.4` jr_be migration can seed the row (seeded `false`).

## 15. Amendments after the implementation review (2026-10-26)

The independent review of `jits-n2im.33.1` (verdict fix-then-ship) changed these points. They are folded into the sections above.

- **M1, Android recreate race:** the Android hold from the camera's mount (section 5 step 3, 7.5) and the bounded kill switch read (D9). Device plan item added to `jits-n2im.33.2`.
- **M2, kill switch on re-entry:** the last value read is persisted and primed at app start (D9, 8 #11).
- **Minor 1:** a codec answer that misses the 2 s timeout still fills the caches (section 9).
- **Minor 2:** freeze only once the face-off has been active (7.5).
- **Minor 3:** a stop already requested at a codec rejection is handed to the retry (7.4).
- **Minor 4:** a run with a failed attempt is not a throughput sample (D12).
- **Minor 5:** the iOS output settings caveat (7.4).
- **Nit:** the picker and the store share the 60 s future tolerance (6.3 step 8).

## 16. Phase 2: location-aware history and background network probe

Status: build-ready spec (2026-10-26, PM). Owner decisions of 2026-10-26 (requirements below); every other choice is a PM default the owner may override, marked "PM default".
Beads: mobile implementation `jits-n2im.33.7` (parent `jits-n2im.33`); backend `jr_be-1qz.28` (the `net-probe` Edge Function, contract jr_be `specs/024-net-probe/spec.md`, cross-repo); device verification rows P1 to P10 appended to `jits-n2im.33.2`; the bitrate half of `jits-n2im.33.6` is delivered here (E11).
Line numbers were verified on this worktree at `b80a6d33` (branch `feat/dynamic-capture-bitrate`). This section supersedes the phase 1 non-goal "A network probe upload before recording" (section 2) and the 5-sample cap of D3 (E3). Everything else in sections 1 to 15 stands.

### 16.1 Problem

Phase 1 keeps one pooled history per network class (D10). Matches happen in different gyms with very different uplinks, so a phone that uploaded fast at gym A picks "normal" at gym B where the uplink is weak, and the reverse. And with no history at all, Wi-Fi is assumed normal (D4) without any evidence. The owner wants the choice to account for location and, where there is no evidence for this place, to measure the uplink with a short test before the match, entirely in the background.

### 16.2 Owner decisions (2026-10-26, requirements)

1. Matches happen in different places with different upload speeds; the picker must account for location.
2. A short network (upload) test runs before the match, up to about 10 s, on cellular, and on Wi-Fi when the phone has no history for this location.
3. UX: entirely in the background. Final value (orchestrator default, adopted): **no UI at all**, no copy, nothing the user sees or waits for. The match never waits on the test.

### 16.3 Decisions

**E1. Coarse location on history samples.** Each throughput sample gains `cell: { lat: number; lng: number } | null`, the location rounded to 2 decimal places (0.01 degree grid: about 1.1 km north-south, about 0.8 km east-west at Toronto's latitude). Stored on the device only (AsyncStorage, the existing key), same 14-day expiry. The rounding happens before anything is stored or put in React state: the precise reading never leaves the location read function. PM default (the orchestrator offered "lat/lng rounded or geohash 6"; rounding was chosen because distance matching across a cell edge is one formula, where geohash would need neighbour cells).

**E2. "Here" means within 1,600 m, cell to cell.** A sample is location-matched when the haversine distance between its cell and the current cell is at most `CAPTURE_LOCATION_MATCH_M = 1_600`. Reason: the same spot can round to two cells whose centres are up to one cell diagonal apart (at most about 1.57 km at the equator, less further north), so 1,600 m always matches the same place across a rounding edge, and the effective radius is about 1 to 2 km. PM default; this is the "about 1 km" of the orchestrator, widened only by the rounding.

**E3. History cap raised from 5 to 20 samples** (`CAPTURE_HISTORY_MAX_SAMPLES = 20`), newest first, across all classes and places, 14 days. Five samples cannot hold several gyms. The AsyncStorage key stays `elo-capture-throughput::v1`: old samples load as `cell: null, source: "upload"` and remain valid for class-level matching (E4) but never match a location. PM default.

**E4. History matching with location.** With a known current cell, only samples on the same network class AND within E2 of it count (at least `CAPTURE_HISTORY_MIN_SAMPLES = 2`, unchanged). With a known cell and fewer than 2 such samples, the place is "unknown here": the picker does NOT fall back to other places' history (another gym's uplink says nothing about this one) and uses the probe (E6) or, without a probe, the phase 1 first-time rule for the class (D4: Wi-Fi and ethernet normal, cellular and other weak). With NO current location (unavailable without a prompt, E5), the picker uses phase 1 exactly: class-level history across all places, then the first-time rule. PM default (the orchestrator's "fall back to class-level behaviour" is read as "phase 1 behaviour").

**E5. Where the location comes from: no new permission, ever.** New function `readCaptureLocation()` (in `lib/video/capture-location.ts`), bounded by `CAPTURE_LOCATION_TIMEOUT_MS = 1_000`, never asks for permission, never throws, returns a coarse cell or null. Sources, first one that yields wins:
1. The OS cached fix, only when foreground location permission is ALREADY granted: `lastKnownLocationPermission()` (`lib/location/permission-cache.ts:20-22`), or when that is still null, `readLocationPermission()` (`:25-38`, `getForegroundPermissionsAsync`, which never prompts). Then `Location.getLastKnownPositionAsync({ maxAge: CAPTURE_LOCATION_MAX_AGE_MS, requiredAccuracy: CAPTURE_LOCATION_MAX_ACCURACY_M })` with `CAPTURE_LOCATION_MAX_AGE_MS = 30 * 60 * 1000` and `CAPTURE_LOCATION_MAX_ACCURACY_M = 3_000` (amended in review, 16.15: was 1,000, which rejected every approximate fix), accepted only if its own accuracy and timestamp pass the same limits (the OS may ignore the options; same check as `readOsCachedFix`, `lib/invites/location.ts:212-235`). Android "approximate only" permission and iOS reduced accuracy are accepted here (a 1 km cell does not need precision) as long as the reported accuracy is at most 3,000 m (Android approximate fixes report about 2 km).
2. The device location store, synchronous, no permission needed: `validDeviceTag(getDeviceLocationOwner())` then `validDeviceReading(getDeviceLocationOwner())` (`lib/location/device-location-store.ts:180-191`, owner from `:119`). These are the last server-accepted `go_live` tag (SecureStore, loaded at sign-in, `lib/auth/auth-context.tsx:210`) and the last accepted browse or arena reading (memory), each under 4 hours old and at 100 m or better.
3. Otherwise null ("location unknown").
Finding (availability before the camera, without a prompt): **yes for Arena athletes in prod.** With `match_location_required = true` (prod since 2026-10-05), going live requires a server-accepted `go_live` tag under 4 hours old (`lib/arena/location-ladder.ts:1-25`), and the device store holds it (`device-location-store.ts:8-12`), so source 2 is present for every athlete who went live on this phone within 4 hours, which is how Arena matches start. Source 1 also works whenever permission was granted; the face-off already takes one silent reading at the same moment (`lib/match-flow/use-faceoff-location-log.ts:19-47`, called from `use-faceoff.ts:150`), which refreshes the OS cache for the next read. A timekeeper or a practice match has a location only if permission is already granted or the phone went live within 4 hours; otherwise unknown, and E4's no-location branch applies. The existing face-off reading is NOT reused directly (it is telemetry, fire and forget, and holds the precise reading); `readCaptureLocation` is an independent, bounded read.

**E6. The background probe: when it runs.** One upload throughput probe per face-off, only when all of these hold (pure helper `captureProbeNeeded`, 16.4):
- neither kill switch is on (`match_capture_bitrate_off`, `match_capture_probe_off`, E9);
- the base decision (the picker run without a probe) is managed and its reason is not one of `reentry`, `network_unknown`, `offline`, `no_internet`, `cellular_slow_gen` (those are already weak or unmanaged; a probe cannot change them, so no data is spent);
- the network class is `cellular` (always, even with location-matched history), OR the class is `wifi`, `ethernet` or `other` AND the base decision did not use location-matched history (no current cell, or fewer than 2 samples here);
- the viewer records a real match (a match id is known: never in practice, which uploads nothing; PM default);
- no match video upload is running (`hasActiveVideoUploads()`, `lib/video/video-upload-manager.ts:1720-1722`);
- the `net-probe` function has not answered 404 in this process (E8);
- this match id has not been probed in this process ("one probe per face-off"; a re-render, a remount of the camera surface or a second face-off render for the same match never re-runs it).

**E7. The probe: how it measures.** New module `lib/video/net-probe.ts` (API in 16.5). One `XMLHttpRequest` POST of a fixed body of `NET_PROBE_MAX_BYTES = 4 * 1024 * 1024` bytes (4 MiB; a JS string of ASCII characters, built per probe and not kept afterwards (amended in review, 16.15), so no base64 conversion; `Content-Type: application/octet-stream`; no `Content-Encoding`, so neither platform compresses it) to `${env.supabaseUrl}/functions/v1/net-probe`. Throughput comes from `xhr.upload.onprogress`. Verified in this worktree: React Native 0.81.5 dispatches upload progress on both platforms (`node_modules/react-native/Libraries/Network/XMLHttpRequest.js:321-336`, `__didUploadProgress` on `xhr.upload`; Android wraps every request body in `ProgressRequestBody` and throttles the events, `ReactAndroid/.../network/NetworkingModule.kt:585-607`; a string body is sent as bytes, `NetworkingModule.kt:369-385`, and needs the Content-Type header, `:365-367`). RN has no `fetch` upload progress, and chunked timed POSTs would add a round trip per chunk, so XHR progress it is.
- Hard caps: `NET_PROBE_MAX_MS = 10_000` from `send()` (then `xhr.abort()`), and the body itself is the 4 MiB byte cap. Whichever comes first ends it.
- Ramp discard: progress points before `NET_PROBE_RAMP_MS = 1_000` after `send()` are ignored (TCP slow start, TLS setup). The baseline is the first progress point at or after 1,000 ms; the end point is the last progress point, or, when the server answered 200, the time of that answer with the full body size (the answer means the server holds every byte, which corrects the bias of progress counting bytes handed to the socket buffer rather than acknowledged).
- Steady rate: `mbps = (bytesEnd - bytesBase) * 8 / ((tEnd - tBase) / 1000) / 1e6`, valid only when `tEnd - tBase >= NET_PROBE_MIN_WINDOW_MS = 1_000` and `bytesEnd - bytesBase >= NET_PROBE_MIN_WINDOW_BYTES = 256 * 1024`.
- Fast link fallback: when the server answered 200 but the steady window is too short (the whole body went in under about 2 s), `mbps = NET_PROBE_MAX_BYTES * 8 / (tAnswer / 1000) / 1e6`, the whole request including the ramp. This under-reads, but any link that sends 4 MiB in under 2 s is above 16 Mbps, so the level is "normal" either way.
- Otherwise (aborted at 10 s without a valid window, an error, a non-200 answer) the probe failed: no Mbps.
- Suspension (amended in review, 16.15): a result that settles more than `NET_PROBE_OVERDUE_MS = 2_000` after the 10 s cap (wall time from `send()`) was suspended (iOS freezes JS in the background: progress queues and the timer fires late) and is `failed`, never a rate. The prep also aborts a running probe (`cancelled`) when the app goes to the background.
- The server's `{ bytes, ms }` is kept for telemetry only (16.10); the client's rate decides, because a 10 s abort has no server answer at all.
- Result: `mbps >= CAPTURE_NORMAL_MIN_MBPS` (8) -> "normal" (`probe_normal`), else "weak" (`probe_weak`).
PM defaults: the numeric constants above other than the owner's 10 s and the orchestrator's about 4 MB.

**E8. Endpoint and its absence.** jr_be Edge Function `net-probe` (contract jr_be `specs/024-net-probe/spec.md`, mirrored in 16.6). Headers: `Authorization: Bearer <access token>` from `supabase.auth.getSession()` (no session -> the probe is not started, outcome `failed`), `apikey: <env.supabaseAnonKey>`, `Content-Type: application/octet-stream`. A 404 answer means "not deployed": the module sets a process-wide `absent` flag and never calls again until the app restarts (no retry storm; one call per face-off at most anyway). Any other failure is not retried in the same face-off. The deploy is an owner step; this OTA may ship before it.

**E9. Kill switches.** `match_capture_bitrate_off = true` disables everything (phase 1 rule, unchanged): no probe, no location matching, unmanaged decision. New **inverted** flag `match_capture_probe_off` (PM default: yes, adopted): missing row or `false` = probe allowed; `true` = no probe, location-aware history still on. Same pattern as D9: no migration, flipped with `select admin_set_feature_flag('match_capture_probe_off', true);`, read once per face-off in parallel with the other inputs, bounded by `CAPTURE_FLAG_TIMEOUT_MS = 1_500`, a failed or slow read keeps the last value read in this process (default: not off). Not persisted to disk: the probe never runs on a relaunch re-entry, which reads nothing (D6), so there is nothing for a persisted value to protect.

**E10. Precedence and timing.** A probe that landed in time overrides history (both location-matched and class-level); it is evaluated after the cases that force weak or unmanaged (16.4, step 7b). It must land before the Android hold (the render the camera mounts, section 7.5) to be applied on Android, and before the lock (live step or a clip recording) on iOS. A probe that lands later is not applied for that face-off (phase 1 rule), but is still stored as a history sample (E12), so the next match at this place benefits. The match never waits: until the probe lands, the decision is the base decision (history or first-time rule), exactly as phase 1 would choose. In practice an athlete's probe starts on the weight step, so on Android it applies only if the weight step lasts long enough (about 1.5 s for the base inputs plus up to 10 s); expect many Android athlete probes to be stored for next time rather than applied (measured in P5, 16.13).

**E11. Start as early as possible; the timekeeper prep.** The inputs read and the probe move into a small per-match "capture prep" (`lib/video/capture-prep.ts`, 16.5), keyed by the match id, so it can start before the camera surface exists:
- Athlete: started by `useCaptureBitrate` when the face-off becomes active (weight step, `components/match-flow/match-recorder-surface.tsx:167-172`). The match screen opens straight on the weight step after the Arena accept, so this is the earliest point where the match id and the recording opt-in are known. (Starting at the Arena accept itself would gain well under a second and is not done.)
- Timekeeper (`jits-n2im.33.6`, bitrate half): started by `useTimekeepSheet` (`components/match-flow/crew/use-timekeep-sheet.ts:69`) as soon as the pending request is shown (`request` set), i.e. while the asked person reads the sheet, before they tap Accept. The match screen then mounts the timekeeper's camera on its first render (`components/match-flow/match-flow-wizard.tsx:174`, `cameraStep = "ready"` for a timekeeper face-off), and the hook reads the prep SYNCHRONOUSLY on that render (16.7), so an Android timekeeper whose base inputs landed while the sheet was open (about 1.5 s) records at the decided level, and with the probe if it also landed (up to 10 s on the sheet). Released (probe aborted) on Decline, on a lapsed or closed request (`over`, `:101`), and on the sheet's unmount unless the sheet handed off to the match (Accept succeeded, `respond` at `:190-212` with `leave(...)` at `:199`, or the already-seated `accepted` path at `:116`). A consent refusal (`setConsentRefused(true)`, `:204`, `:243`) does NOT release it: Accept stays available after consent (TK-T8). An unclaimed prep expires after `CAPTURE_PREP_MAX_AGE_MS = 5 * 60 * 1000`. PM default: the probe data on a declined request (at most one probe, about 4.3 MB on cellular) is accepted as the price of applying it on Android.
- Feasibility finding: the sheet is open for a human decision (the request lasts 2 minutes), so the base inputs land before Accept in nearly every case; the probe lands before Accept only if the person takes about 10 s or more. `jits-n2im.33.6` stays open only for its other half (the late 1080p answer recreate, `lib/video/use-capture-quality.ts:64-67`).

**E12. Probe result as a history sample.** A probe with a valid rate (steady or fast-link fallback) is appended to the history like an upload sample: `{ ts, network, cellularGeneration, mbps, cell, source: "probe" }`, with the cell of the face-off (E1) and the network class at the probe's start. Appended whether or not it was applied (E10). A failed probe stores nothing.

**E13. Upload samples carry the face-off cell.** The cell read at the face-off rides on the local upload job (`captureGeoCell`, device-only, never in telemetry). When the upload lands, the sample gets that cell only if the upload's network class equals the decision's network class; otherwise `cell: null` (the athlete left the gym and finished the upload elsewhere, so the rate says nothing about the gym). PM default.

**E14. Privacy and sign-out.** The cell is stored only in AsyncStorage on the device, at about 1 km precision, for at most 14 days; it is never sent to the server, Sentry, breadcrumbs, logs or the probe request. Telemetry carries only booleans (`captureLocationKnown`, `captureHistoryMatchedLocation`). New: the throughput history (key `elo-capture-throughput::v1`) is cleared on sign-out and in the account deletion flow, next to `clearAllDeviceLocations()` (`lib/auth/auth-context.tsx:164`, `:380`; `app/(app)/settings/delete-account.tsx:56`), because it now records where matches happened. PM default.

**Data use (state it).** At most one probe per match per phone: 4 MiB of body (4.19 MB) plus TLS and HTTP overhead, at most about 4.3 MB per face-off, cellular or Wi-Fi. On cellular it runs at every face-off where it is allowed (E6). Example: 30 cellular matches a month is about 130 MB. The response is under 100 bytes. A timekeeper who declines may also spend one probe (E11).

### 16.4 The picker: changes to `lib/video/capture-bitrate.ts`

New constants (named exports, next to `:21-36`):

```ts
export const CAPTURE_PROBE_OFF_FLAG = "match_capture_probe_off";
export const CAPTURE_HISTORY_MAX_SAMPLES = 20;            // was 5 (E3)
export const CAPTURE_LOCATION_MATCH_M = 1_600;            // E2
export const CAPTURE_LOCATION_GRID_DEG = 0.01;            // E1
export const CAPTURE_LOCATION_TIMEOUT_MS = 1_000;         // E5
export const CAPTURE_LOCATION_MAX_AGE_MS = 30 * 60 * 1000;
export const CAPTURE_LOCATION_MAX_ACCURACY_M = 3_000;   // amended in review (16.15)
export const CAPTURE_PROBE_MAX_AGE_MS = 10 * 60 * 1000;   // a probe older than this is ignored by the picker
```

Type changes:

```ts
/** About 1 km grid cell (E1): lat and lng rounded to CAPTURE_LOCATION_GRID_DEG. Device-only. */
export interface CaptureGeoCell { lat: number; lng: number }

export interface ThroughputSample {
  ts: number;
  network: Exclude<CaptureNetworkClass, "none" | "unknown">;
  cellularGeneration: string | null;
  mbps: number;
  cell: CaptureGeoCell | null;          // NEW (null: old sample, or no location)
  source: "upload" | "probe";           // NEW (old samples load as "upload")
}

/** A probe that produced a rate (failures are passed as null). */
export interface CaptureProbeInput {
  mbps: number;                         // > 0, finite
  network: CaptureNetworkClass;         // class at the probe's start
  at: number;                           // epoch ms the probe ended
}

export type CaptureProbeOutcome =
  | "not_needed"  // captureProbeNeeded() was false (incl. location-matched history on wifi/ethernet/other)
  | "off"         // match_capture_probe_off (or the bitrate kill switch)
  | "practice"    // no match id
  | "busy"        // a match video upload was running at start
  | "absent"      // net-probe answered 404 in this process
  | "pending"     // still running when the decision was held (Android) or frozen
  | "applied"     // landed in time and decided the level
  | "stale"       // landed, but older than CAPTURE_PROBE_MAX_AGE_MS when the decision was made (review, 16.15)
  | "ignored"     // landed, but on another class than the face-off's, or unusable (review, 16.15)
  | "failed"      // no session, network error, non-200, too few bytes in the window, 10 s without a valid window
  | "cancelled"   // aborted: upload started, lock, unmount, prep released
  | "reentry";    // relaunch re-entry, nothing read

CaptureBitrateInput gains:
  location: CaptureGeoCell | null;      // null = unknown (E5)
  probe: CaptureProbeInput | null;      // null = none, failed or not landed

CaptureBitrateReason gains: "probe_normal" | "probe_weak".

CaptureBitrateDecision gains:
  locationKnown: boolean;               // input.location !== null
  historyMatchedLocation: boolean;      // step 8 used location-matched samples (>= 2)
  probeMbps: number | null;             // the probe's rate when step 7b decided, else null
  probeOutcome: CaptureProbeOutcome;    // the picker sets "applied" when 7b decided, else "not_needed"; the hook overrides with its state (16.7)
  geoCell: CaptureGeoCell | null;       // DEVICE-ONLY: for the upload job's sample (E13). Never persisted in PersistedCaptureBitrate, never in telemetry.
```

`unmanagedDecision` fills the new fields with `false, false, null, "not_needed", null`.

New pure helpers (exported, unit-tested):

```ts
export function coarseGeoCell(lat: number, lng: number): CaptureGeoCell | null; // null unless finite, |lat|<=90, |lng|<=180; rounds to 2 decimals (Math.round(x*100)/100), normalises -0 to 0
export function geoCellDistanceM(a: CaptureGeoCell, b: CaptureGeoCell): number; // haversine, R = 6_371_000
export function isSameArea(a: CaptureGeoCell | null, b: CaptureGeoCell | null): boolean; // both non-null and distance <= CAPTURE_LOCATION_MATCH_M
/** E6, the input-only part: true when a probe could change this face-off's decision. */
export function captureProbeNeeded(input: Omit<CaptureBitrateInput, "probe">): boolean;
```

`captureProbeNeeded(input)`: let `base = pickCaptureBitrate({ ...input, probe: null })`. Return true only when `!input.disabled && !input.reentry && base.managed && !["reentry","network_unknown","offline","no_internet","cellular_slow_gen"].includes(base.reason)` AND (`base.network === "cellular"` OR (`base.network` in `wifi | ethernet | other` AND `!base.historyMatchedLocation`)). The hook adds the non-pure conditions of E6 (probe flag, match id, upload busy, absent, already probed).

Algorithm (section 6.3, amended; evaluated in this order, first match wins):
1 to 7: unchanged (disabled; ladder and codec; reentry; unknown; none; no_internet; cellular 2g/3g).
7b (NEW). Probe: if `probe !== null` and `probe.network === cls` and `Number.isFinite(probe.mbps) && probe.mbps > 0` and `now - probe.at <= CAPTURE_PROBE_MAX_AGE_MS`, where `now` is the decision's clock (the hook passes the current time, not the time the inputs landed) and a probe stamped after `now` is fresh (no future check; amended in review, 16.15). A landed probe that is rejected sets `probeOutcome` to `stale` (too old) or `ignored` (other class, unusable): `probe.mbps >= CAPTURE_NORMAL_MIN_MBPS` -> `normal`, `probe_normal`; else `weak`, `probe_weak`. Set `probeMbps = probe.mbps`, `probeOutcome = "applied"`. Still compute and report the history fields of step 8 (for telemetry) without letting them decide. A probe on a different class than `cls` is ignored.
8 (AMENDED). History: `classMatching` = the phase 1 filter (`:243-250`) plus `s.cell` handling: if `location !== null`, `matching = classMatching.filter(s => isSameArea(s.cell, location))` and, when `matching.length >= 2`, `historyMatchedLocation = true`; if `location === null`, `matching = classMatching` (phase 1, every place) and `historyMatchedLocation = false`. If `matching.length >= CAPTURE_HISTORY_MIN_SAMPLES`: median rule as before (`history_good` / `history_weak`). With `location !== null` and fewer than 2 matching samples, step 9 runs even if other places have samples (E4).
9, 10: unchanged.
Every decision sets `locationKnown`, `geoCell = location`.

### 16.5 New modules

**`lib/video/capture-location.ts`** (E5):

```ts
export async function readCaptureLocation(): Promise<CaptureGeoCell | null>; // never throws, never asks, bounded by CAPTURE_LOCATION_TIMEOUT_MS
export function __resetCaptureLocationForTests(): void;
```

Imports `expo-location` (already in the 1.0 binary, `~19.0.8`), `lastKnownLocationPermission` / `readLocationPermission`, `validDeviceTag` / `validDeviceReading` / `getDeviceLocationOwner`. Returns `coarseGeoCell(...)` of the first source that yields; the precise coordinates never leave the function.

**`lib/video/net-probe.ts`** (E7, E8):

```ts
export const NET_PROBE_FUNCTION = "net-probe";
export const NET_PROBE_MAX_BYTES = 4 * 1024 * 1024;
export const NET_PROBE_MAX_MS = 10_000;
export const NET_PROBE_RAMP_MS = 1_000;
export const NET_PROBE_MIN_WINDOW_MS = 1_000;
export const NET_PROBE_MIN_WINDOW_BYTES = 256 * 1024;

export type NetProbeStatus = "ok" | "absent" | "failed" | "cancelled";
export interface NetProbeResult {
  status: NetProbeStatus;
  mbps: number | null;              // non-null only when status === "ok"
  method: "steady" | "whole" | null;// E7: steady window, or the fast-link fallback
  bytesSent: number;                // last progress point (or the body size on a 200)
  elapsedMs: number;                // send() to the end (answer, abort or error)
  httpStatus: number | null;
  serverBytes: number | null;       // from the 200 body, telemetry only
  serverMs: number | null;
  network: CaptureNetworkClass;     // passed in: the class at the start
  endedAt: number;                  // epoch ms
}

export interface NetProbeOptions {
  network: CaptureNetworkClass;
  /** Cancel: aborts the XHR; the promise resolves with status "cancelled". */
  signal: { readonly aborted: boolean; addEventListener(type: "abort", cb: () => void): void; removeEventListener(type: "abort", cb: () => void): void };
  /** Injected for tests; defaults: global XMLHttpRequest, Date.now, the Supabase session token, env.supabaseUrl / env.supabaseAnonKey. */
  createXhr?: () => XMLHttpRequest;
  now?: () => number;
  getAccessToken?: () => Promise<string | null>;
  baseUrl?: string;
  anonKey?: string;
}

/** One probe. Never rejects. Resolves within NET_PROBE_MAX_MS plus the token read. */
export function runNetProbe(opts: NetProbeOptions): Promise<NetProbeResult>;
/** True once a 404 was seen in this process (E8). */
export function isNetProbeAbsent(): boolean;
export function __resetNetProbeForTests(): void;
```

Rules: `isNetProbeAbsent()` true -> resolves `{ status: "absent" }` without a request. No token -> `failed` without a request. `xhr.open("POST", baseUrl + "/functions/v1/net-probe")`, the three headers, `xhr.timeout = 0` (the module's own 10 s timer aborts), `xhr.upload.onprogress` records `(now() - t0, e.loaded)`, `onload` reads `xhr.status`: 200 -> parse `{ ok, bytes, ms }` tolerantly (bad JSON keeps `serverBytes/serverMs` null but the rate from progress still counts); 404 -> set `absent`, status `absent`; other -> `failed`. `onerror` / `ontimeout` -> `failed`. 10 s timer -> `xhr.abort()`, then compute from progress (a valid steady window -> `ok`, else `failed`). `signal` abort -> `xhr.abort()`, `cancelled` (no rate, even if a window existed). Every timer and listener is cleared on settle; settles once.

**`lib/video/capture-prep.ts`** (E6, E11, E12): one entry per key, holding the face-off inputs and the probe.

```ts
export interface CaptureInputs {            // moved here from use-capture-bitrate.ts:124-131, extended
  disabled: boolean;
  probeOff: boolean;                        // NEW
  codecs: readonly string[] | null;
  network: CaptureNetworkSnapshot | null;
  history: readonly ThroughputSample[];
  location: CaptureGeoCell | null;          // NEW
  now: number;
}
export interface CapturePrepSnapshot {
  inputs: CaptureInputs | null;             // null until the base reads land
  probe: CaptureProbeInput | null;          // set when a probe produced a rate
  probeOutcome: CaptureProbeOutcome;        // "pending" while running or before the base reads land
}
export interface CapturePrepOptions { matchId: string | null } // null: practice (no probe)

/** Idempotent per key: returns the live entry for this key, or starts one. */
export function startCapturePrep(key: string, opts: CapturePrepOptions): void;
export function getCapturePrepSnapshot(key: string): CapturePrepSnapshot | null; // synchronous; null when no live entry
export function subscribeCapturePrep(key: string, cb: () => void): () => void;
/** Abort the probe (lock, upload started); the entry and its snapshot stay. */
export function stopCapturePrepProbe(key: string): void;
/** Abort the probe and drop the entry (unmount, decline, lapse). */
export function releaseCapturePrep(key: string): void;
export function __resetCapturePrepForTests(): void;
```

Behaviour:
- `startCapturePrep`: if a live entry exists for `key`, nothing. Else create it (timestamp for `CAPTURE_PREP_MAX_AGE_MS`), and start the base reads in parallel: `readCaptureNetwork()`, `loadThroughputHistory()`, `ensureCaptureCodecs()`, `readCaptureBitrateOff()`, NEW `readCaptureProbeOff()`, NEW `readCaptureLocation()`; each wrapped to its safe value as today (`use-capture-bitrate.ts:133-141`; probe off -> last known, default false; location -> null). When all land: set `inputs` (one notify). Then, unless released or stopped: compute `captureProbeNeeded({ platform: Platform.OS, quality: "720p", ...inputs, reentry: false, levels: undefined })` (quality does not affect the outcome; 720p is used only to evaluate it), and the hook-level conditions of E6 in this order, setting `probeOutcome`: `disabled || probeOff` -> `off`; `matchId === null` -> `practice`; not needed -> `not_needed`; `probedMatchIds.has(matchId)` -> `not_needed`; `isNetProbeAbsent()` -> `absent`; `hasActiveVideoUploads()` -> `busy`. Otherwise add `matchId` to the process-wide `probedMatchIds`, run `runNetProbe({ network: captureNetworkClassOf(inputs.network), signal })`, and subscribe to `subscribeUploadActivity` (`video-upload-manager.ts:311-316`): if `hasActiveVideoUploads()` becomes true, abort (`cancelled`).
- Only one probe runs process-wide: starting a probe aborts any other entry's running probe (`cancelled`).
- On a result: `ok` -> `probe = { mbps, network, at: endedAt }`, `probeOutcome` stays `pending` (the hook decides `applied`, 16.7), and `void recordThroughputSample({ ts: endedAt, network, cellularGeneration: inputs.network?.cellularGeneration ?? null, mbps, cell: inputs.location, source: "probe" })` when `network` is a sample class (E12); `absent` -> `absent`; `failed` -> `failed`; `cancelled` -> `cancelled`. One breadcrumb per finished probe (16.10). Notify subscribers.
- Expiry: an entry older than `CAPTURE_PREP_MAX_AGE_MS` that no hook holds is released by a timer (the probe is long over by then).
- Sign-out: `releaseAll` is called next to `clearAllDeviceLocations()` (E14).

**`readCaptureProbeOff()`** lives in `use-capture-bitrate.ts` next to `readCaptureBitrateOff` (`:82-100`), same shape (bounded, keeps the last in-process value), no AsyncStorage.

### 16.6 Client to function contract (mirror of jr_be `specs/024-net-probe/spec.md` section 4)

```
POST {SUPABASE_URL}/functions/v1/net-probe
Authorization: Bearer <user access token>      required; the gateway verifies it (verify_jwt = true)
apikey: <anon key>
Content-Type: application/octet-stream         any value is accepted
Body: 1 to 5_242_880 bytes (5 MiB); the client sends exactly 4_194_304

200 {"ok":true,"bytes":<int>,"ms":<int>}        bytes read; ms from the handler's first body read to the end of the stream
401 {"ok":false,"code":"not_authenticated"}    no bearer, or the token is not a signed-in user (role != authenticated, no sub, exp missing or past, or is_anonymous true)
     (the gateway itself answers 401 for a missing or invalid JWT, with its own body)
405 {"ok":false,"code":"method_not_allowed"}   anything but POST and OPTIONS
408 {"ok":false,"code":"timeout"}              the body was not fully read within 20 s (server read deadline)
413 {"ok":false,"code":"too_large"}            Content-Length or the streamed body over 5 MiB
400 {"ok":false,"code":"read_failed"}          the body stream errored
OPTIONS -> 204, no body, CORS headers
404 (gateway)                                  function not deployed: the client stops probing for the process
```

(Synced 2026-10-26 with the reviewed jr_be contract, `b9e0987`: OPTIONS 204, the 408 read deadline and the stricter 401. The client is unaffected: it only sends POST and already treats every non-200, non-404 answer as `failed`.)

The client treats only 200 as success, 404 as "absent", and everything else as `failed`. It never retries in the same face-off. The response body is not required for the rate.

### 16.7 The hook: changes to `lib/video/use-capture-bitrate.ts`

Signature: `useCaptureBitrate({ active, locked, quality, cameraUp, prepKey })` where NEW `prepKey: string | null` is the match id (null for practice).

- The inputs read (`:133-141`, `readCaptureInputs`) and the `inputs` state (`:178`, `:203-212`) are replaced by the prep: `key = prepKey ?? <a per-mount key from useRef, e.g. "practice:" + counter>`. On the first render where `active` is true and this is NOT a re-entry (`:198-201` unchanged), call `startCapturePrep(key, { matchId: prepKey })` in an effect, and read the snapshot with `React.useSyncExternalStore(subscribe, getSnapshot)` bound to `key`, so a prep that already landed (the timekeeper's, E11) is visible on the very first render. Re-entry reads nothing and never starts a prep (D6 unchanged; `probeOutcome: "reentry"`).
- `live` (`:214-220`): `snapshot?.inputs ? pickCaptureBitrate({ ...snapshot.inputs, probe: snapshot.probe, quality, platform: Platform.OS, reentry: false }) : unmanagedDecision(quality, "pending")`, memoised on `[snapshot, quality]`. Then the hook sets `probeOutcome`: `"applied"` when the picker's reason is `probe_normal` / `probe_weak`, else the snapshot's `probeOutcome`.
- Lock: on the first locked render (the same place the decision freezes, `:233-235`), call `stopCapturePrepProbe(key)` in a layout effect: no probe ever runs during a recording. A probe result that lands after the lock or after the Android hold changes nothing (the frozen and held refs at `:222-232` are unchanged), but it is still stored as a sample (16.5).
- Unmount: `releaseCapturePrep(key)` in the effect cleanup (aborts a running probe). For a timekeeper, the hook's claim keeps the entry alive past the sheet's handoff (the sheet does not release after Accept, E11).
- Inputs landing after the lock are already ignored by the freeze; `lockedRef` stays as it is.

Call site: `components/match-flow/match-recorder-surface.tsx:172` passes `prepKey: matchId ?? null`. `MatchRecorderCamera` (`:48-63`) gains an optional prop `matchId?: string | null` (default null), passed by `components/match-flow/match-flow-wizard.tsx:359` (`matchId={matchId}`); practice (`app/(app)/practice.tsx:197`) passes nothing.

Timekeeper call site: `components/match-flow/crew/use-timekeep-sheet.ts`: an effect on `request` (pending, non-null) calls `startCapturePrep(matchId, { matchId })`; a `handedOffRef` is set true right before `leave(arenaMatchHref(...))` in `respond` on an accepted answer (`:199`) and in `accepted()` (`:116`); `releaseCapturePrep(matchId)` runs on Decline success, in `over()` (`:101`), and in the unmount cleanup unless `handedOffRef.current`. Not on a consent refusal.

### 16.8 Other integration points (file:line)

| # | File | Change |
|---|---|---|
| 1 | `lib/video/capture-bitrate.ts` | 16.4 (constants, types, helpers, step 7b, amended step 8). |
| 2 | `lib/video/capture-bitrate-history.ts:24-46, 82-95, 98-126` | `isValidSample` accepts `cell` (null, absent, or `{lat,lng}` finite in range; re-rounded with `coarseGeoCell` on load, an invalid cell becomes null, the sample is kept) and `source` (absent -> "upload"; anything but "upload"/"probe" -> "upload"). Prune keeps 20. `ThroughputRunInfo` gains `cell: CaptureGeoCell | null`, copied to the sample with `source: "upload"`. NEW `clearThroughputHistory(): Promise<void>` (removes the key, through the same write chain, never throws). |
| 3 | `lib/video/upload-persistence.ts:105-155` | `PendingUploadJob.captureGeoCell?: CaptureGeoCell | null` (device-only, validated with `coarseGeoCell`, bad value -> null, job kept). `PersistedCaptureBitrate` gains `locationKnown: boolean | null`, `historyMatchedLocation: boolean | null`, `probeOutcome: string | null`, `probeMbps: number | null`; `toPersistedCaptureBitrate` accepts their absence (older jobs) as null and NEVER copies `geoCell`. |
| 4 | `lib/video/use-video-recorder.ts:405-414` | Pass `captureGeoCell: recordCaptureRef.current.bitrate?.geoCell ?? null` to `startMatchVideoUpload` next to `captureBitrate`. |
| 5 | `lib/video/video-upload-manager.ts:160-180, 1586-1593, 1338-1344` | `StartUploadParams.captureGeoCell?`; written to the job; passed to `trackUploaded` as `captureGeoCell`. |
| 6 | `lib/video/upload-telemetry.ts:225-241, 244-254, 262-325` | Breadcrumb and `captureExtra` gain the fields of 16.10 (never the cell). `trackUploaded` takes `captureGeoCell` and passes `cell = captureGeoCell` to `throughputSampleFromRun` only when `captureBitrate?.network === networkClassOf(networkType)` (E13), else null. |
| 7 | `lib/auth/auth-context.tsx:164, 380`; `app/(app)/settings/delete-account.tsx:56` | Also `void clearThroughputHistory()` and `releaseAllCapturePreps()` (E14). |
| 8 | `components/match-flow/match-recorder-surface.tsx:48-63, 172`; `match-flow-wizard.tsx:359` | `matchId` prop and `prepKey` (16.7). |
| 9 | `components/match-flow/crew/use-timekeep-sheet.ts` | Timekeeper prep (16.7). |
| 10 | `CHANGELOG.md` | Unreleased, Mobile, **Added**: location-aware capture history and background network probe; new files `lib/video/net-probe.ts`, `lib/video/capture-location.ts`, `lib/video/capture-prep.ts`; flag `match_capture_probe_off`; history cleared on sign-out. |

No UI, copy, token, `app.json`, `app.config.js`, `package.json`, `packages/shared`, metro or babel change. `expo-location` and RN networking are already in the 1.0 binary: OTA-eligible.

### 16.9 Failure modes

| Failure | Behaviour | Telemetry |
|---|---|---|
| Location permission not granted and no stored tag | Location unknown; phase 1 class-level history, then first-time rule. No prompt. | `captureLocationKnown: false` |
| `getLastKnownPositionAsync` throws, is null, too old (> 30 min), too coarse (> 3,000 m, 16.15) or slow (> 1 s total) | Next source (device store), else unknown. | as above |
| Location known, fewer than 2 samples here | "Unknown here": probe if allowed, else first-time rule for the class; other places' samples ignored. | `captureHistoryMatchedLocation: false` |
| Old (phase 1) samples with no cell | Count only when the location is unknown. | n/a |
| Malformed `cell` or `source` in storage | Cell set to null / source "upload"; sample kept. | n/a |
| `net-probe` not deployed (404) | No probe for the rest of the process; base decision. | `captureProbeOutcome: "absent"` |
| 401, 413, 400, 5xx, network error, no session | Probe failed; base decision; no retry this face-off. | `failed` |
| 10 s cap reached with a valid steady window | Rate from the window; applied if in time. | `applied` or `pending` |
| 10 s cap reached without a valid window (very slow or stalled link) | Failed; base decision. (Note: a link that cannot move 256 KiB in the 9 s after the ramp is far below 8 Mbps, but "failed" is kept as failed rather than guessed weak; PM default.) | `failed` |
| Network class changed during the probe | Probe result ignored by the picker (class mismatch); still stored under its start class. | `pending`/`not_needed` per state |
| A match video upload is running at start | Probe skipped. | `busy` |
| An upload starts during the probe | Probe aborted. | `cancelled` |
| Live step / recording starts during the probe | Probe aborted (lock). | `cancelled` |
| Leave, unmount, timekeeper decline or lapse | Probe aborted, prep dropped. | n/a (no upload event) |
| Probe lands after the Android camera mounted | Not applied this face-off (no prop change); stored as a sample. | `pending` |
| Probe lands after the iOS lock | Not applied; stored as a sample. | `pending` |
| Either kill switch read fails or is slow | Last in-process value (default: on, probe allowed). | n/a |
| `match_capture_probe_off = true` | No probe; location-aware history still used. | `off` |
| `match_capture_bitrate_off = true` | Unmanaged (phase 1), no probe. | `off`, reason `disabled` |
| Relaunch re-entry | Weak (D6), nothing read, no probe. | `reentry` |
| Practice | No probe; location-aware history. | `practice` |
| Upload finishes on a different network class than the face-off | Sample stored without a cell. | n/a |
| Sign-out or account deletion | History key removed; preps released. | n/a |

### 16.10 Telemetry fields

"Match video uploaded" `extra` gains (all null when absent; values only, never coordinates): `captureLocationKnown` (boolean|null), `captureHistoryMatchedLocation` (boolean|null), `captureProbeOutcome` (a `CaptureProbeOutcome`|null), `captureProbeMbps` (number rounded to 0.1|null; only when applied). New tag `video.capture.probe` = the outcome or `unknown`. `captureReason` may now be `probe_normal` / `probe_weak`.
Recording-start breadcrumb (`trackCaptureBitrate`, `upload-telemetry.ts:225-241`) gains the same four fields.
NEW breadcrumb per finished probe: category `video.capture`, message `net probe`, data `{ status, mbps (0.1), method, bytesSent, elapsedMs, httpStatus, serverMs, network }`. No Sentry event of its own (volume). Never the cell, the match id or coordinates.

### 16.11 Privacy note

The location used here is a coarse cell (about 1 km), computed on the device from a location the app already has without asking (the OS cache under an existing grant, or the go-live tag the server already accepted). It is stored only in this phone's AsyncStorage, for at most 14 days, removed at sign-out and account deletion, and used only to choose the recording bitrate. It is never sent to the server (the probe request carries only filler bytes and the auth headers), never sent to Sentry or logs, and never shown. Telemetry carries only "a location was known" and "history from this place was used" as booleans. No new permission prompt, no new Info.plist string, no change to the privacy policy's location section is needed (owner to confirm with the jr_be-ynw privacy label work).

### 16.12 Acceptance criteria (bead `jits-n2im.33.7`)

M1. **Picker location tests** (`__tests__/lib/video/capture-bitrate.test.ts`, extended): with a known cell, 2 same-class samples within 1,600 m decide (`historyMatchedLocation: true`); samples 1,700 m away are ignored and the first-time rule applies even when far samples exist (wifi -> `no_history_wifi` normal; cellular -> `no_history_cellular` weak); a sample with `cell: null` never matches a known cell; with location null, class-level history across all places decides exactly as phase 1 (every phase 1 test passes unchanged with `location: null, probe: null`); cell edge case: two readings 50 m apart that round to adjacent cells still match; `coarseGeoCell` rounds, rejects non-finite and out-of-range values, normalises -0; `geoCellDistanceM` against two known reference distances (plus or minus 1 percent).
M2. **Picker probe precedence tests**: a probe of 8.0 Mbps -> `probe_normal`, 7.99 -> `probe_weak`; a probe overrides good and weak location-matched history and class-level history; a probe does NOT override `disabled`, iOS codec unknown, `reentry`, `network_unknown`, `offline`, `no_internet`, `cellular_slow_gen`; a probe on another class than `cls` is ignored; a probe older than 10 min or more than 60 s in the future is ignored; `probeMbps` and `probeOutcome: "applied"` set only when 7b decided; history fields still reported when 7b decided; never below the floor (the property loop of criterion 2 extended with probe and location inputs).
M3. **`captureProbeNeeded` tests**: true on cellular 4g/5g/null with and without location-matched history; true on wifi/ethernet/other without location-matched history (no cell, or fewer than 2 samples here); false on wifi with 2 samples here; false when disabled, reentry, network unknown, offline, no internet, cellular 2g/3g, iOS codecs null or none.
M4. **History store tests**: old samples without `cell`/`source` load as `null`/`"upload"`; an invalid cell becomes null and the sample is kept; cap 20 newest; `clearThroughputHistory` removes the key and is serialised with writes; `throughputSampleFromRun` copies the cell and sets `source: "upload"`.
M5. **Probe module tests** (`__tests__/lib/video/net-probe.test.ts`, Jest fake timers and a fake XHR exposing `upload.onprogress`, `onload`, `onerror`, `abort`): (a) steady rate from progress after 1,000 ms only (points before 1 s change nothing; assert the exact Mbps for a scripted series); (b) the 10 s cap aborts the XHR and still yields `ok` from a valid window; (c) 10 s with less than 256 KiB or less than 1 s of window -> `failed`; (d) a 200 answer adds the final point at the answer time with the full size; (e) a fast 200 under 2 s with too short a window uses the whole-request fallback (`method: "whole"`); (f) 404 -> `absent`, `isNetProbeAbsent()` true, and a second call makes no request; (g) 401, 413, 500 and `onerror` -> `failed`, no retry; (h) `signal` abort -> `xhr.abort()` called, `cancelled`, no rate; (i) no token -> `failed` with no request; (j) the body is exactly 4,194,304 bytes, headers are Authorization, apikey and `Content-Type: application/octet-stream`, URL ends in `/functions/v1/net-probe`; (k) every timer is cleared after settle (`jest.getTimerCount() === 0`) and the promise never rejects.
M6. **Capture prep tests** (`capture-prep.test.ts`): idempotent per key (two starts, one set of reads, one probe); one probe per match id per process (release then start again: no second probe, `not_needed`); probe skipped with the right outcome for `off`, `practice`, `not_needed`, `absent`, `busy`; an upload starting mid-probe aborts it (`cancelled`); starting a probe for key B aborts key A's probe; `stopCapturePrepProbe` aborts but keeps the snapshot; `releaseCapturePrep` aborts and drops it; a successful probe appends exactly one `source: "probe"` sample with the inputs' cell; a failed probe appends nothing; an unclaimed entry expires after 5 min (fake timers).
M7. **Location read tests** (`capture-location.test.ts`): never calls `requestForegroundPermissionsAsync`; permission not granted -> no `getLastKnownPositionAsync` call, falls to the device store; an OS fix older than 30 min or worse than 3,000 m (16.15) is rejected; the store's tag, then reading, are used; nothing -> null; a slow OS call (> 1 s) resolves null or the store value within the bound; the returned value is always rounded to 2 decimals.
M8. **Hook tests** (`use-capture-bitrate.test.ts`, extended): returns the base decision as soon as the base inputs land, then switches to `probe_*` when the probe lands before the lock (iOS); on Android, a probe landing after `cameraUp` does not change the returned decision (held) and its `probeOutcome` is `pending`; a prep that already landed before the first render (timekeeper) is used on that first render (Android: the held value is the decided level, not `pending`); the lock calls `stopCapturePrepProbe`; unmount releases the prep; re-entry starts no prep and no probe; inactive never starts a prep; practice (`prepKey: null`) never probes.
M9. **Timekeeper sheet tests** (`use-timekeep-sheet` tests, extended): the prep starts when a pending request is shown; Decline, lapse/over and unmount without handoff release it; a consent refusal and an accepted answer do not.
M10. **Persistence and telemetry tests**: `captureGeoCell` round-trips through the job and a malformed one loads as null without dropping the job; `PersistedCaptureBitrate` never contains `geoCell`; the uploaded event and both breadcrumbs carry the four new fields and the tag; a test serialises every `call(...)` argument recorded during a full flow (decision, probe breadcrumb, uploaded event) and asserts it contains no `geoCell`, `cell`, `lat` or `lng` key and no coordinate value; the upload sample gets the cell only when the classes match (E13).
M11. **Sign-out**: sign-out and account deletion remove `elo-capture-throughput::v1` and release preps.
M12. **No UI change**: no file under `components/` changes its rendered output (the only `components/` edits are the `matchId` prop pass-through and the timekeeper sheet hook); no new copy string, no new token; the canvas is untouched (`node design/native-screens/drift.mjs` may tag the commits; no board redraw is needed because nothing drawn changes).
M13. `npm run typecheck` (all workspaces) green.
M14. `npm run test` (all workspaces) green, with no existing test weakened (phase 1 picker tests pass with `location: null, probe: null`).
M15. `cd apps/mobile && npx expo export --platform ios --no-bytecode` green.
M16. `CHANGELOG.md` updated; an independent reviewer (not the implementer) has reviewed the diff and the review is clean. The probe paths are verified on hardware in `jits-n2im.33.2` rows P1 to P10 before the production OTA, with `jr_be-1qz.28` deployed to the test project.

### 16.13 Device test additions (appended to `jits-n2im.33.2`)

Preconditions: a preview or development OTA with `jits-n2im.33.7`; `net-probe` (`jr_be-1qz.28`) deployed to the test project; a physical iPhone and Android phone; a dev build log or Sentry breadcrumbs to read `net probe` and `capture bitrate`.

- P1. **Cellular, probe applied (iOS):** Wi-Fi off, start a match, wait about 12 s on the weight step, go live. Expect a `net probe` breadcrumb `status: ok`, `captureReason` `probe_normal` or `probe_weak` matching the measured Mbps, `captureProbeOutcome: applied`. Compare the probe Mbps with a speed test app's upload figure (record both).
- P2. **Wi-Fi, new place (no history here):** clear history; on Wi-Fi at place A, start a match. Expect a probe; reason `probe_*`.
- P3. **Wi-Fi, known place:** after two uploads at place A (or one probe plus one upload), start another match at A. Expect NO probe (`not_needed`), reason `history_*`, `captureHistoryMatchedLocation: true`.
- P4. **Different place:** at place B (more than 2 km from A) on Wi-Fi, start a match. Expect a probe (A's samples ignored), `captureHistoryMatchedLocation: false`.
- P5. **Android athlete timing:** on Android, (i) confirm weight then ready within about 2 s: the probe lands after the camera mounted; expect `pending`, no preview blink, the clip recorded; (ii) wait about 12 s on the weight step: expect `applied`. Record how often (i) happens in normal use.
- P6. **Probe must not compete:** finish a match so its upload is running, then immediately start a practice and a second real match: expect `busy` (no probe while the upload runs); start an upload during a running probe (finish a previous queued retry) if reproducible: expect `cancelled`.
- P7. **No UI and no wait:** on all runs above, confirm nothing new is shown (no spinner, toast, chip or copy) and that Start / the live handoff is never delayed (time from both ready to live is unchanged versus a run with `match_capture_probe_off = true`).
- P8. **Android timekeeper (closes the bitrate half of jits-n2im.33.6):** as a timekeeper on Android, open the Timekeep sheet, wait about 3 s, Accept: expect the decision at its level (not `pending`); repeat waiting about 12 s: expect `applied` on cellular. Decline once: expect the probe aborted (breadcrumb `cancelled` or no completed probe) and no further network use.
- P9. **Kill switches and absence:** `match_capture_probe_off = true`: no probe, `off`, location-aware history still used; `match_capture_bitrate_off = true`: `disabled`, no probe; on a project without `net-probe` deployed: one 404, `absent`, and no second request in the same app process (proxy or function logs).
- P10. **Data and privacy:** with a proxy (Charles or Proxyman) on the test phone: exactly one POST of about 4.19 MB per face-off at most, nothing else added; the request body is filler only and no request (probe, Sentry, Supabase) carries a coordinate or the cell. After sign-out, `elo-capture-throughput::v1` is gone (dev menu AsyncStorage inspector or a debug log).

Record the probe Mbps, the speed test figure, the actual upload throughput of the match and the outcome per row in `jits-n2im.33.2`.

### 16.14 Assumptions and open questions

Assumptions:
1. The access link (gym Wi-Fi or the cellular uplink) is the bottleneck, so a probe to the nearest Edge Function region predicts the upload to the project's storage region well enough. Edge Functions run in the region closest to the caller; uploads go to the project region. Not pinned (`x-region`) in v1; P1 compares probe and real upload throughput.
2. A 4 MiB burst after a 1 s ramp is a fair proxy for a multi-minute upload (shared gym uplinks may vary over time; history still smooths later decisions).
3. Hosted Supabase accepts a 4 MiB request body on Edge Functions (no documented body cap below that was found; jr_be spec 024 makes it a deploy-time check).

Open questions (none block implementation):
- Q5 (owner): accept that a declined timekeeper request may cost one probe (about 4.3 MB on cellular, E11)?
- Q6 (owner): the effective "here" radius is about 1 to 2 km (E1, E2). Tighter (0.005 degree grid, 1,000 m) is possible at a finer stored precision.
- Q7 (owner): on cellular the probe runs at every face-off, even with good history here (owner decision 2). Confirm, or skip it when 2 or more location-matched cellular samples exist (saves about 4.3 MB per match).
- Q8 (ops): rate limiting on `net-probe` is client-side only (one per face-off). If abuse shows in the function logs, add a per-user limit in jr_be (follow-up, no bead yet).

### 16.15 Amendments after the implementation review (2026-10-26)

The independent review of `jits-n2im.33.7` returned FIX-THEN-SHIP. These amendments are built and tested; where they conflict with 16.3 to 16.13, this section wins.

1. **Backgrounding during a probe (MAJOR).** iOS suspends JS in the background: upload progress events queue and the 10 s timer fires late, so a probe measured across a background read as a slow link and was stored as a sample for 14 days. Now the prep subscribes to `AppState` for the probe's life and aborts it (`cancelled`, nothing stored) on `"background"` (not on `"inactive"`), and `net-probe.ts` discards the rate (`failed`) of any result that settles more than `NET_PROBE_OVERDUE_MS = 2_000` past `NET_PROBE_MAX_MS` of wall time since `send()`.
2. **No camera prompt from the codec query (MAJOR, orchestrator decision).** `ensureCaptureCodecs()` now asks `CameraView.getAvailableVideoCodecsAsync` only when the camera permission is already granted (`Camera.getCameraPermissionsAsync()`, which never prompts; the read sits inside the same 2 s bound). Without a grant it returns null and caches nothing, so the first read after the grant still asks. This applies everywhere (the viewfinder hook and the timekeeper sheet's prep): the native helper creates a capture device input, which can raise the iOS camera prompt while the permission is undetermined, and the prep now runs before the camera screen. An iOS viewer without a camera grant records as today (`ios_codec_unknown`), as phase 1 already did on that path.
3. **Probe age (MINOR).** The probe's age is measured against the decision's clock (the current time when the hook decides), not the time the inputs landed, so `CAPTURE_PROBE_MAX_AGE_MS` applies and a probe that lands more than a minute after the inputs is no longer dropped. Probes are exempt from the future check. New outcomes `stale` (too old) and `ignored` (other class or unusable; also the hook's outcome for a landed probe the picker never evaluated).
4. **Approximate fixes (MINOR).** `CAPTURE_LOCATION_MAX_ACCURACY_M = 3_000` (was 1,000), so Android approximate and iOS reduced-accuracy fixes place the coarse cell.
5. **Cells on persisted upload jobs (MINOR, orchestrator decision).** Both sign-out paths and account deletion call `stripCaptureGeoCells()` (`lib/video/upload-persistence.ts`): every persisted upload job keeps its record but loses `captureGeoCell`.
6. **A timekeeper who does not record (MINOR).** When the viewfinder hook finds a prep it did not start (the sheet's, handed off) and is inactive, it stops that prep's probe after `CAPTURE_PREP_INACTIVE_STOP_MS = 2_000` of staying inactive; becoming active within that grace (the match roles and consent loading) clears it. A prep the hook starts itself is never affected. The inputs stay; the decision falls back to the base decision.
7. **Sign-out race (NIT).** The throughput history has a generation counter bumped by `clearThroughputHistory()`. A measurement records the generation it started in (`trackRunStart` for an upload run, `startCapturePrep` for a probe) and `recordThroughputSample(sample, measuredIn)` drops it if a clear happened since.
8. **Probe body (NIT).** The 4 MiB filler string is built per probe and not kept.
9. **Already backgrounded at the start (re-review).** The `AppState` listener fires only on a change, so the prep also checks `AppState.currentState` when the inputs land: `"background"` (not `"inactive"`) skips the probe without sending it, outcome `cancelled`.

Failure table additions: app backgrounded mid-probe: `cancelled`, nothing stored. Probe settled more than 2 s past the cap: `failed`. Landed probe older than 10 min at the decision: `stale`, base decision. iOS without a camera grant: no codec query, `ios_codec_unknown`. Handed-off prep, viewfinder inactive for 2 s: probe `cancelled`.

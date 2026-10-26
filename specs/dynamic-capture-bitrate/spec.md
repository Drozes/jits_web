# Dynamic capture bitrate (mobile, OTA)

Status: build-ready spec (2026-10-26), amended 2026-10-26 after the independent implementation review (section 15). Feature approved by the owner on 2026-10-26 as "Option 1: dynamic capture bitrate" (research doc `research/2026-10-26-video-upload-while-recording.md`, section 3 Tier 1 item 1 and the section 7 review log).
Platform: `apps/mobile` only. No backend change, no native change. Ships by OTA on runtime 1.0.
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

# Adaptive playback quality (progressive MP4): implementation spec

Status: APPROVED SCOPE for implementation, 2026-10-05. Product owner decisions are in section 1.
Beads: jits_web `jits-xfvd.12` (child of jits-xfvd), jr_be `jr_be-du1.8` (child of jr_be-du1).
Author: PM agent (no code). This file is the single source of truth for the two parallel implementers (jr_be, jits_web) and for the independent reviewers. Where this spec and a bead disagree, this spec wins; raise the conflict instead of guessing.


---

## 0. Background and verified facts

- **Renditions are live in prod.** jr_be prod migration head is `20261008100300`. `match_videos.normalized_path` is the 720p-class copy (short edge <= 720, 2 Mbps cap, IDR every 1 s, CFR 30). `match_videos.playback_360_path` is the 360p copy (550 kbps cap, same GOP and timeline). `match_videos.playback_profile` is `pb1-h264-cfr30-g30-720-360` for the current encode and NULL for a legacy rendition (a pre-2026-10-07 native-resolution normalize or faststart remux). Both paths are NULL for rows not yet backfilled, for a few minutes after `analyzed`, and forever when the encode failed. All three columns are readable through the existing `match_videos` SELECT policy (no column grants), and are server-written only. Contract: jr_be `specs/013-chunked-video-pipeline/INTEGRATION.md` section 13 and `docs/rpc-contracts.md` "Playback renditions". The contract's fallback order for the 360 target is `playback_360_path -> normalized_path -> storage_path`.
- **Both renditions share the original's timeline**, so a position in seconds carries unchanged across a quality swap of the same angle, and `sync_offset_ms` applies unchanged across angles.
- **No HLS** until the report 02 section 5 thresholds trip (owner decision 10, jr_be-1qz.19). This feature is the "poor man's ABR" of report 02 section 4.3: choose a progressive MP4 rendition at start, and switch rendition mid-session with the in-place swap the angle switch already uses.
- **jits_web code (origin/development, plus PR #53 which merges first):**
  - Single player: `apps/mobile/lib/match-detail/use-video-playback.ts`. `switchAngle(nextId, atSeconds)` already swaps a URL into the same expo-video player at an exact fractional position, holds the outgoing frame, keeps play intent and rate, and counts the switch as landed only after the resume seek lands. Signed sources are cached per angle id in `signedRef` (fresh for 45 min, `PRESIGN_FRESH_MS`).
  - Signer: `packages/shared/src/api/queries.ts` `getMatchVideoPlaybackResult(supabase, videoId, expiresInSeconds = 3600)` selects `storage_path, normalized_path, thumbnail_url, status, match_id, duration_seconds`, signs `normalized_path ?? storage_path`, and returns `sourceKind: "normalized" | "original"`. The select string is pinned by `packages/shared/src/api/match-detail-view.test.ts` (around line 442). Web callers: `apps/web/app/(app)/matches/[id]/match-detail-content.tsx:33` and `match-video-card.tsx:56` (two-argument calls). Legacy `loadMatchVideoSignedUrl` (queries.ts around 2765) is NOT changed by this spec.
  - Multi-angle player (PR #53, `feat/multi-angle-player`): `apps/mobile/lib/video/multi-angle/use-multi-angle-playback.ts`, one expo-video player per angle slot (max 3), `loadSlot` calls `getMatchVideoPlaybackResult(supabase, id)` (around line 363), `switchTo(id)` with modes swap / seek / dip, telemetry follows the visible slot's player.
  - Telemetry (PR #53 version): `apps/mobile/lib/video/playback-telemetry.ts` (`PlaybackSession`, pure, fed timestamps) and `apps/mobile/lib/video/use-playback-telemetry.ts` (one-shot `NetInfo.fetch()` per session). One Sentry `captureMessage("Video playback session")` per viewing session; tags `video.playback.surface/source/network/outcome/mode`. Only the athlete id rides on the scope (keep it that way).
  - Local preference template: `apps/mobile/lib/match-flow/recording-optin.ts` (module store + `useSyncExternalStore` + AsyncStorage).
  - Server-read template: `get_highlight_flags` RPC, `packages/shared/src/api/highlight-share.ts:252-265` (`getHighlightFlags`), `apps/mobile/lib/highlight/use-highlight-flags.ts`.
  - Video settings screen: `apps/mobile/app/(app)/settings/video.tsx` is a stub (one Plate of lede copy), linked from `settings/index.tsx:128` as "VIDEO SETTINGS". It is listed under `undrawn` in `design/native-screens/board-map.json` (no canvas board draws it).
  - Selection treatment: `apps/mobile/components/ui/elo-system/selection.tsx` (`selectionSurface(selected)`, `SelectCheck`), used as radio options in `components/profile-setup/identity-step.tsx` and `components/admin/member-role-section.tsx` (`StatePressable`, `accessibilityRole="radio"`). DESIGN.md: "Selected is a surface, not a color"; never a Signal Red selection.
  - `@react-native-community/netinfo` and `@react-native-async-storage/async-storage` are already in the field build: everything here is JS only (OTA-eligible).
- **jr_be has no client-readable JSON config.** `feature_flags` is boolean only; Vault-backed `app_setting()` is server-only. This spec adds a small generic `client_settings` table with one key, `playback`.

## 1. Owner decisions (2026-10-05) and PM decisions

Owner (authoritative):
1. A minimal quality choice **Auto / High / Data saver** on the existing Video settings screen, per device (AsyncStorage), built from the ELO RATED Design System.
2. **High** = always the 720p copy. It never steps down adaptively; the hard-failure fallbacks still apply (a missing rendition falls back along the chain at sign time; a player error still gets the existing silent re-sign).
3. **Data saver** = always the 360p copy, with the fallback chain when it is missing.
4. **Auto** = adaptive (start selection plus in-session switching).
5. Initial numbers: step down on one stall > 1 s or 2 stalls within 30 s; step up after 30 s of sustained smooth playback on a good connection; hysteresis; hard cap on switches per session; never switch while paused, seeking, or in slow motion.
6. Ship as an OTA on runtime 0.5.0, JS only.

PM decisions (stated as assumptions in section 13; the owner may override):
- **A1.** Thresholds are server-tunable through `get_playback_settings()` with identical defaults compiled into the client, so the numbers can change without an OTA.
- **A2.** `sourceKind` keeps its meaning as the file family (`normalized` = a slicer-made copy, 720p or 360p; `original` = the upload). The new rendition dimension is separate (`servedRendition`, tag `video.playback.rendition`). This keeps existing `source:normalized` queries meaning "progressive MP4 from the slicer".
- **A3.** On cellular, NetInfo reports `isConnectionExpensive = true` almost always (iOS treats every WWAN path as expensive; Android treats most cellular as metered). Owner decision 2026-10-05: the default is `expensive.cellular = "default"`, so 4G/5G start at 720p and 3G/2G/unknown start at 360p from the `start` table; the `expensive_cellular` reason only occurs if an admin sets `expensive.cellular` to `"360"`. Expensive Wi-Fi (a hotspot) is ignored by default.
- **A4.** Rate 2x: stalls count toward a step-down, but smooth time does not accrue and no step-up happens. Rate below 1 (0.5x, 0.25x): the controller ignores stalls and never switches.
- **A5.** All slots of the multi-angle player follow ONE session level (the visible angle's controller). A "standby angles at 360p" optimisation is out of scope (follow-up).
- **A6.** No in-player quality indicator or control in this release. The choice lives on Video settings only.
- **A7.** The existing recording lede Plate on Video settings stays below the new quality Plate, unchanged (out of scope).
- **A8.** A new "Current app" canvas board for Video settings needs the owner's approval (design/native-screens README rule). Default proposal: draw it as `62-Settings-Video` during `/canvas-sync` after the OTA.

## 2. Settings JSON contract (version 1)

### 2.1 Canonical defaults

This exact JSON is compiled into BOTH the SQL function `public._playback_settings_defaults()` and the client constant `BUILTIN_PLAYBACK_SETTINGS`. The canonical file is jr_be `docs/fixtures/playback-settings-defaults.json`; jits_web mirrors it byte-for-byte at `packages/shared/src/utils/__fixtures__/playback-settings-defaults.json` (same pattern as `angle-sync-contract.json`). A pgTAP test pins the SQL side to the fixture's values and a vitest test pins the client constant to the mirror.

```json
{
  "version": 1,
  "adaptive": true,
  "start": {
    "wifi": "720",
    "ethernet": "720",
    "cellular_5g": "720",
    "cellular_4g": "720",
    "cellular_3g": "360",
    "cellular_2g": "360",
    "cellular_unknown": "360",
    "other": "360",
    "unknown": "360",
    "none": "360"
  },
  "expensive": {
    "cellular": "default",
    "wifi": "default"
  },
  "stepDown": {
    "stallMs": 1000,
    "stallCount": 2,
    "windowMs": 30000,
    "cooldownMs": 2000
  },
  "stepUp": {
    "smoothMs": 30000,
    "smoothMsAfterStepDown": 90000,
    "cooldownMs": 15000,
    "networks": ["wifi", "ethernet", "cellular_5g", "cellular_4g"],
    "onExpensive": true
  },
  "relapse": {
    "windowMs": 60000
  },
  "maxSwitchesPerSession": 4,
  "history": {
    "maxEntries": 8,
    "lookbackMs": 86400000,
    "lookbackCount": 3,
    "minWatchMs": 10000,
    "badStallCount": 2,
    "badStallMs": 3000,
    "badStartupMs": 5000,
    "downgradeIfNewestBad": true,
    "downgradeBadCount": 2,
    "upgradeGoodCount": 3
  }
}
```

### 2.2 Field reference and validation ranges

Rendition values are the strings `"720"` and `"360"` (strings, not numbers, so they read the same in JSON, TypeScript and Sentry tags).

| Field | Type | Range / values | Meaning |
|---|---|---|---|
| `version` | integer | exactly `1` | Contract version. A client that does not know the version ignores the whole object (uses cache or builtin). A breaking change bumps it. |
| `adaptive` | boolean | | Kill switch. `false`: Auto uses the network start rule only (sections 3.2 steps 1 to 3), no history, no in-session switching. High and Data saver are unaffected. |
| `start.<networkKey>` | string | `"720"` or `"360"` | Auto's start rendition per network key (section 2.3). All ten keys are required in the merged result. |
| `expensive.cellular` | string | `"360"` or `"default"` | When NetInfo says the connection is expensive and the key is `cellular_*`: `"360"` forces a 360 start, `"default"` keeps `start.<key>`. |
| `expensive.wifi` | string | `"360"` or `"default"` | Same for `wifi` (tethered hotspot). |
| `stepDown.stallMs` | integer ms | 250 to 10000 | One counted stall lasting at least this long triggers a step-down (`stall_long`). |
| `stepDown.stallCount` | integer | 1 to 10 | This many counted stalls starting within `windowMs` trigger a step-down (`stall_repeat`). |
| `stepDown.windowMs` | integer ms | 5000 to 300000 | Window for `stallCount`. |
| `stepDown.cooldownMs` | integer ms | 0 to 60000 | No step-down within this long after a quality or angle swap landed. |
| `stepUp.smoothMs` | integer ms | 5000 to 600000 | Accrued smooth playing time required for a step-up when the session has not stepped down. |
| `stepUp.smoothMsAfterStepDown` | integer ms | `>= stepUp.smoothMs` and <= 1800000 | Same, after the session stepped down at least once (hysteresis). |
| `stepUp.cooldownMs` | integer ms | 0 to 300000 | Minimum dwell: no step-up within this long after any swap landed. |
| `stepUp.networks` | string array | 0 to 10 distinct network keys | Network keys on which a step-up (and a `history_good` start) is allowed. Empty array disables step-up. |
| `stepUp.onExpensive` | boolean | | Whether a step-up (and `history_good`) may happen while the connection is expensive. |
| `relapse.windowMs` | integer ms | 0 to 600000 | A stall-driven step-down within this long after a step-up landed locks the session at 360 (`lockedLow`). 0 disables the lock. |
| `maxSwitchesPerSession` | integer | 0 to 20 | Hard cap on quality switches per screen session (both directions). 0 disables in-session switching. |
| `history.maxEntries` | integer | 1 to 20 | Entries kept per network key. |
| `history.lookbackMs` | integer ms | 3600000 (1 h) to 2592000000 (30 d) | Entries older than this are ignored. |
| `history.lookbackCount` | integer | 1 to `history.maxEntries` | Newest N in-window entries considered. |
| `history.minWatchMs` | integer ms | 0 to 600000 | An entry counts as "good" only with at least this much watch time. |
| `history.badStallCount` | integer | 1 to 20 | An entry with at least this many stalls is bad. |
| `history.badStallMs` | integer ms | 250 to 60000 | An entry with at least this much stall time is bad. |
| `history.badStartupMs` | integer ms | 1000 to 60000 | An entry whose player startup (`ttffMs - signMs`) is at least this is bad. |
| `history.downgradeIfNewestBad` | boolean | | Start at 360 when the newest considered entry is bad. |
| `history.downgradeBadCount` | integer | 1 to `history.lookbackCount` | Start at 360 when at least this many considered entries are bad. |
| `history.upgradeGoodCount` | integer | 1 to `history.lookbackCount` | Start at 720 (`history_good`) when the network rule said 360, at least this many entries are considered, and all of them are good and ended on 720. |

### 2.3 Network keys

`networkKey(state)` is a pure shared function. Input: the NetInfo state (or null). Output, exactly one of the ten keys:

| NetInfo `type` | `details.cellularGeneration` | key |
|---|---|---|
| `wifi` | | `wifi` |
| `ethernet` | | `ethernet` |
| `cellular` | `5g` / `4g` / `3g` / `2g` | `cellular_5g` / `cellular_4g` / `cellular_3g` / `cellular_2g` |
| `cellular` | null or anything else | `cellular_unknown` |
| `none` | | `none` |
| `unknown`, or state null (not available within the start timeout) | | `unknown` |
| `bluetooth`, `wimax`, `vpn`, `other`, any other string | | `other` |

`isExpensive` = `state.details?.isConnectionExpensive === true` (null state: false). The telemetry `networkType` tag keeps its raw value; the new `networkKey` field and tag use this mapping.

### 2.4 Server merge semantics (exact)

`get_playback_settings()` returns `merge(defaults, stored)` where `stored` is `client_settings.value` for key `playback`:
- Output keys are exactly the keys of `defaults` (unknown top-level keys in `stored` are dropped).
- For each top-level key `k`: if `defaults->k` is a JSON object AND `stored->k` is a JSON object, the result is `defaults->k` overlaid key by key with the entries of `stored->k` whose keys exist in `defaults->k` (unknown nested keys dropped; one level deep only). Otherwise, if `stored ? k`, the result is `stored->k` as is (scalars and arrays are replaced wholesale, e.g. `stepUp.networks`). Otherwise `defaults->k`.
- If no row exists, the value is not an object, or anything raises, the result is `defaults`.
- The function never raises.

The client applies the same merge to a cached or server value against `BUILTIN_PLAYBACK_SETTINGS` and then validates every field (section 2.5), so a bad server value can never break playback.

### 2.5 Client validation (defense in depth)

`parsePlaybackSettings(raw: unknown): { settings: PlaybackSettings; valid: boolean }`:
- `raw` not an object, or `raw.version !== 1`: return builtin, `valid: false` (the caller then tries the next source, section 6.3).
- Otherwise merge per 2.4 against builtin, then check every field against 2.2. A field that fails its type or range is replaced by the builtin value for that field (not clamped). Cross-field rules after that: if `smoothMsAfterStepDown < smoothMs`, use `smoothMs`; if `lookbackCount > maxEntries`, use `maxEntries`; if `downgradeBadCount` or `upgradeGoodCount > lookbackCount`, use `lookbackCount`. `valid: true` even when some fields were replaced.

## 3. Start selection (pure)

### 3.1 Signature

In `packages/shared/src/utils/playback-quality.ts`:

```ts
export type QualityPreference = "auto" | "high" | "data_saver";
export type TargetRendition = "720" | "360";
export type ServedRendition = "720" | "360" | "original";
export type StartReason =
  | "user_high"
  | "user_data_saver"
  | "network_default"
  | "network_unknown"
  | "expensive_cellular"
  | "expensive_wifi"
  | "history_stalls"
  | "history_good";

export interface NetworkSnapshot { type: string | null; cellularGeneration: string | null; isExpensive: boolean }

export function selectStartRendition(input: {
  preference: QualityPreference;
  network: NetworkSnapshot | null;
  history: PlaybackHistoryEntry[];      // entries for networkKey(network), newest first
  settings: PlaybackSettings;
  now: number;
}): { target: TargetRendition; reason: StartReason; networkKey: NetworkKey };
```

Availability is NOT an input: the start target is chosen before signing, and the signer resolves the served file with the fallback chain (section 5.1). The served result (`servedRendition`, and `startFallback = served !== target`) is reported separately in telemetry. This keeps `reason` a clean "why we wanted this" signal. `settings_unavailable` is not a reason: `settingsSource` (server / cache / builtin) is its own telemetry field.

### 3.2 Algorithm (exact order)

1. `preference === "high"`: return `{ "720", user_high }`.
2. `preference === "data_saver"`: return `{ "360", user_data_saver }`.
3. Auto. `key = networkKey(network)`. `target = settings.start[key]`. `reason = (network === null || key === "unknown") ? network_unknown : network_default`.
4. Expensive: if `network?.isExpensive` and `target === "720"`: when `key` starts with `cellular_` and `settings.expensive.cellular === "360"`, set `target = "360"`, `reason = expensive_cellular`; when `key === "wifi"` and `settings.expensive.wifi === "360"`, set `target = "360"`, `reason = expensive_wifi`.
5. If `settings.adaptive === false`: return here.
6. History. `H` = entries with `now - ts <= history.lookbackMs`, newest first, at most `history.lookbackCount`.
   - If `target === "720"` and ((`downgradeIfNewestBad` and `H[0]` is bad) or count(bad in `H`) >= `downgradeBadCount`): `target = "360"`, `reason = history_stalls`.
   - Else if `target === "360"` and `reason` is `network_default`, `expensive_cellular` or `expensive_wifi`, and `key` is in `stepUp.networks`, and (`!network.isExpensive` or `stepUp.onExpensive`), and `H.length >= upgradeGoodCount`, and every entry of the newest `upgradeGoodCount` is good and has `finalRendition === "720"`: `target = "720"`, `reason = history_good`.
7. Return.

### 3.3 Network snapshot at start

The player must not wait long for NetInfo. A module store `apps/mobile/lib/video/quality/network-store.ts` subscribes once (`NetInfo.addEventListener`, lazily on first use) and keeps the latest state synchronously. At open: use the store's latest state; if none yet, `await` `NetInfo.fetch()` raced against a **300 ms** timeout; on timeout or error use `null` (`network_unknown`). The same snapshot is reported as `networkKey` and `connectionExpensive` in telemetry. The existing one-shot `readNetwork` in `use-playback-telemetry.ts` stays for `networkType` / `cellularGeneration` (unchanged semantics).

### 3.4 Per-network history store

- Module: `apps/mobile/lib/video/quality/history-store.ts`. AsyncStorage key **`video-playback:history:v1`**. Value: `{ "v": 1, "byKey": { "<networkKey>": PlaybackHistoryEntry[] } }`, newest first, at most `history.maxEntries` per key (the merged settings at write time). Hydrated once per app run into memory; writes are serialized (in-memory update, then one best-effort `setItem`, never awaited by playback). A corrupt value is discarded and replaced.
- Entry shape:

```ts
interface PlaybackHistoryEntry {
  ts: number;                 // epoch ms when the telemetry session ended
  rendition: ServedRendition; // served at the session's start
  finalRendition: ServedRendition;
  ttffMs: number | null;      // summary.timeToFirstFrameMs
  signMs: number | null;      // summary.signMs
  stallCount: number;
  stallMs: number;
  watchMs: number;
  steppedDown: boolean;       // at least one stall-driven step-down in the session
}
```

- Written from the session summary at flush (`historyEntryFromSummary(summary)`, pure) when ALL hold: `surface === "match"`; `sourceKind !== null` (a file reached the player); `endedInError === false`; `networkKey !== null`; and at least one of `watchMs >= history.minWatchMs`, `stallCount > 0`, `steppedDown`, or player startup `>= history.badStartupMs`. Entries are written for every preference (High and Data saver sessions still measure the network). Continuation sessions (`resumed: true`) are recorded (their `ttffMs` is null).
- **Bad entry:** `steppedDown` OR `stallCount >= badStallCount` OR `stallMs >= badStallMs` OR (`ttffMs !== null` and `ttffMs - (signMs ?? 0) >= badStartupMs`).
- **Good entry:** not bad AND `watchMs >= minWatchMs`.

## 4. In-session controller (pure state machine)

### 4.1 Shape

`packages/shared/src/utils/playback-quality-controller.ts`, a class with no timers and no I/O; every method takes `now` (ms). Unit-tested with a fake clock.

```ts
export type SwitchReason = "stall_long" | "stall_repeat" | "smooth";
export interface QualityDecision { kind: "step_down" | "step_up"; from: TargetRendition; to: TargetRendition; reason: SwitchReason }
export interface Availability { "720": boolean; "360": boolean }
export interface ControllerConditions {
  playing: boolean;       // play intent on AND the player is not paused
  seeking: boolean;       // a user seek or a resume seek hold is active
  rate: number;
  swapInFlight: boolean;  // an angle switch, quality swap or silent re-sign has not landed
  frameShown: boolean;    // the current item has drawn its first frame
  networkKey: NetworkKey | null;
  expensive: boolean;
}

export class QualityController {
  constructor(opts: { settings: PlaybackSettings; preference: QualityPreference; target: TargetRendition; available: Availability; now: number });
  setConditions(c: ControllerConditions, now: number): QualityDecision | null;
  stallStarted(now: number): QualityDecision | null;   // fed ONLY from the telemetry session's counted stalls
  stallEnded(now: number): QualityDecision | null;
  tick(now: number): QualityDecision | null;           // at least every 250 ms while mounted (the player's timeUpdate)
  switchIssued(d: QualityDecision, now: number): void; // level becomes d.to here
  switchLanded(available: Availability, now: number): void;
  switchFailed(now: number): void;                     // the swap was superseded or errored
  angleChanged(available: Availability, now: number): void;
  readonly level: TargetRendition;
  readonly state: { switches: number; stepDowns: number; stepUps: number; lockedLow: boolean; capReached: boolean; steppedDownOnce: boolean };
}
```

The hook applies a returned decision by calling `switchIssued` and starting the swap. At most one decision is outstanding: no decision is returned while `swapInFlight` or between `switchIssued` and `switchLanded` / `switchFailed`.

### 4.2 Guards

`active` = `preference === "auto"` AND `settings.adaptive` AND `settings.maxSwitchesPerSession > 0`. If not active the controller never decides (High, Data saver, kill switch).

`guardDown` (a step-down may be decided, and a stall is counted) = `active` AND `playing` AND `!seeking` AND `rate >= 1` AND `!swapInFlight` AND `frameShown` AND no decision outstanding.

`guardUp` (smooth time accrues, a step-up may be decided) = `guardDown` AND `rate === 1` AND no stall is open.

Stalls that start while `guardDown` is false are ignored by the controller (they still count in telemetry). The telemetry already excludes app-caused waits (user seeks, swaps, resume seeks); the controller uses exactly those counted stalls, so the two can never disagree.

### 4.3 Step-down (level 720 to 360)

Preconditions: `guardDown`; `level === "720"`; `available["360"]`; `switches < maxSwitchesPerSession`; `now - lastLandedAt >= stepDown.cooldownMs` (`lastLandedAt` = the last quality or angle swap landing, or the controller's creation).
- **`stall_long`:** a counted stall is open and `now - stallStart >= stepDown.stallMs`. Checked on every `tick` and on `stallEnded` (a stall that ended at or past the threshold still counts). Fires while the stall is still open, so the lighter file is fetched during the wait.
- **`stall_repeat`:** on `stallStarted`, the number of counted stalls whose start is within `[now - stepDown.windowMs, now]` (including this one) reaches `stepDown.stallCount`.
- On issue: if the most recent step-up landed within `relapse.windowMs` (and `relapse.windowMs > 0`), set `lockedLow = true` for the rest of the screen session.
- If `available["360"]` is false (no 360 copy for this angle), nothing happens (no switch, no count).

### 4.4 Step-up (level 360 to 720)

Preconditions: `guardUp`; `level === "360"`; `available["720"]`; `!lockedLow`; `switches + 2 <= maxSwitchesPerSession` (a step-up always leaves room for one more step-down); `networkKey` in `stepUp.networks`; `!expensive || stepUp.onExpensive`; `now - lastLandedAt >= stepUp.cooldownMs`; `smoothAccrued >= (steppedDownOnce ? stepUp.smoothMsAfterStepDown : stepUp.smoothMs)`. Reason `smooth`.

Smooth accrual: `smoothAccrued` grows by elapsed wall time only while `guardUp` holds (between consecutive events or ticks). It is reset to 0 by a counted stall start, by a landed swap (quality or angle), and by a network key change. Pausing, seeking, slow motion and 2x freeze it (no reset).

Note: Auto sessions that STARTED at 360 (any start reason) may step up under these rules; `history_stalls` starts are not special-cased (they need the same 30 s, or 90 s after a step-down in this session).

### 4.5 Cap, lock and angle changes

- `switches` counts issued quality switches for the screen session (not per telemetry session). When `switches === maxSwitchesPerSession`, `capReached = true` and nothing more is decided.
- `angleChanged(available)`: the stall log and `smoothAccrued` reset; `level`, `switches`, `lockedLow` and `steppedDownOnce` persist; `lastLandedAt` moves to the landing.
- A failed or superseded swap (`switchFailed`): the level stays at `d.to` (the next sign or re-sign uses it), the switch stays counted.

## 5. Integration (jits_web)

### 5.1 Signer: `getMatchVideoPlaybackResult`

New signature, backward compatible:

```ts
export async function getMatchVideoPlaybackResult(
  supabase: Client,
  videoId: string,
  opts: number | { rendition?: TargetRendition; expiresInSeconds?: number } = {},
): Promise<Result<MatchVideoPlayback | null>>;
```

- A number third argument still means `expiresInSeconds` (old signature). Default target `"720"`, which reproduces today's behavior exactly (`normalized_path ?? storage_path`), so both web callers are unchanged.
- Select string becomes exactly `"storage_path, normalized_path, playback_360_path, playback_profile, thumbnail_url, status, match_id, duration_seconds"`. Update the pinned test.
- Path choice via a pure shared helper `pickPlaybackPath(row, target)`:
  - target `"720"`: `normalized_path` (served `"720"`), else `storage_path` (served `"original"`), else `playback_360_path` (served `"360"`; practically unreachable, but never return absent when a playable file exists).
  - target `"360"`: `playback_360_path` (served `"360"`), else `normalized_path` (served `"720"`), else `storage_path` (served `"original"`).
- `MatchVideoPlayback` gains: `target: TargetRendition`, `servedRendition: ServedRendition`, `available: { "720": boolean; "360": boolean }` (non-null `normalized_path` / `playback_360_path`), `playbackProfile: string | null`. `sourceKind` stays `"normalized" | "original"` with `normalized` meaning any slicer copy (720 or 360); update its doc comment.
- The missing-object handling (`VIDEO_FILE_MISSING`) applies to the chosen path only. No automatic retry down the chain on a storage 404 (a 404 means a broken row; keep today's behavior).
- `packages/shared/src/types/database.ts`: add `playback_360_path` and `playback_profile` to `match_videos` Row/Insert/Update, the `client_settings` table, and functions `get_playback_settings: { Args: never; Returns: Json }` and `admin_set_client_setting: { Args: { p_key: string; p_value: Json }; Returns: Json }`. Prefer `npm run db:types` against a local stack with the jr_be branch applied; if that is not available, hand-edit to the exact generated shape, and the reviewer regenerates after the jr_be merge to confirm no diff.

### 5.2 Settings reader

- `packages/shared/src/api/playback-settings.ts`: `getPlaybackSettings(supabase): Promise<Result<unknown>>` calls `supabase.rpc("get_playback_settings")`, mapping errors like `getHighlightFlags`; parsing is the caller's job via `parsePlaybackSettings`. Add `"./api/playback-settings"` to `packages/shared/package.json#exports`. Re-export the new utils from `packages/shared/src/utils/index.ts`.
- `apps/mobile/lib/video/quality/settings-store.ts` (module store): AsyncStorage key **`video-playback:settings:v1`** holding `{ "fetchedAt": number, "value": <raw server JSON> }`. Resolution for a session start, synchronous at open: server value fetched this app run (`settingsSource: "server"`), else a cached value younger than 30 days (`"cache"`), else builtin (`"builtin"`); a value that fails `parsePlaybackSettings` (`valid: false`) is skipped to the next source. A background refresh runs on first use per app run and again when the last fetch is older than 1 h; the start never waits for it. A session keeps the settings it started with.

### 5.3 Preference store

`apps/mobile/lib/video/quality/preference.ts`, cloned from `recording-optin.ts`: AsyncStorage key **`video-playback:quality`**, values `"auto" | "high" | "data_saver"`, default `"auto"` (also for any unknown stored value). Exports `usePlaybackQualityPreference()`, `getPlaybackQualityPreference()`, `setPlaybackQualityPreference(next)`, `hydratePlaybackQualityPreference()`, `__resetPlaybackQualityPreferenceForTests`. A session reads the preference once at start; changing it affects the next video opened.

### 5.4 Single player: generalize the swap

In `use-video-playback.ts`:
- Extract the body of `switchAngle` into an internal `swapSource(nextId, atSeconds, target, kind: "angle" | "quality", decision?)`. `switchAngle(nextId, at)` = `swapSource(nextId, at, controller.level, "angle")` with today's early return when `nextId === activeId`. A quality swap = `swapSource(activeId, currentTimeNow(), decision.to, "quality", decision)`; the same-id early return applies only to `kind === "angle"`.
- Everything that makes the angle switch exact is reused unchanged for a quality swap: exact fractional resume position, held frame (`holdFrame`), play intent and rate carried, `switchGenRef` / `switchSeekLandedRef` landing logic (landed only after the resume seek lands), outgoing player paused before the swap, per-file re-sign budget reset.
- The signed-source cache key becomes `${id}:${target}` (`signedRef`, `presigningRef`); freshness unchanged (`PRESIGN_FRESH_MS`). `presign(ids)` signs at the controller's current level. The first sign, a silent re-sign after an error, `retry`, and an outside navigation all sign at the controller's current level (for a fresh outside navigation, a new start selection runs).
- Angle switches keep the current level: the new angle is signed (or taken from cache) at `controller.level`; if that angle lacks the rendition, the served fallback applies and `controller.angleChanged(available)` records its availability.
- Track the in-flight swap kind in a ref so `frameLanded` calls `telemetry.switchLanded()` for an angle switch and `telemetry.qualitySwitchLanded()` plus `controller.switchLanded(...)` for a quality swap. A quality swap must NOT call `telemetry.switchStarted` and must NOT add to `switchCount` or switch latency.
- Wiring: the controller is created once per screen after the start selection; fed by `telemetry.onStall` (5.6), by `setConditions` on changes of playing, seek hold, rate, loaded / frame shown, swap in flight, and network store changes; `tick` on each `timeUpdate`. Decisions are applied immediately.

### 5.5 Multi-angle player (PR #53) uses the same policy

In `use-multi-angle-playback.ts`, no forked policy:
- Same start selection (3.2), same settings store, same preference, one `QualityController` for the screen, fed by the visible slot's telemetry stalls (the telemetry already follows the visible player) and the visible slot's conditions. `swapInFlight` is true while `switchRef.current` is not done, a dip is up, or the visible slot is reloading.
- `loadSlot` signs at `controller.level` via the shared signer; per-slot `data` carries `servedRendition` and `available`.
- A quality decision applies to every slot: the visible slot reloads in place (`replaceAsync` at the new URL, resume at its current local time with `landAt`, held frame up via the existing `heldFrame` mechanism until the resume seek lands, play intent, rate and mute restored). Other slots reload in the background and are re-seeked by the existing warm nudge / drift re-seek. A slot that is reloading is not switchable (a switch to it waits like an unloaded slot). The quality swap is not an angle switch: it does not call `switchStarted`, does not count in `switchSwapCount` / `switchSeekCount` / `switchDipCount`.
- `angleChanged` is called when `switchTo` lands, with the target slot's availability.

### 5.6 Telemetry

`playback-telemetry.ts` (`PlaybackSession`) gains:
- `setQuality(meta: { qualityPreference; settingsVersion; settingsSource; adaptiveEnabled; networkKey; connectionExpensive; startTarget; startReason })` once per session (a continuation session gets the same meta copied by the hook).
- `renditionAttached(served: ServedRendition, playbackProfile: string | null, now)`: called with every attach. The first one sets `startRendition`, `startFallback` (`served !== startTarget`) and `playbackProfile`; every one closes the current watch segment into the per-rendition bucket and opens the next. `msOn720 + msOn360 + msOnOriginal === watchMs` for match sessions.
- `qualitySwitchStarted(from, to, reason, now)`: calls `expectSwap(now)` (stalls during the swap are exempt, exactly like an angle swap), increments `qualitySwitchCount` and the step-down / step-up counters, appends to `qualitySwitches` (bounded), records the switch start time for latency. At the first `step_down` with a stall reason it freezes `stallsBeforeStepDown` / `stallMsBeforeStepDown` (including a stall still open, measured up to now) and starts counting the "after" figures.
- `qualitySwitchLanded(now)`: latency sample (switch start to first frame of the new file after the resume seek).
- A stall listener: `PlaybackSession` takes an optional `onStall(event: { kind: "start" | "end"; at: number })` invoked exactly where `stallCount` increments and where an open stall closes. `use-playback-telemetry.ts` exposes `onStall(cb): () => void` on `PlaybackTelemetry` and re-wires the listener into every new session (continuations included).
- New `PlaybackTelemetry` methods: `setQuality`, `renditionAttached`, `qualitySwitchStarted`, `qualitySwitchLanded`, `onStall`.

New summary fields (all on `extra`; for `surface: "highlight"` they are null, 0 or false, and the quality tags below (`rendition`, `rendition_final`, `start_reason`, `quality_pref`, `stepdown`, `network_key`, and `startup_bucket`, whose `playerStartupMs` is null) read `none`. `stalled`, `rebuffer_bucket` and `resumed` describe the session itself and are computed for reels too (implementation, review round 1):

| Field | Type | Meaning |
|---|---|---|
| `qualityPreference` | `"auto" \| "high" \| "data_saver" \| null` | Preference at session start. |
| `settingsVersion` | number \| null | `settings.version` used. |
| `settingsSource` | `"server" \| "cache" \| "builtin" \| null` | Where the settings came from. |
| `adaptiveEnabled` | boolean \| null | `settings.adaptive`. |
| `networkKey` | string \| null | Section 2.3 key of the start snapshot. |
| `connectionExpensive` | boolean \| null | Start snapshot `isExpensive`. |
| `startTarget` | `"720" \| "360" \| null` | Start selection target. |
| `startReason` | StartReason \| null | Section 3.1 enum. |
| `startRendition` | `"720" \| "360" \| "original" \| null` | Served at start. |
| `startFallback` | boolean \| null | Served differs from target. Null on a continuation (`resumed: true`), which has no start of its own. |
| `playbackProfile` | string \| null | Start file's `playback_profile` (null = legacy or none). |
| `finalRendition` | ServedRendition \| null | Served at session end. |
| `qualitySwitchCount` | number | Quality switches issued in this telemetry session. |
| `qualityStepDownCount` / `qualityStepUpCount` | number | Split of the above. |
| `qualitySwitches` | array of `{ atMs, from, to, reason }` | `atMs` = ms since session open. First 8 kept. |
| `qualitySwitchesTruncated` | boolean | More than 8 happened. |
| `qualitySwitchLatencyMs` / `qualitySwitchLatencyMaxMs` | number \| null | Median / max landing latency. |
| `msOn720` / `msOn360` / `msOnOriginal` | number | Watch ms by served rendition. |
| `stallsBeforeStepDown` / `stallMsBeforeStepDown` | number \| null | Counted stalls before the first stall-driven step-down; null if none happened. |
| `stallsAfterStepDown` / `stallMsAfterStepDown` | number \| null | Counted stalls after it; null if none happened. |
| `qualityLockedLow` | boolean | Relapse lock hit. |
| `qualityCapReached` | boolean | `maxSwitchesPerSession` reached. |
| `qualitySteppedDown` | boolean | A stall-driven step-down happened in this screen session (this event or an earlier one, so a continuation after a step-down still shows it). |
| `playerStartupMs` | number \| null | `timeToFirstFrameMs - signMs` when both are non-null (pure player startup, precomputed). |

New tags (string values, for Discover filtering; see section 10 on why buckets):

| Tag | Values |
|---|---|
| `video.playback.rendition` | start served rendition: `720`, `360`, `original`, `unknown` (no file reached the player), `none` (reel) |
| `video.playback.rendition_final` | same values, at session end |
| `video.playback.start_reason` | StartReason values, or `none` |
| `video.playback.quality_pref` | `auto`, `high`, `data_saver`, `none` |
| `video.playback.stepdown` | `stall` (at least one stall-driven step-down in this screen session, `qualitySteppedDown`), `none` |
| `video.playback.resumed` | `true` (a continuation after the background), `false` |
| `video.playback.network_key` | the ten keys, or `none` |
| `video.playback.stalled` | `yes` (`stallCount > 0`), `no` |
| `video.playback.startup_bucket` | from `playerStartupMs`: `lt1s`, `1to2s`, `2to2.5s`, `2.5to3s`, `3to5s`, `gte5s`, `none` |
| `video.playback.rebuffer_bucket` | from `rebufferRatio`: `0`, `lt1pct`, `1to2pct`, `2to5pct`, `gte5pct`, `none` |

Existing fields and tags keep their meaning: `switchCount`, `switchLatencyMs` and the switch mode counts are angle switches only; `video.playback.source` is the file family (A2).

### 5.7 Video settings UI

Screen `apps/mobile/app/(app)/settings/video.tsx`. Header unchanged ("Video Settings"). New first Plate, then the existing lede Plate unchanged (A7).

Copy (literal; no em dashes; option labels render uppercase with the classes below):
- Section label: `PLAYBACK QUALITY` (`font-mono tabular-nums text-micro text-ink-3 uppercase tracking-caps-l`, as `member-role-section.tsx`).
- Option 1 label `Auto`, description: `Best quality your connection can hold. Switches to a lighter version if the video stalls.`
- Option 2 label `High`, description: `Always the 720p version. Uses more data.`
- Option 3 label `Data saver`, description: `Always the 360p version. Uses about a quarter of the data.`
- Footer (`font-body text-small text-ink-2 leading-relaxed`): `Applies to match films on this phone. Highlight reels are not affected. If a version is still processing, the closest one that is ready plays.`

Behavior and design-system rules:
- Three stacked full-width option rows (not a compact segmented control: each needs its description). Each is a `StatePressable` with `accessibilityRole="radio"`, `accessibilityState={{ selected }}`, `accessibilityLabel` = the label, `accessibilityHint` = the description, minimum height 44, `rounded-xs border px-4 py-3`, `selectionSurface(selected)`, `SelectCheck` on the selected row (right side), label `font-heading text-small uppercase tracking-caps-l` (`text-ink` selected, `text-ink-2` not), description `font-body text-small text-ink-2`. The group container has `accessibilityRole="radiogroup"` and `accessibilityLabel="Playback quality"`. Gap 8 between rows. No Signal Red anywhere. Tokens come from `apps/mobile/lib/tokens.ts` via the existing classes only (no raw hex).
- Selecting a row saves immediately (`setPlaybackQualityPreference`); no toast, no Save button. Before hydration the rows render with `Auto` selected and update when the stored value lands (no flash of another selection after hydration).
- Put the option row in `apps/mobile/components/settings/quality-option-row.tsx` only if `video.tsx` would otherwise exceed the repo's component size norms; otherwise keep it local to the screen.

### 5.8 Design canvas impact

- `settings/video.tsx` is in `board-map.json` `undrawn`; no "Current app" board changes visually for the player boards (no player UI change, A6). Board `43-Settings` is unchanged (the row label stays "VIDEO SETTINGS").
- The jits_web PR must run `python3 design/native-screens/build-board-map.py` and commit the regenerated `board-map.json` so `--check` stays green (the player boards will gain the new `lib/video/quality/*` and shared util sources).
- After the OTA, `/canvas-sync`. If the owner approves a new board (A8), draw `62-Settings-Video` ("Settings: video") from the shipped code and move `settings/video.tsx` out of `undrawn` in `build-board-map.py`'s `BOARDS` table; else it stays undrawn.

## 6. Backend scope (jr_be)

### 6.1 Migration `supabase/migrations/20261008100400_playback_client_settings.sql`

1. `CREATE TABLE public.client_settings (key text PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]{0,62}$'), value jsonb NOT NULL CHECK (jsonb_typeof(value) = 'object'), description text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`, with `COMMENT`s.
2. Trigger `trg_client_settings_set_updated_at BEFORE UPDATE ... EXECUTE FUNCTION public.set_updated_at()` (exists since `20260215200000`).
3. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY; ALTER TABLE ... FORCE ROW LEVEL SECURITY;` Policy `client_settings_select_authenticated FOR SELECT TO authenticated USING (true)`. No INSERT/UPDATE/DELETE policies. `REVOKE ALL ON public.client_settings FROM anon, authenticated; GRANT SELECT ON public.client_settings TO authenticated;`.
4. `public._playback_settings_defaults() RETURNS jsonb LANGUAGE sql IMMUTABLE` returning the section 2.1 JSON literally. `REVOKE ALL ... FROM PUBLIC, anon, authenticated`.
5. `public._merge_client_settings(p_defaults jsonb, p_stored jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE` implementing section 2.4 exactly. Internal; revoked from PUBLIC, anon, authenticated.
6. `public._validate_playback_settings(p_merged jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE`: NULL when valid, else a message naming the first failing field (e.g. `stepDown.stallMs must be an integer between 250 and 10000`). Implements every type and range of section 2.2 and the cross-field rules (`smoothMsAfterStepDown >= smoothMs`, `lookbackCount <= maxEntries`, `downgradeBadCount <= lookbackCount`, `upgradeGoodCount <= lookbackCount`, `stepUp.networks` elements distinct and known keys, all ten `start` keys present with `"720"`/`"360"`, `version = 1`). Integers must be JSON numbers with no fractional part. Internal; revoked.
7. `public.get_playback_settings() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp`: reads the `playback` row, returns `_merge_client_settings(_playback_settings_defaults(), value)`; returns defaults when there is no row or the value is not an object; `EXCEPTION WHEN OTHERS THEN RETURN _playback_settings_defaults()`. Never raises; needs no athlete. `COMMENT` naming the contract. `REVOKE ALL ... FROM PUBLIC, anon; GRANT EXECUTE ... TO authenticated`.
8. `public.admin_set_client_setting(p_key text, p_value jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp`, cloned from `admin_set_feature_flag` (`20260608000000_admin_platform_roles.sql:315-353`):
   - `IF NOT public.is_admin()`: `RAISE EXCEPTION 'Admin access required' USING ERRCODE = 'P0001', HINT = 'not_admin'`.
   - `p_key` NULL or not in the known set (`'playback'` only for now): `ERRCODE = '22023', HINT = 'invalid_setting'`.
   - `p_value` NULL or not an object: `22023`, `invalid_setting`.
   - For `playback`: unknown top-level or nested keys in `p_value` raise `invalid_setting` (the override must only use known keys); then `_validate_playback_settings(_merge_client_settings(defaults, p_value))` must be NULL, else raise `invalid_setting` with the message.
   - Upsert the row (the override replaces the previous stored value wholesale; pass `{"version": 1}` to reset to defaults). `admin_audit` row: `action 'set_client_setting'`, `target_type 'client_setting'`, `target_id NULL`, `payload jsonb_build_object('key', p_key, 'previous', <old value or null>, 'value', p_value)`.
   - Returns the effective merged settings (`get_playback_settings()` result for `playback`).
   - `REVOKE ALL ... FROM PUBLIC, anon; GRANT EXECUTE ... TO authenticated`.
9. Seed: `INSERT INTO public.client_settings (key, value, description) VALUES ('playback', '{"version": 1}', 'Adaptive playback quality (jits_web 05-adaptive-quality-spec). Overrides only; defaults live in _playback_settings_defaults().') ON CONFLICT (key) DO NOTHING;`. The seed is an empty override on purpose: the compiled defaults govern until an admin overrides a field.

Operator path (document in the RUNBOOK or rpc-contracts): from an admin session call the RPC; from the SQL editor (postgres, bypasses RLS) an `UPDATE public.client_settings SET value = ...` works but skips validation and audit, so prefer the RPC.

### 6.2 pgTAP `supabase/tests/138_playback_client_settings_test.sql`

Must cover at least:
1. Table exists, RLS enabled and forced, SELECT policy for authenticated only; anon cannot SELECT; authenticated cannot INSERT/UPDATE/DELETE.
2. `get_playback_settings()` with the seed equals the fixture JSON exactly (paste the fixture literal in the test).
3. Grants: `anon` lacks EXECUTE on `get_playback_settings` and `admin_set_client_setting`; `authenticated` has both; the three internal helpers are not executable by `authenticated`.
4. Merge: a stored override `{"version":1,"stepDown":{"stallMs":1500},"unknownTop":1,"stepUp":{"networks":["wifi"],"bogus":2}}` (written directly as postgres) yields `stepDown.stallMs = 1500` with the other `stepDown` keys at defaults, `stepUp.networks = ["wifi"]` with other `stepUp` keys at defaults, and no `unknownTop` / `bogus` keys.
5. Fail-soft: stored value deleted returns defaults; a stored non-object is impossible by the CHECK (assert the CHECK throws); a stored value with a wrong type (e.g. `"stepDown": 5`) still returns without raising (the client validates).
6. Setter as non-admin: P0001 `not_admin`.
7. Setter as admin: valid override succeeds, returns merged settings, writes one `admin_audit` row with previous and new value, and bumps `updated_at`.
8. Setter rejects: unknown key `foo` (`invalid_setting`); non-object value; `version: 2`; `stepDown.stallMs: 100` (below range); `stepDown.stallMs: 1000.5` (not integer); `start.wifi: "1080"`; `stepUp.networks: ["wifi","wifi"]`; `stepUp.networks: ["moon"]`; `smoothMsAfterStepDown < smoothMs`; `lookbackCount > maxEntries`; unknown nested key. Each with HINT `invalid_setting`.
9. Reset: `{"version":1}` returns the defaults again.

### 6.3 Docs (jr_be)

- `docs/fixtures/playback-settings-defaults.json`: the section 2.1 JSON (canonical).
- `docs/rpc-contracts.md`: new section "Client settings (playback)" after "Playback renditions": `get_playback_settings()` shape and merge rule, `admin_set_client_setting` errors, the field table (link to this spec), the seed semantics.
- `specs/013-chunked-video-pipeline/INTEGRATION.md`: new `### 13.5 Client rendition choice and playback settings` summarizing the client rule (start selection, fallback chains per target, in-session switching, `get_playback_settings`), pointing to rpc-contracts and this spec. Also replace the section 13 "Client rule" sentence in rpc-contracts ("choose playback_360_path on cellular / data saver / a hidden standby angle / split view") with a pointer to 13.5 so the two never disagree.
- `CLAUDE.md` line ~81: change "NOT yet applied to prod" to "applied to prod 2026-10-05 (head `20261008100300`)" and add one bullet for `client_settings` / `get_playback_settings` (`20261008100400`).

## 7. File ownership (interface split)

The jr_be implementer touches ONLY jr_be. The jits_web implementer touches ONLY jits_web (`packages/shared` and `apps/mobile`, plus the board map). Neither edits the other repo. The shared contract between them is this spec plus the fixture JSON.

**jr_be implementer (bead jr_be-du1.8):**
- `supabase/migrations/20261008100400_playback_client_settings.sql` (new)
- `supabase/tests/138_playback_client_settings_test.sql` (new)
- `docs/fixtures/playback-settings-defaults.json` (new)
- `docs/rpc-contracts.md`, `specs/013-chunked-video-pipeline/INTEGRATION.md`, `CLAUDE.md` (edits per 6.3)
- `CHANGELOG.md` entry

**jits_web implementer (bead jits-xfvd.12):**
- Shared: `packages/shared/src/utils/playback-quality.ts` (types, `BUILTIN_PLAYBACK_SETTINGS`, `parsePlaybackSettings`, `networkKey`, `selectStartRendition`, history entry types and `isBadEntry` / `isGoodEntry` / `historyEntryFromSummary`-compatible pure helpers, `pickPlaybackPath`), `packages/shared/src/utils/playback-quality-controller.ts`, their `*.test.ts`, `packages/shared/src/utils/__fixtures__/playback-settings-defaults.json` (mirror), `packages/shared/src/utils/index.ts` (re-exports), `packages/shared/src/api/playback-settings.ts` (+ test), `packages/shared/src/api/queries.ts` (signer only), `packages/shared/src/api/match-detail-view.test.ts` (select pin and new cases), `packages/shared/src/types/database.ts`, `packages/shared/package.json` (export entry).
- Mobile: `apps/mobile/lib/video/quality/preference.ts`, `settings-store.ts`, `history-store.ts`, `network-store.ts` (new); `apps/mobile/lib/match-detail/use-video-playback.ts`; `apps/mobile/lib/video/multi-angle/use-multi-angle-playback.ts`; `apps/mobile/lib/video/playback-telemetry.ts`; `apps/mobile/lib/video/use-playback-telemetry.ts`; `apps/mobile/app/(app)/settings/video.tsx`; tests under `apps/mobile/__tests__/` mirroring these paths (reuse `__tests__/support/fake-expo-video.ts` from PR #53).
- `design/native-screens/board-map.json` (regenerated only), `CHANGELOG.md`.
- Not touched: `loadMatchVideoSignedUrl`, the web app's code (it keeps calling the signer with two arguments), reel playback (`surface: "highlight"`).

Prerequisite for the jits_web branch: PR #53 merged into `development`; branch from that.

## 8. Acceptance criteria

### 8.1 jr_be (jr_be-du1.8)

1. Migration `20261008100400_playback_client_settings.sql` implements section 6.1 items 1 to 9 exactly; idempotent where the repo's conventions require (`CREATE OR REPLACE`, `IF NOT EXISTS`, `ON CONFLICT DO NOTHING`).
2. `get_playback_settings()` returns the fixture JSON exactly on a fresh database, never raises, is executable by `authenticated` only, and implements the section 2.4 merge.
3. `admin_set_client_setting` is admin-gated (`not_admin`), validates per section 2.2 (`invalid_setting`), audits, and returns the merged settings.
4. pgTAP 138 covers every item of 6.2 and passes; the full `supabase test db` suite passes.
5. Docs per 6.3, including the fixture file and the CLAUDE.md prod-status fix.
6. Independent review clean. Migration applied to prod by hand (`supabase migration list --linked`, `supabase db push --linked --dry-run` lists ONLY `20261008100400`, then `supabase db push --linked`), then verified as a participant: `select get_playback_settings()` returns the defaults.

### 8.2 jits_web (jits-xfvd.12)

1. Shared settings: `BUILTIN_PLAYBACK_SETTINGS` deep-equals the fixture mirror; `parsePlaybackSettings` implements 2.4 and 2.5.
2. Start selection: `selectStartRendition` implements 3.2 exactly; `networkKey` implements 2.3.
3. Controller: `QualityController` implements section 4 (guards, step-down rules, step-up with hysteresis, relapse lock, cap reserving the last switch for a step-down, cooldowns, angle change reset).
4. Signer: new signature backward compatible; default target reproduces today's path choice; fallback chains per 5.1; new fields returned; web callers compile unchanged.
5. Single player: quality swap reuses the angle switch path (`swapSource`); exact position, held frame, play intent and rate kept; landed only after the resume seek; cache per (id, rendition); angle switches keep the level; quality switches are not counted as angle switches; stalls during a quality swap are exempt.
6. Multi-angle player: same start selection, settings, preference and controller (no fork); every slot follows the level; the visible slot reloads in place with a held frame; quality swaps are not angle switches.
7. Telemetry: every field and tag in 5.6 present with the stated semantics; `msOn720 + msOn360 + msOnOriginal === watchMs` for match sessions; reels unaffected (tags `none`).
8. History store, settings store and preference store per 3.4, 5.2 and 5.3; AsyncStorage failures never block or break playback.
9. Video settings screen per 5.7 (copy literal, a11y roles, design-system selection treatment, no red, saves immediately).
10. `board-map.json` regenerated; `build-board-map.py --check` exits 0.
11. Gate green (section 9). Independent review clean. On-device check on one iPhone and one Android: Auto on Wi-Fi starts at 720; Data saver starts at 360 (verify by the Sentry event); with Network Link Conditioner "3G" or "Very Bad Network", Auto steps down within about 1 to 2 s of the first long stall and the picture never shows the poster or frame 0 during the swap; position after the swap is within 2 frames of before; the Sentry event shows the new fields.
12. OTA published on runtime 0.5.0 (production channel) after the jr_be migration is in prod; `/canvas-sync` run (A8).

## 9. Tests and gate commands

### 9.1 jits_web test list (minimum)

Shared (vitest, `packages/shared`):
- `playback-quality.test.ts`: builtin equals fixture; parse: non-object, wrong version, partial override, unknown keys dropped, each out-of-range field replaced, cross-field rules; `networkKey` table (every row of 2.3); `selectStartRendition`: each reason reachable, expensive cellular vs wifi with both `expensive` values, `adaptive: false` skips history, `history_stalls` by newest-bad and by count, entries older than `lookbackMs` ignored, `history_good` only on allowed networks and only with `finalRendition 720` and enough entries; `pickPlaybackPath` for every null combination and both targets; bad/good entry rules.
- `playback-quality-controller.test.ts` (fake clock): `stall_long` fires at exactly `stallMs` while the stall is open; `stall_repeat` at the 2nd stall within 30 s and not at 31 s apart; no decision while paused, seeking, rate 0.5, swap in flight, before first frame, preference high or data_saver, adaptive false, cap 0; rate 2 counts stalls but accrues no smooth time; step-up after 30 s smooth on wifi, not on `cellular_3g`, not on expensive when `onExpensive` false; 90 s after a prior step-down; cooldowns; relapse lock within 60 s; cap reached after 4 and a step-up refused when only one switch remains; `available` false blocks; `angleChanged` resets the stall log and smooth time; `switchFailed` keeps the level.
- `match-detail-view.test.ts`: new select pin; number third argument still sets expiry; target 360 picks 360, falls back to 720 then original; target 720 picks normalized, then original, then 360; returned `servedRendition`, `available`, `playbackProfile`, `sourceKind`.
- `playback-settings.test.ts`: RPC name, error mapping, never throws.

Mobile (jest, `apps/mobile/__tests__`):
- `lib/video/playback-telemetry.test.ts`: per-rendition watch buckets sum to `watchMs`; a quality switch is not counted in `switchCount` or switch latency; stalls during a quality swap are exempt; before/after step-down figures; `qualitySwitches` bounded at 8 with the truncated flag; tag values including buckets; `onStall` fires exactly when `stallCount` increments and on close.
- `lib/video/quality/*.test.ts`: preference default and unknown value, hydration race (a choice before hydration wins); history store bounded per key, newest first, corrupt value discarded, entry written only under 3.4 conditions; settings store resolution order server, cache under 30 days, builtin, invalid skipped.
- `lib/match-detail/use-video-playback` tests (with `fake-expo-video`): a quality decision swaps the same id at the exact position with the held frame; play/pause and rate preserved; an angle switch after a step-down signs the new angle at 360; cache keyed per rendition; a quality swap during an angle switch is not issued.
- `lib/video/multi-angle/use-multi-angle-playback.test.tsx`: slots sign at the controller level; a step-down reloads the visible slot in place without `switchStarted`.
- `screens/settings-video.test.tsx`: renders the three options with literal copy, radio roles and selected state, saves on press.

### 9.2 Gate commands

jits_web (from the repo root, all must pass before commit; the Husky pre-commit hook runs the first two):
```
npm run typecheck
npm run test
npm run build:web            # the shared signer is used by the web app
python3 design/native-screens/build-board-map.py --check
```
jr_be:
```
supabase test db             # full pgTAP suite, including 138
```
(Do not `supabase db reset` the shared local stack without a backup and the owner's OK; apply the new migration with `supabase migration up` or use a disposable stack.)

## 10. Release order

1. jr_be: PR reviewed and merged; migration `20261008100400` applied to prod by hand (8.1 item 6). The mobile client is fail-soft without it (builtin settings), but apply first so `settingsSource: "server"` is real from the first session.
2. jits_web: PR #53 merged; this feature's PR reviewed, gate green, merged to `development`, then to `main` per the repo flow.
3. OTA on runtime 0.5.0 via the `ship-mobile` skill (JS only; no native files, no `app.json` changes). Non-critical update.
4. `/canvas-sync` (section 5.8).
5. Link the saved Sentry queries in jits-xfvd.4 and record the first device session in this bead's notes.

## 11. Reading the new fields in Sentry (draft, input to jits-xfvd.4 and jr_be-1qz.19)

Base filter for every question: `message:"Video playback session" video.playback.surface:match`, and the tag `video.playback.resumed:false` where startup matters (Discover filters tags, not `extra`). Require at least 100 sessions in a bucket before acting on it (report 02 section 5).

Caveat to verify first: Sentry Discover indexes tags, not `extra`. Numeric `extra` fields (`playerStartupMs`, `stallMs`, `watchMs`, `msOn360`) cannot be aggregated (no p75, no sums) in Discover. That is why 5.6 adds bucket tags. Exact p75 and aggregate ratios need an event export (Sentry events API with full payload) and a small script; jits-xfvd.4 owns that tooling. If Discover in this Sentry plan does aggregate custom fields, prefer it and drop the export.

1. **Startup by rendition.** Group by `video.playback.network_key`, `video.playback.rendition`, `video.playback.startup_bucket` (filter `resumed:false`). Trigger (report 02): p75 player startup above 2.5 s on cellular or 2.0 s on Wi-Fi. With buckets: if more than 25% of a cellular bucket's sessions are in `2.5to3s`, `3to5s` or `gte5s`, p75 is above 2.5 s. Compare `rendition:360` against `rendition:720` on the same `network_key`: if 360 starts fast and 720 does not, adaptive MP4 is doing its job; if 360 is also slow, the problem is not bitrate (look at `signMs` and the CDN, report 02).
2. **Rebuffering.** Share of `video.playback.stalled:yes` per network key (trigger: above 10% of sessions). Aggregate rebuffer ratio from the export (`sum(stallMs) / sum(watchMs + stallMs)`; trigger 2% cellular, 1% Wi-Fi). `rebuffer_bucket` shows the distribution without the export.
3. **Did stepping down help?** Filter `video.playback.stepdown:stall`. From the export: compare `stallsAfterStepDown / msOn360` against `stallsBeforeStepDown / (time on 720 before the step)`. If stalls continue at a similar rate after the step to 360, throughput is too low even for 550 kbps (or the stall is not bandwidth): HLS with a lower rung, or delivery fixes, not more MP4 tuning. `qualityLockedLow:true` sessions are the relapse cases: a high share means step-up is too eager (raise `stepUp.smoothMs` via `admin_set_client_setting`, no OTA).
4. **Degradation share (the 25% rule).** Among `network_key:cellular_*` Auto sessions (`quality_pref:auto`), the share with `stepdown:stall` OR `start_reason:history_stalls`. Above 25% means viewers are losing quality that ABR would recover: a UX argument for HLS (jr_be-1qz.19), even if stall numbers look fine. Do NOT count `start_reason:expensive_cellular` here: that is a cautious start policy, not a stall downgrade. Track it separately as "cellular sessions that never reached 720" (`rendition_final:360` with `start_reason:expensive_cellular`); a high share there with low stalls suggests lowering `stepUp.smoothMs` or setting `expensive.cellular` to `default`.
5. **Fallbacks.** `startFallback:true` or `video.playback.rendition:original` with `quality_pref:auto` shows rows without renditions (backfill not run, failed encodes). This is a jr_be-du1.2 backfill signal, not a delivery problem; exclude these sessions from the HLS judgment.
6. **Settings health.** `settingsSource` share: a high `builtin` share after release means the RPC is failing or not deployed.

Decision guide: progressive MP4 with adaptive start and step-down is "good enough" while (1) to (4) stay under thresholds per bucket with 100+ sessions. Any trigger tripping on cellular with `rendition:360` sessions also failing points to HLS (or a lower rung) per jr_be-1qz.19; a trigger tripping only on `rendition:720` points to tuning these settings first.

## 12. Out of scope

HLS; a third rendition; in-player quality UI; standby angles pinned to 360 (A5); web adaptive playback (the web keeps the 720 default through the unchanged signer call); reels; the shared signed URL edge function (`playback-url`, off by decision); jr_be-1qz.19 itself (not touched).

## 13. Assumptions and open questions

Assumptions (defaults chosen; the owner can override without reopening the design):
1. A1 to A8 in section 1.
2. History lookback is 24 h and the "network" is the NetInfo type and generation only (no SSID: reading it needs location permission). A bad session on gym Wi-Fi therefore makes the next Wi-Fi session at home start at 360 within 24 h; it steps up after 30 s if smooth. Accepted as cheap.
3. `maxSwitchesPerSession = 4`, step-up dwell 15 s, step-down cooldown 2 s, relapse window 60 s, post-step-down smooth requirement 90 s: PM picks, tunable server-side.
4. The playback settings are not exposed in the mobile admin screens; operators use the RPC.

Open questions for the owner (minimal):
1. Approve a new "Current app" board `62-Settings-Video` for the Video settings screen (A8)? Default if no answer: leave it undrawn.
2. RESOLVED 2026-10-05: 4G/5G start at 720 (`expensive.cellular = "default"`). Board 62-Settings-Video approved for canvas-sync.

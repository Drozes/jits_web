/**
 * Adaptive playback quality, the pure policy (jits-xfvd.12; spec
 * research/2026-10-multi-angle-playback/05-adaptive-quality-spec.md).
 *
 * Progressive MP4 only ("poor man's ABR"): a 720p-class copy
 * (`normalized_path`) and a 360p copy (`playback_360_path`) share the
 * original's timeline. This module holds everything that decides which one
 * to play and that needs no clock, storage or network of its own:
 *
 *   - the settings contract (`BUILTIN_PLAYBACK_SETTINGS`, the merge of a
 *     server or cached value over it, and per-field validation),
 *   - `networkKey`, the ten buckets a NetInfo state falls into,
 *   - the per-network history entry rules (bad / good),
 *   - `selectStartRendition`, the start rule,
 *   - `pickPlaybackPath`, the signer's fallback chain per target.
 *
 * The in-session state machine is `playback-quality-controller.ts`.
 */

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

export const NETWORK_KEYS = [
  "wifi",
  "ethernet",
  "cellular_5g",
  "cellular_4g",
  "cellular_3g",
  "cellular_2g",
  "cellular_unknown",
  "other",
  "unknown",
  "none",
] as const;
export type NetworkKey = (typeof NETWORK_KEYS)[number];

export const QUALITY_PREFERENCES: readonly QualityPreference[] = ["auto", "high", "data_saver"];

export interface NetworkSnapshot {
  type: string | null;
  cellularGeneration: string | null;
  isExpensive: boolean;
}

export type ExpensiveRule = "360" | "default";

export interface PlaybackSettings {
  version: 1;
  adaptive: boolean;
  start: Record<NetworkKey, TargetRendition>;
  expensive: { cellular: ExpensiveRule; wifi: ExpensiveRule };
  stepDown: { stallMs: number; stallCount: number; windowMs: number; cooldownMs: number };
  stepUp: {
    smoothMs: number;
    smoothMsAfterStepDown: number;
    cooldownMs: number;
    networks: NetworkKey[];
    onExpensive: boolean;
  };
  relapse: { windowMs: number };
  maxSwitchesPerSession: number;
  history: {
    maxEntries: number;
    lookbackMs: number;
    lookbackCount: number;
    minWatchMs: number;
    badStallCount: number;
    badStallMs: number;
    badStartupMs: number;
    downgradeIfNewestBad: boolean;
    downgradeBadCount: number;
    upgradeGoodCount: number;
  };
}

/**
 * The compiled-in defaults. Mirrors jr_be `public._playback_settings_defaults()`
 * and `docs/fixtures/playback-settings-defaults.json` (the jits_web mirror is
 * `__fixtures__/playback-settings-defaults.json`; a test pins this constant to it).
 */
export const BUILTIN_PLAYBACK_SETTINGS: PlaybackSettings = {
  version: 1,
  adaptive: true,
  start: {
    wifi: "720",
    ethernet: "720",
    cellular_5g: "720",
    cellular_4g: "720",
    cellular_3g: "360",
    cellular_2g: "360",
    cellular_unknown: "360",
    other: "360",
    unknown: "360",
    none: "360",
  },
  expensive: { cellular: "default", wifi: "default" },
  stepDown: { stallMs: 1000, stallCount: 2, windowMs: 30000, cooldownMs: 2000 },
  stepUp: {
    smoothMs: 30000,
    smoothMsAfterStepDown: 90000,
    cooldownMs: 15000,
    networks: ["wifi", "ethernet", "cellular_5g", "cellular_4g"],
    onExpensive: true,
  },
  relapse: { windowMs: 60000 },
  maxSwitchesPerSession: 4,
  history: {
    maxEntries: 8,
    lookbackMs: 86400000,
    lookbackCount: 3,
    minWatchMs: 10000,
    badStallCount: 2,
    badStallMs: 3000,
    badStartupMs: 5000,
    downgradeIfNewestBad: true,
    downgradeBadCount: 2,
    upgradeGoodCount: 3,
  },
};

type Json = unknown;
type JsonObject = Record<string, Json>;

function isObject(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * The server's merge (spec 2.4), applied by the client too: output keys are
 * exactly the defaults' keys; an object group overlays the defaults one level
 * deep with known keys only; anything else in `stored` replaces wholesale.
 */
export function mergePlaybackSettings(defaults: JsonObject, stored: unknown): JsonObject {
  const out: JsonObject = {};
  const s = isObject(stored) ? stored : {};
  for (const k of Object.keys(defaults)) {
    const d = defaults[k];
    const v = s[k];
    if (isObject(d) && isObject(v)) {
      const group: JsonObject = { ...d };
      for (const nk of Object.keys(d)) {
        if (Object.prototype.hasOwnProperty.call(v, nk)) group[nk] = v[nk];
      }
      out[k] = group;
    } else if (Object.prototype.hasOwnProperty.call(s, k)) {
      out[k] = v;
    } else {
      out[k] = d;
    }
  }
  return out;
}

const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const isBool = (v: unknown): v is boolean => typeof v === "boolean";
const isRendition = (v: unknown): v is TargetRendition => v === "720" || v === "360";
const isExpensiveRule = (v: unknown): v is ExpensiveRule => v === "360" || v === "default";
const isNetworkKeyValue = (v: unknown): v is NetworkKey =>
  typeof v === "string" && (NETWORK_KEYS as readonly string[]).includes(v);

/** One group's fields: each one that fails its check takes the builtin value. */
function group<T extends object>(raw: unknown, fallback: T, checks: { [K in keyof T]: (v: unknown) => boolean }): T {
  const src = isObject(raw) ? raw : {};
  const out = { ...fallback };
  for (const key of Object.keys(checks) as Array<keyof T>) {
    const v = src[key as string];
    if (checks[key](v)) out[key] = clone(v) as T[keyof T];
  }
  return out;
}

/**
 * Parse a server or cached settings value (spec 2.5). Not an object, or a
 * version other than 1: the builtin with `valid: false` (the caller tries the
 * next source). Otherwise merge over the builtin, replace every field that
 * fails its type or range by the builtin value (never clamped), then apply
 * the cross-field rules; `valid: true` even when fields were replaced.
 */
export function parsePlaybackSettings(raw: unknown): { settings: PlaybackSettings; valid: boolean } {
  const B = BUILTIN_PLAYBACK_SETTINGS;
  if (!isObject(raw) || raw.version !== 1) return { settings: clone(B), valid: false };
  const m = mergePlaybackSettings(B as unknown as JsonObject, raw);

  const startChecks = Object.fromEntries(NETWORK_KEYS.map((k) => [k, isRendition])) as unknown as {
    [K in NetworkKey]: (v: unknown) => boolean;
  };
  const settings: PlaybackSettings = {
    version: 1,
    adaptive: isBool(m.adaptive) ? m.adaptive : B.adaptive,
    start: group(m.start, B.start, startChecks),
    expensive: group(m.expensive, B.expensive, { cellular: isExpensiveRule, wifi: isExpensiveRule }),
    stepDown: group(m.stepDown, B.stepDown, {
      stallMs: (v) => isInt(v, 250, 10000),
      stallCount: (v) => isInt(v, 1, 10),
      windowMs: (v) => isInt(v, 5000, 300000),
      cooldownMs: (v) => isInt(v, 0, 60000),
    }),
    stepUp: group(m.stepUp, B.stepUp, {
      smoothMs: (v) => isInt(v, 5000, 600000),
      smoothMsAfterStepDown: (v) => isInt(v, 0, 1800000),
      cooldownMs: (v) => isInt(v, 0, 300000),
      networks: (v) =>
        Array.isArray(v) && v.length <= 10 && v.every(isNetworkKeyValue) && new Set(v).size === v.length,
      onExpensive: isBool,
    }),
    relapse: group(m.relapse, B.relapse, { windowMs: (v) => isInt(v, 0, 600000) }),
    maxSwitchesPerSession: isInt(m.maxSwitchesPerSession, 0, 20) ? m.maxSwitchesPerSession : B.maxSwitchesPerSession,
    history: group(m.history, B.history, {
      maxEntries: (v) => isInt(v, 1, 20),
      lookbackMs: (v) => isInt(v, 3600000, 2592000000),
      lookbackCount: (v) => isInt(v, 1, 20),
      minWatchMs: (v) => isInt(v, 0, 600000),
      badStallCount: (v) => isInt(v, 1, 20),
      badStallMs: (v) => isInt(v, 250, 60000),
      badStartupMs: (v) => isInt(v, 1000, 60000),
      downgradeIfNewestBad: isBool,
      downgradeBadCount: (v) => isInt(v, 1, 20),
      upgradeGoodCount: (v) => isInt(v, 1, 20),
    }),
  };
  // Cross-field rules, after the per-field pass.
  if (settings.stepUp.smoothMsAfterStepDown < settings.stepUp.smoothMs) {
    settings.stepUp.smoothMsAfterStepDown = settings.stepUp.smoothMs;
  }
  const h = settings.history;
  if (h.lookbackCount > h.maxEntries) h.lookbackCount = h.maxEntries;
  if (h.downgradeBadCount > h.lookbackCount) h.downgradeBadCount = h.lookbackCount;
  if (h.upgradeGoodCount > h.lookbackCount) h.upgradeGoodCount = h.lookbackCount;
  return { settings, valid: true };
}

/** A NetInfo-shaped state (only the fields read here). */
export interface NetInfoLikeState {
  type?: string | null;
  details?: unknown;
}

/** NetInfo state to the snapshot the policy reads (null stays null). */
export function toNetworkSnapshot(state: NetInfoLikeState | null | undefined): NetworkSnapshot | null {
  if (!state) return null;
  const details = isObject(state.details) ? state.details : null;
  const gen = details?.cellularGeneration;
  return {
    type: typeof state.type === "string" ? state.type : null,
    cellularGeneration: typeof gen === "string" ? gen : null,
    isExpensive: details?.isConnectionExpensive === true,
  };
}

/** Spec 2.3: the one network key of a snapshot (or a raw NetInfo state). */
export function networkKey(state: NetworkSnapshot | NetInfoLikeState | null | undefined): NetworkKey {
  if (!state) return "unknown";
  const snap: NetworkSnapshot | null =
    "isExpensive" in state && "cellularGeneration" in state ? (state as NetworkSnapshot) : toNetworkSnapshot(state);
  const type = snap?.type ?? null;
  switch (type) {
    case "wifi":
      return "wifi";
    case "ethernet":
      return "ethernet";
    case "cellular": {
      const g = snap?.cellularGeneration;
      return g === "5g" || g === "4g" || g === "3g" || g === "2g" ? (`cellular_${g}` as NetworkKey) : "cellular_unknown";
    }
    case "none":
      return "none";
    case "unknown":
    case null:
      return "unknown";
    default:
      return "other";
  }
}

export interface PlaybackHistoryEntry {
  /** Epoch ms when the telemetry session ended. */
  ts: number;
  /** Served at the session's start. */
  rendition: ServedRendition;
  finalRendition: ServedRendition;
  /** summary.timeToFirstFrameMs */
  ttffMs: number | null;
  /** summary.signMs */
  signMs: number | null;
  stallCount: number;
  stallMs: number;
  watchMs: number;
  /** At least one stall-driven step-down in the session. */
  steppedDown: boolean;
}

function startupMs(e: Pick<PlaybackHistoryEntry, "ttffMs" | "signMs">): number | null {
  return e.ttffMs == null ? null : e.ttffMs - (e.signMs ?? 0);
}

/** Spec 3.4: a session that stepped down, stalled enough, or started slowly. */
export function isBadEntry(e: PlaybackHistoryEntry, settings: PlaybackSettings): boolean {
  const h = settings.history;
  const startup = startupMs(e);
  return (
    e.steppedDown ||
    e.stallCount >= h.badStallCount ||
    e.stallMs >= h.badStallMs ||
    (startup !== null && startup >= h.badStartupMs)
  );
}

/** Spec 3.4: not bad, and watched long enough to mean something. */
export function isGoodEntry(e: PlaybackHistoryEntry, settings: PlaybackSettings): boolean {
  return !isBadEntry(e, settings) && e.watchMs >= settings.history.minWatchMs;
}

/** The fields of a playback session summary a history entry is built from. */
export interface PlaybackHistorySource {
  surface: string;
  sourceKind: string | null;
  endedInError: boolean;
  networkKey: string | null;
  startRendition: ServedRendition | null;
  finalRendition: ServedRendition | null;
  timeToFirstFrameMs: number | null;
  signMs: number | null;
  stallCount: number;
  stallMs: number;
  watchMs: number;
  /** Stall-driven step-downs happened (the summary's `stallsBeforeStepDown !== null`). */
  steppedDown: boolean;
}

/**
 * Spec 3.4: the entry a finished session leaves for its network key, or null
 * when it says nothing about the network (not a match session, no file
 * reached the player, ended in error, unknown key, or too short and clean).
 */
export function historyEntryFrom(
  s: PlaybackHistorySource,
  settings: PlaybackSettings,
  ts: number,
): { key: NetworkKey; entry: PlaybackHistoryEntry } | null {
  if (s.surface !== "match" || s.sourceKind === null || s.endedInError || s.networkKey === null) return null;
  if (!isNetworkKeyValue(s.networkKey)) return null;
  const entry: PlaybackHistoryEntry = {
    ts,
    rendition: s.startRendition ?? "original",
    finalRendition: s.finalRendition ?? s.startRendition ?? "original",
    ttffMs: s.timeToFirstFrameMs,
    signMs: s.signMs,
    stallCount: s.stallCount,
    stallMs: s.stallMs,
    watchMs: s.watchMs,
    steppedDown: s.steppedDown,
  };
  const startup = startupMs(entry);
  const h = settings.history;
  const worth =
    s.watchMs >= h.minWatchMs || s.stallCount > 0 || s.steppedDown || (startup !== null && startup >= h.badStartupMs);
  return worth ? { key: s.networkKey, entry } : null;
}

export interface StartSelection {
  target: TargetRendition;
  reason: StartReason;
  networkKey: NetworkKey;
}

/** Spec 3.2, in its exact order. Availability is the signer's business, not an input. */
export function selectStartRendition(input: {
  preference: QualityPreference;
  network: NetworkSnapshot | null;
  /** Entries for networkKey(network), newest first. */
  history: PlaybackHistoryEntry[];
  settings: PlaybackSettings;
  now: number;
}): StartSelection {
  const { preference, network, history, settings, now } = input;
  const key = networkKey(network);
  if (preference === "high") return { target: "720", reason: "user_high", networkKey: key };
  if (preference === "data_saver") return { target: "360", reason: "user_data_saver", networkKey: key };

  let target: TargetRendition = settings.start[key];
  let reason: StartReason = network === null || key === "unknown" ? "network_unknown" : "network_default";
  if (network?.isExpensive && target === "720") {
    if (key.startsWith("cellular_") && settings.expensive.cellular === "360") {
      target = "360";
      reason = "expensive_cellular";
    } else if (key === "wifi" && settings.expensive.wifi === "360") {
      target = "360";
      reason = "expensive_wifi";
    }
  }
  if (!settings.adaptive) return { target, reason, networkKey: key };

  const h = settings.history;
  const H = history
    .filter((e) => now - e.ts <= h.lookbackMs)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, h.lookbackCount);
  const badCount = H.filter((e) => isBadEntry(e, settings)).length;
  if (target === "720" && ((h.downgradeIfNewestBad && H.length > 0 && isBadEntry(H[0], settings)) || badCount >= h.downgradeBadCount)) {
    return { target: "360", reason: "history_stalls", networkKey: key };
  }
  if (
    target === "360" &&
    (reason === "network_default" || reason === "expensive_cellular" || reason === "expensive_wifi") &&
    settings.stepUp.networks.includes(key) &&
    (!network?.isExpensive || settings.stepUp.onExpensive) &&
    H.length >= h.upgradeGoodCount &&
    H.slice(0, h.upgradeGoodCount).every((e) => isGoodEntry(e, settings) && e.finalRendition === "720")
  ) {
    return { target: "720", reason: "history_good", networkKey: key };
  }
  return { target, reason, networkKey: key };
}

/** The `match_videos` columns the path choice reads. */
export interface PlaybackPathRow {
  storage_path: string | null;
  normalized_path: string | null;
  playback_360_path: string | null;
}

/**
 * Spec 5.1: the file to sign for a target, along the contract's fallback
 * chain, or null when the row has no playable path at all.
 *   720: normalized_path, else storage_path (original), else playback_360_path
 *   360: playback_360_path, else normalized_path, else storage_path
 */
export function pickPlaybackPath(
  row: PlaybackPathRow,
  target: TargetRendition,
): { path: string; served: ServedRendition } | null {
  const n = row.normalized_path || null;
  const o = row.storage_path || null;
  const l = row.playback_360_path || null;
  if (target === "360") {
    if (l) return { path: l, served: "360" };
    if (n) return { path: n, served: "720" };
    if (o) return { path: o, served: "original" };
    return null;
  }
  if (n) return { path: n, served: "720" };
  if (o) return { path: o, served: "original" };
  if (l) return { path: l, served: "360" };
  return null;
}

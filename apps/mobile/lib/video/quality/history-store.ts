import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  NETWORK_KEYS,
  historyEntryFrom,
  type NetworkKey,
  type PlaybackHistoryEntry,
  type PlaybackSettings,
} from "@jits/shared/utils";
import type { PlaybackSessionSummary } from "@/lib/video/playback-telemetry";

/**
 * Per-network playback history (spec 3.4): how the last few match sessions
 * went on each network key, so Auto can start at 360 after bad sessions or
 * at 720 after good ones. Kept in AsyncStorage as
 * `{ "v": 1, "byKey": { "<networkKey>": PlaybackHistoryEntry[] } }`, newest
 * first, at most `history.maxEntries` per key. Hydrated once per app run;
 * writes update memory first and persist best effort, never awaited by
 * playback. A corrupt stored value is discarded and replaced.
 */
export const PLAYBACK_HISTORY_KEY = "video-playback:history:v1";

type ByKey = Partial<Record<NetworkKey, PlaybackHistoryEntry[]>>;

let byKey: ByKey = {};
let hydrated = false;
let hydrating: Promise<void> | null = null;
let writing: Promise<void> = Promise.resolve();

const SERVED = new Set(["720", "360", "original"]);

function isEntry(e: unknown): e is PlaybackHistoryEntry {
  if (!e || typeof e !== "object") return false;
  const x = e as Record<string, unknown>;
  const numOrNull = (v: unknown) => v === null || (typeof v === "number" && Number.isFinite(v));
  return (
    typeof x.ts === "number" &&
    SERVED.has(x.rendition as string) &&
    SERVED.has(x.finalRendition as string) &&
    numOrNull(x.ttffMs) &&
    numOrNull(x.signMs) &&
    typeof x.stallCount === "number" &&
    typeof x.stallMs === "number" &&
    typeof x.watchMs === "number" &&
    typeof x.steppedDown === "boolean"
  );
}

/** A stored value, or null when it is not a v1 history (then it is replaced). */
export function parseHistory(raw: string | null): ByKey | null {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as { v?: unknown; byKey?: unknown };
    if (!v || v.v !== 1 || !v.byKey || typeof v.byKey !== "object" || Array.isArray(v.byKey)) return null;
    const out: ByKey = {};
    for (const [k, list] of Object.entries(v.byKey as Record<string, unknown>)) {
      if (!(NETWORK_KEYS as readonly string[]).includes(k) || !Array.isArray(list)) return null;
      if (!list.every(isEntry)) return null;
      out[k as NetworkKey] = list;
    }
    return out;
  } catch {
    return null;
  }
}

function persist(): void {
  const snapshot = JSON.stringify({ v: 1, byKey });
  // Serialized: each write starts after the previous one settled.
  writing = writing
    .then(() => AsyncStorage.setItem(PLAYBACK_HISTORY_KEY, snapshot))
    .catch(() => undefined);
}

/** Read the stored history once per app run. Never rejects. */
export function hydratePlaybackHistory(): Promise<void> {
  if (hydrated) return Promise.resolve();
  if (!hydrating) {
    hydrating = AsyncStorage.getItem(PLAYBACK_HISTORY_KEY)
      .then((raw) => {
        if (hydrated) return;
        const parsed = parseHistory(raw);
        // Entries recorded before the read landed stay on top.
        const merged: ByKey = { ...(parsed ?? {}) };
        for (const [k, list] of Object.entries(byKey) as Array<[NetworkKey, PlaybackHistoryEntry[]]>) {
          merged[k] = [...list, ...(merged[k] ?? [])];
        }
        byKey = merged;
        hydrated = true;
        if (parsed === null) persist();
      })
      .catch(() => {
        hydrated = true;
      });
  }
  return hydrating;
}

/** Entries for one network key, newest first. */
export function getPlaybackHistory(key: NetworkKey): PlaybackHistoryEntry[] {
  return [...(byKey[key] ?? [])];
}

/** Add one entry on top of its key's list, bounded by `history.maxEntries`. */
export function recordPlaybackHistory(key: NetworkKey, entry: PlaybackHistoryEntry, settings: PlaybackSettings): void {
  const list = [entry, ...(byKey[key] ?? [])].sort((a, b) => b.ts - a.ts).slice(0, settings.history.maxEntries);
  byKey = { ...byKey, [key]: list };
  persist();
}

/** The session summary's fields a history entry needs (pure). */
export function historyEntryFromSummary(
  s: PlaybackSessionSummary,
  settings: PlaybackSettings,
  ts: number,
): { key: NetworkKey; entry: PlaybackHistoryEntry } | null {
  return historyEntryFrom(
    {
      surface: s.surface,
      sourceKind: s.sourceKind,
      endedInError: s.endedInError,
      networkKey: s.networkKey,
      startRendition: s.startRendition,
      finalRendition: s.finalRendition,
      timeToFirstFrameMs: s.timeToFirstFrameMs,
      signMs: s.signMs,
      stallCount: s.stallCount,
      stallMs: s.stallMs,
      watchMs: s.watchMs,
      steppedDown: s.stallsBeforeStepDown !== null,
    },
    settings,
    ts,
  );
}

/** Write a finished session's entry when it qualifies (spec 3.4). Never throws. */
export function recordSessionHistory(s: PlaybackSessionSummary, settings: PlaybackSettings, ts = Date.now()): void {
  try {
    const built = historyEntryFromSummary(s, settings, ts);
    if (built) recordPlaybackHistory(built.key, built.entry, settings);
  } catch {
    /* history must never break playback */
  }
}

/** Tests only. */
export function __resetPlaybackHistoryForTests(): void {
  byKey = {};
  hydrated = false;
  hydrating = null;
  writing = Promise.resolve();
}

/** Tests only: wait for the queued writes. */
export function __flushPlaybackHistoryWritesForTests(): Promise<void> {
  return writing;
}

import AsyncStorage from "@react-native-async-storage/async-storage";
import { BUILTIN_PLAYBACK_SETTINGS, type PlaybackHistoryEntry } from "@jits/shared/utils";
import {
  PLAYBACK_HISTORY_KEY,
  __flushPlaybackHistoryWritesForTests,
  __resetPlaybackHistoryForTests,
  getPlaybackHistory,
  historyEntryFromSummary,
  hydratePlaybackHistory,
  parseHistory,
  recordPlaybackHistory,
  recordSessionHistory,
} from "@/lib/video/quality/history-store";
import { PlaybackSession } from "@/lib/video/playback-telemetry";

const S = BUILTIN_PLAYBACK_SETTINGS;
const entry = (ts: number, over: Partial<PlaybackHistoryEntry> = {}): PlaybackHistoryEntry => ({
  ts,
  rendition: "720",
  finalRendition: "720",
  ttffMs: 1000,
  signMs: 300,
  stallCount: 0,
  stallMs: 0,
  watchMs: 30_000,
  steppedDown: false,
  ...over,
});

beforeEach(async () => {
  await AsyncStorage.clear();
  __resetPlaybackHistoryForTests();
});

describe("playback history store", () => {
  it("keeps entries per network key, newest first, bounded by history.maxEntries", async () => {
    await hydratePlaybackHistory();
    for (let i = 0; i < 10; i += 1) recordPlaybackHistory("wifi", entry(1000 + i), S);
    recordPlaybackHistory("cellular_4g", entry(5), S);
    const wifi = getPlaybackHistory("wifi");
    expect(wifi).toHaveLength(8);
    expect(wifi.map((e) => e.ts)).toEqual([1009, 1008, 1007, 1006, 1005, 1004, 1003, 1002]);
    expect(getPlaybackHistory("cellular_4g")).toHaveLength(1);
    expect(getPlaybackHistory("none")).toEqual([]);
    await __flushPlaybackHistoryWritesForTests();
    const stored = JSON.parse((await AsyncStorage.getItem(PLAYBACK_HISTORY_KEY))!);
    expect(stored.v).toBe(1);
    expect(stored.byKey.wifi).toHaveLength(8);
  });

  it("hydrates a stored history once per app run", async () => {
    await AsyncStorage.setItem(PLAYBACK_HISTORY_KEY, JSON.stringify({ v: 1, byKey: { wifi: [entry(7)] } }));
    await hydratePlaybackHistory();
    expect(getPlaybackHistory("wifi")).toEqual([entry(7)]);
  });

  it.each([
    ["not JSON", "{"],
    ["a wrong version", JSON.stringify({ v: 2, byKey: {} })],
    ["an unknown key", JSON.stringify({ v: 1, byKey: { moon: [] } })],
    ["a malformed entry", JSON.stringify({ v: 1, byKey: { wifi: [{ ts: "x" }] } })],
    ["an array", JSON.stringify([])],
  ])("discards and replaces a corrupt value (%s)", async (_name, raw) => {
    await AsyncStorage.setItem(PLAYBACK_HISTORY_KEY, raw);
    await hydratePlaybackHistory();
    expect(getPlaybackHistory("wifi")).toEqual([]);
    await __flushPlaybackHistoryWritesForTests();
    expect(JSON.parse((await AsyncStorage.getItem(PLAYBACK_HISTORY_KEY))!)).toEqual({ v: 1, byKey: {} });
    expect(parseHistory(raw)).toBeNull();
  });

  it("an entry recorded before the read landed stays on top", async () => {
    await AsyncStorage.setItem(PLAYBACK_HISTORY_KEY, JSON.stringify({ v: 1, byKey: { wifi: [entry(7)] } }));
    const pending = hydratePlaybackHistory();
    recordPlaybackHistory("wifi", entry(9), S);
    await pending;
    expect(getPlaybackHistory("wifi").map((e) => e.ts)).toEqual([9, 7]);
  });

  it("a failing storage never throws", async () => {
    jest.spyOn(AsyncStorage, "getItem").mockRejectedValueOnce(new Error("disk"));
    jest.spyOn(AsyncStorage, "setItem").mockRejectedValue(new Error("full"));
    await expect(hydratePlaybackHistory()).resolves.toBeUndefined();
    expect(() => recordPlaybackHistory("wifi", entry(1), S)).not.toThrow();
    await expect(__flushPlaybackHistoryWritesForTests()).resolves.toBeUndefined();
    expect(getPlaybackHistory("wifi")).toHaveLength(1);
    jest.restoreAllMocks();
  });
});

describe("historyEntryFromSummary / recordSessionHistory (spec 3.4 conditions)", () => {
  const QMETA = {
    qualityPreference: "high" as const,
    settingsVersion: 1,
    settingsSource: "builtin" as const,
    adaptiveEnabled: true,
    networkKey: "wifi",
    connectionExpensive: false,
    startTarget: "720" as const,
    startReason: "user_high" as const,
  };
  function session(opts: { watchMs?: number; surface?: "match" | "highlight"; meta?: boolean; error?: boolean; file?: boolean } = {}) {
    const s = new PlaybackSession({ surface: opts.surface ?? "match", videoId: "v", angle: null, angleCount: null }, 0);
    if (opts.meta !== false) s.setQuality(QMETA);
    s.playIntent(true, 0);
    if (opts.file !== false) {
      s.sourceAttached(opts.surface === "highlight" ? "highlight" : "normalized", 300);
      s.renditionAttached("720", null, 300);
      s.playing(true, 1000);
    }
    if (opts.error) s.error("boom");
    return s.summary(1000 + (opts.watchMs ?? 20_000), "unmount");
  }

  it("writes an entry for a match session of every preference (High measures the network too)", () => {
    expect(historyEntryFromSummary(session(), S, 42)).toEqual({
      key: "wifi",
      entry: {
        ts: 42,
        rendition: "720",
        finalRendition: "720",
        ttffMs: 1000,
        signMs: 300,
        stallCount: 0,
        stallMs: 0,
        watchMs: 20_000,
        steppedDown: false,
      },
    });
  });

  it.each([
    ["a reel", { surface: "highlight" as const }],
    ["no file reached the player", { file: false }],
    ["ended in error", { error: true }],
    ["no network key (no quality meta)", { meta: false }],
    ["too short and clean", { watchMs: 5000 }],
  ])("writes nothing for %s", async (_name, opts) => {
    recordSessionHistory(session(opts), S);
    expect(getPlaybackHistory("wifi")).toEqual([]);
  });

  it("recordSessionHistory writes a qualifying session", () => {
    recordSessionHistory(session(), S, 77);
    expect(getPlaybackHistory("wifi")).toHaveLength(1);
  });
});

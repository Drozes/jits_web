import AsyncStorage from "@react-native-async-storage/async-storage";

const mockGetSettings = jest.fn();
jest.mock("@jits/shared/api/playback-settings", () => ({
  getPlaybackSettings: (...a: unknown[]) => mockGetSettings(...a),
}));
jest.mock("@/lib/supabase/client", () => ({ supabase: { tag: "client" } }));

import { BUILTIN_PLAYBACK_SETTINGS } from "@jits/shared/utils";
import {
  PLAYBACK_SETTINGS_KEY,
  SETTINGS_CACHE_MAX_AGE_MS,
  SETTINGS_REFRESH_MS,
  __resetPlaybackSettingsStoreForTests,
  hydratePlaybackSettingsCache,
  refreshPlaybackSettings,
  resolvePlaybackSettings,
} from "@/lib/video/quality/settings-store";

const NOW = 1_800_000_000_000;

beforeEach(async () => {
  await AsyncStorage.clear();
  __resetPlaybackSettingsStoreForTests();
  mockGetSettings.mockReset();
});

async function cache(value: unknown, fetchedAt: number) {
  await AsyncStorage.setItem(PLAYBACK_SETTINGS_KEY, JSON.stringify({ fetchedAt, value }));
  await hydratePlaybackSettingsCache();
}

describe("playback settings store: resolution order", () => {
  it("builtin with nothing fetched or cached", async () => {
    await hydratePlaybackSettingsCache();
    expect(resolvePlaybackSettings(NOW)).toEqual({ settings: BUILTIN_PLAYBACK_SETTINGS, source: "builtin" });
  });

  it("a cached value younger than 30 days", async () => {
    await cache({ version: 1, maxSwitchesPerSession: 2 }, NOW - SETTINGS_CACHE_MAX_AGE_MS + 1);
    const r = resolvePlaybackSettings(NOW);
    expect(r.source).toBe("cache");
    expect(r.settings.maxSwitchesPerSession).toBe(2);
  });

  it("not a cached value 30 days old", async () => {
    await cache({ version: 1, maxSwitchesPerSession: 2 }, NOW - SETTINGS_CACHE_MAX_AGE_MS);
    expect(resolvePlaybackSettings(NOW).source).toBe("builtin");
  });

  it("the server value fetched this run beats the cache, and is cached", async () => {
    await cache({ version: 1, maxSwitchesPerSession: 2 }, NOW - 1000);
    mockGetSettings.mockResolvedValue({ ok: true, data: { version: 1, maxSwitchesPerSession: 6 } });
    await refreshPlaybackSettings(NOW);
    expect(mockGetSettings).toHaveBeenCalledWith({ tag: "client" });
    const r = resolvePlaybackSettings(NOW);
    expect(r.source).toBe("server");
    expect(r.settings.maxSwitchesPerSession).toBe(6);
    const stored = JSON.parse((await AsyncStorage.getItem(PLAYBACK_SETTINGS_KEY))!);
    expect(stored.value).toEqual({ version: 1, maxSwitchesPerSession: 6 });
  });

  it("an invalid server value is skipped to the cache (and not cached)", async () => {
    await cache({ version: 1, maxSwitchesPerSession: 2 }, NOW - 1000);
    mockGetSettings.mockResolvedValue({ ok: true, data: { version: 2 } });
    await refreshPlaybackSettings(NOW);
    expect(resolvePlaybackSettings(NOW)).toMatchObject({ source: "cache" });
    expect(JSON.parse((await AsyncStorage.getItem(PLAYBACK_SETTINGS_KEY))!).value).toEqual({ version: 1, maxSwitchesPerSession: 2 });
  });

  it("an invalid cached value is skipped to the builtin", async () => {
    await cache("nope", NOW - 1000);
    expect(resolvePlaybackSettings(NOW).source).toBe("builtin");
  });

  it("a corrupt cache entry is ignored", async () => {
    await AsyncStorage.setItem(PLAYBACK_SETTINGS_KEY, "{not json");
    await hydratePlaybackSettingsCache();
    expect(resolvePlaybackSettings(NOW).source).toBe("builtin");
  });

  it("a failed fetch keeps the cache and never rejects", async () => {
    await cache({ version: 1 }, NOW - 1000);
    mockGetSettings.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "x" } });
    await expect(refreshPlaybackSettings(NOW)).resolves.toBeUndefined();
    expect(resolvePlaybackSettings(NOW).source).toBe("cache");
    mockGetSettings.mockRejectedValue(new Error("boom"));
    await expect(refreshPlaybackSettings(NOW + SETTINGS_REFRESH_MS)).resolves.toBeUndefined();
  });
});

describe("playback settings store: refresh cadence", () => {
  it("fetches on first use, then again only after 1 h", async () => {
    mockGetSettings.mockResolvedValue({ ok: true, data: { version: 1 } });
    await refreshPlaybackSettings(NOW);
    await refreshPlaybackSettings(NOW + SETTINGS_REFRESH_MS - 1);
    expect(mockGetSettings).toHaveBeenCalledTimes(1);
    await refreshPlaybackSettings(NOW + SETTINGS_REFRESH_MS);
    expect(mockGetSettings).toHaveBeenCalledTimes(2);
  });

  it("a fetch in flight is shared", async () => {
    let resolve: (v: unknown) => void = () => undefined;
    mockGetSettings.mockReturnValue(new Promise((r) => (resolve = r)));
    const a = refreshPlaybackSettings(NOW);
    const b = refreshPlaybackSettings(NOW);
    expect(a).toBe(b);
    resolve({ ok: true, data: { version: 1 } });
    await a;
    expect(mockGetSettings).toHaveBeenCalledTimes(1);
  });
});

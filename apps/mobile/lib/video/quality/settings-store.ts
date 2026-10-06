import AsyncStorage from "@react-native-async-storage/async-storage";
import { getPlaybackSettings } from "@jits/shared/api/playback-settings";
import { parsePlaybackSettings, type PlaybackSettings } from "@jits/shared/utils";
import { supabase } from "@/lib/supabase/client";

/**
 * The adaptive playback settings for a session start (spec 5.2), resolved
 * synchronously: the server value fetched this app run, else a cached value
 * younger than 30 days, else the compiled-in defaults. A value that fails
 * `parsePlaybackSettings` is skipped to the next source. The server read
 * (`get_playback_settings`) runs in the background on first use per app
 * run and again when the last fetch is older than 1 h; a start never waits
 * for it, and a session keeps the settings it started with.
 */
export const PLAYBACK_SETTINGS_KEY = "video-playback:settings:v1";
export const SETTINGS_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const SETTINGS_REFRESH_MS = 60 * 60 * 1000;
/** A settings read that has not answered after this is given up (so `fetching` always clears). */
export const SETTINGS_FETCH_TIMEOUT_MS = 5000;
/** After a failed read, the next open may retry once this has passed (not a full hour). */
export const SETTINGS_RETRY_MS = 60 * 1000;

export type SettingsSource = "server" | "cache" | "builtin";

interface Cached {
  fetchedAt: number;
  value: unknown;
}

let server: unknown = undefined;
let cache: Cached | null = null;
let hydrated = false;
let hydrating: Promise<void> | null = null;
let lastFetchAt: number | null = null;
let fetching: Promise<void> | null = null;

function isCached(v: unknown): v is Cached {
  return !!v && typeof v === "object" && typeof (v as Cached).fetchedAt === "number" && "value" in (v as object);
}

/** Read the cached server value once per app run. Never rejects. */
export function hydratePlaybackSettingsCache(): Promise<void> {
  if (hydrated) return Promise.resolve();
  if (!hydrating) {
    hydrating = AsyncStorage.getItem(PLAYBACK_SETTINGS_KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed: unknown = JSON.parse(raw);
        if (isCached(parsed) && cache === null) cache = parsed;
      })
      .catch(() => undefined)
      .finally(() => {
        hydrated = true;
      });
  }
  return hydrating;
}

/** Settings for a session starting now, and where they came from. */
export function resolvePlaybackSettings(now = Date.now()): { settings: PlaybackSettings; source: SettingsSource } {
  if (server !== undefined) {
    const r = parsePlaybackSettings(server);
    if (r.valid) return { settings: r.settings, source: "server" };
  }
  if (cache && now - cache.fetchedAt < SETTINGS_CACHE_MAX_AGE_MS) {
    const r = parsePlaybackSettings(cache.value);
    if (r.valid) return { settings: r.settings, source: "cache" };
  }
  return { settings: parsePlaybackSettings(null).settings, source: "builtin" };
}

/**
 * Refresh from the server when it was not fetched this app run or the last
 * fetch is older than 1 h. Fire and forget: never rejects, never blocks.
 */
export function refreshPlaybackSettings(now = Date.now()): Promise<void> {
  if (fetching) return fetching;
  if (lastFetchAt !== null && now - lastFetchAt < SETTINGS_REFRESH_MS) return Promise.resolve();
  lastFetchAt = now;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<{ ok: false }>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false }), SETTINGS_FETCH_TIMEOUT_MS);
  });
  const failed = () => {
    // Retry on a later open after the short backoff, not in an hour.
    lastFetchAt = now - SETTINGS_REFRESH_MS + SETTINGS_RETRY_MS;
  };
  fetching = Promise.race([getPlaybackSettings(supabase), timeout])
    .then((result) => {
      if (!result.ok) {
        failed();
        return;
      }
      server = result.data;
      // Only a value this client can use is worth caching.
      if (!parsePlaybackSettings(result.data).valid) return;
      cache = { fetchedAt: Date.now(), value: result.data };
      void AsyncStorage.setItem(PLAYBACK_SETTINGS_KEY, JSON.stringify(cache)).catch(() => undefined);
    })
    .catch(() => failed())
    .finally(() => {
      if (timer) clearTimeout(timer);
      fetching = null;
    });
  return fetching;
}

/** Tests only. */
export function __resetPlaybackSettingsStoreForTests(): void {
  server = undefined;
  cache = null;
  hydrated = false;
  hydrating = null;
  lastFetchAt = null;
  fetching = null;
}

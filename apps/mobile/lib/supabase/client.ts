import "react-native-url-polyfill/auto";
import { Platform } from "react-native";
import { createClient, processLock } from "@supabase/supabase-js";
import type { Database } from "@jits/shared/types/database";
import { env } from "../env";
import { SecureStoreAdapter } from "./secure-storage";

/**
 * Supabase client for the React Native app.
 *
 * - Auth tokens persisted via `expo-secure-store` (see `secure-storage.ts`).
 * - `lock: processLock` is REQUIRED on React Native. Without it, auth-js falls
 *   back to a no-op lock (no `navigator.locks` outside a browser), so the
 *   mount-time `getSession()`, the `autoRefreshToken` timer, and the
 *   `INITIAL_SESSION` emission race on the stored session at cold start. That
 *   race intermittently stalls the auth gate and wedges the app on the
 *   "Loading..." screen until a restart. `processLock` serializes them.
 *   NOTE: with a real lock active, never `await` a Supabase call inside an
 *   `onAuthStateChange` callback (it runs while the lock is held -> deadlock);
 *   see `auth-context.tsx`.
 * - `detectSessionInUrl: false` because there's no URL bar; deep-link auth
 *   (e.g. password reset, OAuth) will be handled separately.
 * - Realtime `heartbeatIntervalMs: 15_000` mirrors the web client to prevent
 *   silent disconnects on flaky mobile networks.
 * - `worker` option is intentionally omitted: Web Workers don't exist on
 *   React Native; the realtime client falls back to its default behavior.
 * - `x-elo-platform` (`ios` / `android`) on every request: the backend's
 *   `_request_platform()` reads it into `athlete_live_sessions.platform` and
 *   `athlete_location_events.platform` (live location fixes 4.4). Native
 *   requests have no CORS preflight, so a custom header is safe here; the
 *   server ignores it where it does not read it.
 */
export const SUPABASE_CLIENT_HEADERS = { "x-elo-platform": Platform.OS } as const;

export const supabase = createClient<Database>(
  env.supabaseUrl,
  env.supabaseAnonKey,
  {
    auth: {
      storage: SecureStoreAdapter,
      lock: processLock,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
    realtime: {
      params: { eventsPerSecond: 10 },
      heartbeatIntervalMs: 15_000,
    },
    global: { headers: { ...SUPABASE_CLIENT_HEADERS } },
  },
);

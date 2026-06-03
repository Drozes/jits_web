import "react-native-url-polyfill/auto";
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
 */
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
  },
);

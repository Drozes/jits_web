import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@jits/shared/types/database";
import { env } from "../env";
import { SecureStoreAdapter } from "./secure-storage";

/**
 * Supabase client for the React Native app.
 *
 * - Auth tokens persisted via `expo-secure-store` (see `secure-storage.ts`).
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

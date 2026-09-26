import "react-native-url-polyfill/auto";
import { AppState } from "react-native";
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

/**
 * Token auto-refresh, paused and resumed around a failed sign-out (jits-oz9q).
 *
 * On React Native auth-js starts its refresh ticker ONCE, at client
 * initialization, and nothing in auth-js ever restarts it: not sign-in, not
 * a foreground (there is no `visibilitychange` outside a browser). So a
 * `stopAutoRefresh()` is permanent unless the app restarts it itself. The
 * failed (offline) sign-out path stops it before wiping the persisted
 * session, so a tick firing once the network returns cannot refresh with the
 * still-stored refresh token and write a new session back. It is restarted
 * here on the next `SIGNED_IN` and, as a backstop, on the next foreground.
 *
 * The foreground backstop resumes only when a session is stored AND it is
 * not the one that was stored when the pause began. If the sign-out's own
 * clear failed, that leftover session is still on disk, and resuming the
 * ticker would refresh it and sign the user straight back in. It reads the
 * raw stored value (no `getSession()`: that takes the auth lock and itself
 * refreshes an expired session, the exact write this guards against).
 *
 * Only a pause made through `pauseAuthAutoRefresh` is resumed: the running
 * ticker is otherwise left exactly as auth-js manages it.
 */
let autoRefreshPaused = false;
/** The raw stored session at pause time, to recognise a leftover. */
let sessionAtPause: string | null = null;

/**
 * The key auth-js persists the session under. It is `protected` on the
 * client, so read it at runtime and fall back to auth-js's default
 * (`sb-<project ref>-auth-token`), which is what our client uses.
 */
export function authStorageKey(): string {
  const key = (supabase.auth as unknown as { storageKey?: unknown }).storageKey;
  if (typeof key === "string" && key) return key;
  return `sb-${new URL(env.supabaseUrl).hostname.split(".")[0]}-auth-token`;
}

async function readStoredSession(): Promise<string | null> {
  try {
    return await SecureStoreAdapter.getItem(authStorageKey());
  } catch {
    return null;
  }
}

export async function pauseAuthAutoRefresh(): Promise<void> {
  autoRefreshPaused = true;
  try {
    await supabase.auth.stopAutoRefresh();
  } catch (e) {
    console.warn("[auth] could not stop token auto-refresh", e);
  }
  sessionAtPause = await readStoredSession();
}

function resumeAuthAutoRefresh(): void {
  if (!autoRefreshPaused) return;
  autoRefreshPaused = false;
  sessionAtPause = null;
  // Not awaited: this can run inside an `onAuthStateChange` callback, which
  // holds the auth lock. `startAutoRefresh` takes no lock itself (its first
  // tick is deferred to a timer), so firing it here cannot deadlock.
  void supabase.auth.startAutoRefresh().catch((e: unknown) => {
    autoRefreshPaused = true;
    console.warn("[auth] could not restart token auto-refresh", e);
  });
}

/** Foreground backstop: resume only for a NEW stored session (see above). */
export async function resumeAuthAutoRefreshOnForeground(): Promise<void> {
  if (!autoRefreshPaused) return;
  const stored = await readStoredSession();
  if (!stored || stored === sessionAtPause) return;
  resumeAuthAutoRefresh();
}

supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_IN") resumeAuthAutoRefresh();
});

AppState.addEventListener("change", (state) => {
  if (state === "active") void resumeAuthAutoRefreshOnForeground();
});

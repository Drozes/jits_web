import * as React from "react";
import { Platform } from "react-native";
import type { Session, User } from "@supabase/supabase-js";
import { ATHLETE_STATUS } from "@jits/shared/constants";
import {
  getCurrentAthleteResult,
  type AthleteGuardRow,
} from "@jits/shared/api/queries";
import { backoffDelayMs } from "@jits/shared/utils";
import { env } from "../env";
import { pauseAuthAutoRefresh, supabase } from "../supabase/client";
import { SecureStoreAdapter } from "../supabase/secure-storage";
import { setCachedElo } from "../splash/elo-cache";
import { needsAthleteLoad } from "./athlete-load";
import { takeArenaOfflineBeforeSignOut } from "../arena/arena-store";

type AuthError = { message: string };

export type AuthState = {
  user: User | null;
  session: Session | null;
  athlete: AthleteGuardRow | null;
  isLoading: boolean;
  isAthleteActive: boolean;
  /**
   * True while the signed-in user's athlete row has failed to load several
   * times in a row. `isLoading` stays true meanwhile (a failed read is NOT "no
   * athlete", which would send an active athlete to /profile-setup); the
   * provider keeps retrying with backoff, and `app/index.tsx` shows a retry
   * state instead of the bare "Loading...".
   */
  athleteLoadFailed: boolean;
  /** Retry the athlete load now instead of waiting out the backoff. */
  retryAthleteLoad: () => void;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signInWithGoogle: () => Promise<{ error: AuthError | null; cancelled?: boolean }>;
  signUp: (
    email: string,
    password: string,
  ) => Promise<{ error: AuthError | null; needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>;
  /**
   * Re-read the athlete row (retrying once). Resolves true when a read
   * succeeded. When both fail, applies `fallback` if given (a row the caller
   * has just verified), else keeps the current athlete.
   */
  refreshAthlete: (fallback?: AthleteGuardRow) => Promise<boolean>;
  /**
   * Re-read the athlete row, but keep the current one when the read fails or
   * finds no row. A null athlete sends
   * the mounted tabs to /profile-setup and tears down live state, so a
   * background refresh (after a match, jits-tlk3) must never apply it.
   */
  refreshAthleteSoft: () => Promise<void>;
};

/** Backoff between cold-start athlete reads: about 1s, 2s, 4s, then 8s apart. */
export const ATHLETE_LOAD_BACKOFF = { baseMs: 1_000, maxMs: 8_000 };
/** Failed reads before `athleteLoadFailed` swaps "Loading..." for a retry state. */
export const ATHLETE_LOAD_FAILURES_BEFORE_RETRY_UI = 3;

/**
 * The key auth-js persists the session under. It is `protected` on the
 * client, so read it at runtime and fall back to auth-js's default
 * (`sb-<project ref>-auth-token`), which is what our client uses.
 */
function authStorageKey(): string {
  const key = (supabase.auth as unknown as { storageKey?: unknown }).storageKey;
  if (typeof key === "string" && key) return key;
  return `sb-${new URL(env.supabaseUrl).hostname.split(".")[0]}-auth-token`;
}

/** Remove the persisted session exactly as auth-js's own `_removeSession` does. */
async function clearPersistedSession(): Promise<void> {
  try {
    const key = authStorageKey();
    for (const k of [key, `${key}-code-verifier`, `${key}-user`]) {
      await SecureStoreAdapter.removeItem(k);
    }
  } catch (e) {
    console.warn("[auth] could not clear the persisted session", e);
  }
}

/** The athlete read, with a thrown call folded into the failure branch. */
async function readAthlete(uid: string) {
  try {
    return await getCurrentAthleteResult(supabase, uid);
  } catch (e) {
    console.warn("[auth] athlete read threw", e);
    return { ok: false as const };
  }
}

let googleConfigured = false;
async function ensureGoogleConfigured() {
  if (googleConfigured || Platform.OS === "web") return;
  const { GoogleSignin } = await import(
    "@react-native-google-signin/google-signin"
  );
  GoogleSignin.configure({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  });
  googleConfigured = true;
}

const AuthContext = React.createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null);
  const [user, setUser] = React.useState<User | null>(null);
  const [athlete, setAthlete] = React.useState<AthleteGuardRow | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  // The user id whose athlete-guard row we have actually loaded. Lets the
  // auth-state callback tell a brand-new sign-in (athlete not loaded yet) apart
  // from a routine token refresh for the already-loaded user, so it only
  // re-arms the loading gate for the former.
  const loadedAthleteForUserId = React.useRef<string | null>(null);

  // Subscribe to auth state. Supabase emits INITIAL_SESSION on mount with the
  // restored (or null) session, so this also performs cold-start hydration.
  //
  // The callback MUST stay synchronous: Supabase runs it while holding the
  // GoTrue auth lock (`processLock`, see supabase/client.ts), so awaiting any
  // Supabase call here would deadlock and wedge the app on the "Loading..."
  // gate. The athlete row is loaded in the user-keyed effect below, outside the
  // lock.
  React.useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      const nextUser = nextSession?.user ?? null;
      setSession(nextSession);
      setUser(nextUser);
      if (!nextUser) {
        loadedAthleteForUserId.current = null;
        setAthlete(null);
        setIsLoading(false);
      } else if (needsAthleteLoad(nextUser.id, loadedAthleteForUserId.current)) {
        // Freshly signed-in user whose athlete row we have NOT loaded yet. Hold
        // the gate on "Loading..." (synchronously, in the same render that sets
        // the user) until the user-keyed effect below resolves getCurrentAthlete.
        // Otherwise app/index.tsx sees `athlete === null` for a signed-in user
        // and redirects an already-active athlete to /profile-setup before the
        // row arrives: the redirect is synchronous, the fetch is not, so the
        // wrong redirect wins every time. setState only here, never await.
        setIsLoading(true);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const [athleteLoadFailed, setAthleteLoadFailed] = React.useState(false);
  const [loadNonce, setLoadNonce] = React.useState(0);

  // Load the athlete guard row whenever the signed-in user changes. Runs outside
  // the auth-state callback (no lock held) so it can't deadlock, and keeps
  // `isLoading` true until a read SUCCEEDS so Index() doesn't flash the
  // profile-setup redirect for an already-active athlete. A failed read (a
  // flaky cold start) is retried with backoff and never stored as "no
  // athlete": that null would send an active athlete to /profile-setup, whose
  // wizard has no row to update and dead-ends on an RLS error.
  React.useEffect(() => {
    const uid = user?.id;
    if (!uid) {
      setAthleteLoadFailed(false);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let failures = 0;
    const attempt = async () => {
      const result = await readAthlete(uid);
      if (cancelled) return;
      if (result.ok) {
        setAthlete(result.data);
        loadedAthleteForUserId.current = uid;
        setAthleteLoadFailed(false);
        setIsLoading(false);
        return;
      }
      failures += 1;
      if (failures >= ATHLETE_LOAD_FAILURES_BEFORE_RETRY_UI) setAthleteLoadFailed(true);
      timer = setTimeout(() => void attempt(), backoffDelayMs(failures, ATHLETE_LOAD_BACKOFF));
    };
    void attempt();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [user?.id, loadNonce]);

  const retryAthleteLoad = React.useCallback(() => {
    // Restarting the effect above drops the pending backoff timer and reads now.
    setLoadNonce((n) => n + 1);
  }, []);

  // Persist the real ELO so the next cold-start "Climb" rolls to it, not 1481.
  React.useEffect(() => {
    if (athlete?.current_elo != null) {
      void setCachedElo(athlete.current_elo);
    }
  }, [athlete?.current_elo]);

  const refreshAthlete = React.useCallback(async (fallback?: AthleteGuardRow) => {
    if (!user) {
      setAthlete(null);
      return false;
    }
    // One retry: this runs right after activation, where a failed read would
    // leave the context "pending" and route a just-activated athlete back
    // into setup.
    let result = await readAthlete(user.id);
    if (!result.ok) result = await readAthlete(user.id);
    if (result.ok) {
      // May genuinely be "no row".
      setAthlete(result.data);
      return true;
    }
    // Both failed: apply the caller's already-verified row if it has one,
    // otherwise keep the current athlete (never null it on a failed read).
    if (fallback) setAthlete(fallback);
    return false;
  }, [user]);

  const refreshAthleteSoft = React.useCallback(async () => {
    const uid = user?.id;
    if (!uid) return;
    const result = await readAthlete(uid);
    // A failed read, a missing row, or a sign-out / account switch while it
    // was in flight: leave whatever the athlete is now alone.
    if (!result.ok || !result.data || loadedAthleteForUserId.current !== uid) return;
    setAthlete(result.data);
  }, [user]);

  const signIn = React.useCallback(
    async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error ? { message: error.message } : null };
    },
    [],
  );

  const signInWithGoogle = React.useCallback(async () => {
    if (Platform.OS === "web") {
      return { error: { message: "Google sign-in on web is not wired yet." } };
    }
    try {
      await ensureGoogleConfigured();
      const { GoogleSignin, statusCodes } = await import(
        "@react-native-google-signin/google-signin"
      );
      await GoogleSignin.hasPlayServices().catch(() => undefined);
      const result = await GoogleSignin.signIn();
      const idToken =
        (result as { idToken?: string; data?: { idToken?: string } }).idToken ??
        (result as { data?: { idToken?: string } }).data?.idToken ??
        null;
      if (!idToken) {
        return { error: { message: "Google did not return an ID token." } };
      }
      const { error } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: idToken,
      });
      return { error: error ? { message: error.message } : null };
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (
        code === "SIGN_IN_CANCELLED" ||
        code === "-5" ||
        code === "12501"
      ) {
        return { error: null, cancelled: true };
      }
      const msg = (e as Error).message ?? "Google sign-in failed.";
      return { error: { message: msg } };
    }
  }, []);

  const signUp = React.useCallback(async (email: string, password: string) => {
    // We deliberately do NOT auto-create an athlete row here.
    // The profile-setup wizard (A3) handles activation.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: "elorated://login" },
    });
    return {
      error: error ? { message: error.message } : null,
      needsEmailConfirmation: !error && !data.session,
    };
  }, []);

  const signOut = React.useCallback(async () => {
    // Clear `looking_for_ranked` while the session can still write it; once
    // signed out, RLS refuses the write and the athlete stays advertised.
    await takeArenaOfflineBeforeSignOut();
    let signOutError: unknown = null;
    try {
      ({ error: signOutError } = await supabase.auth.signOut());
    } catch (e) {
      signOutError = e;
    }
    if (signOutError) {
      // Offline (the retry screen's usual case): auth-js returns the error
      // WITHOUT removing the stored session or emitting SIGNED_OUT, so the
      // user would silently be signed back in on the next launch. Drop the
      // persisted session ourselves; the server-side token just expires.
      console.warn("[auth] signOut failed, clearing the local session", signOutError);
      // Stop the refresh ticker FIRST (jits-oz9q). Otherwise a tick that
      // fires once the network returns refreshes with the still-stored
      // refresh token and persists a new session over the one cleared
      // below, signing the user back in. Restarted by the client on the next
      // SIGNED_IN or foreground (see pauseAuthAutoRefresh).
      await pauseAuthAutoRefresh();
      await clearPersistedSession();
    }
    // onAuthStateChange normally nulls these; clear eagerly (and always, since
    // a failed sign-out emits nothing) and drop the loading gate so Index
    // goes to /login instead of sitting on "Loading...".
    loadedAthleteForUserId.current = null;
    setSession(null);
    setUser(null);
    setAthlete(null);
    setAthleteLoadFailed(false);
    setIsLoading(false);
  }, []);

  const resetPassword = React.useCallback(async (email: string) => {
    // Forward the reset email back into the app via the
    // `elorated://reset-password` custom scheme. The dedicated reset-password
    // screen is deferred: app/+native-intent.tsx rewrites this URL to /login
    // (lib/deep-links/system-path.ts). Universal-link flavor (`https://elorated.com/...`)
    // is wired in app.json but requires AASA / assetlinks.json hosting.
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "elorated://reset-password",
    });
    return { error: error ? { message: error.message } : null };
  }, []);

  const isAthleteActive = athlete?.status === ATHLETE_STATUS.ACTIVE;

  const value = React.useMemo<AuthState>(
    () => ({
      user,
      session,
      athlete,
      isLoading,
      isAthleteActive,
      athleteLoadFailed,
      retryAthleteLoad,
      signIn,
      signInWithGoogle,
      signUp,
      signOut,
      resetPassword,
      refreshAthlete,
      refreshAthleteSoft,
    }),
    [
      user,
      session,
      athlete,
      isLoading,
      isAthleteActive,
      athleteLoadFailed,
      retryAthleteLoad,
      signIn,
      signInWithGoogle,
      signUp,
      signOut,
      resetPassword,
      refreshAthlete,
      refreshAthleteSoft,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export { AuthContext };

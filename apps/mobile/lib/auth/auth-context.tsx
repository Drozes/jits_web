import * as React from "react";
import { Platform } from "react-native";
import type { Session, User } from "@supabase/supabase-js";
import { ATHLETE_STATUS } from "@jits/shared/constants";
import {
  getCurrentAthlete,
  type AthleteGuardRow,
} from "@jits/shared/api/queries";
import { supabase } from "../supabase/client";
import { setCachedElo } from "../splash/elo-cache";

type AuthError = { message: string };

export type AuthState = {
  user: User | null;
  session: Session | null;
  athlete: AthleteGuardRow | null;
  isLoading: boolean;
  isAthleteActive: boolean;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signInWithGoogle: () => Promise<{ error: AuthError | null; cancelled?: boolean }>;
  signUp: (
    email: string,
    password: string,
  ) => Promise<{ error: AuthError | null; needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>;
  refreshAthlete: () => Promise<void>;
};

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
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      if (!nextSession?.user) {
        setAthlete(null);
        setIsLoading(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Load the athlete guard row whenever the signed-in user changes. Runs outside
  // the auth-state callback (no lock held) so it can't deadlock, and keeps
  // `isLoading` true until the first fetch resolves so Index() doesn't flash the
  // profile-setup redirect for an already-active athlete.
  React.useEffect(() => {
    const uid = user?.id;
    if (!uid) return;
    let cancelled = false;
    void (async () => {
      const row = await getCurrentAthlete(supabase, uid);
      if (!cancelled) {
        setAthlete(row);
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Persist the real ELO so the next cold-start "Climb" rolls to it, not 1481.
  React.useEffect(() => {
    if (athlete?.current_elo != null) {
      void setCachedElo(athlete.current_elo);
    }
  }, [athlete?.current_elo]);

  const refreshAthlete = React.useCallback(async () => {
    if (!user) {
      setAthlete(null);
      return;
    }
    const row = await getCurrentAthlete(supabase, user.id);
    setAthlete(row);
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
    await supabase.auth.signOut();
    // onAuthStateChange will null out user/athlete; clear eagerly for snappier UI.
    setSession(null);
    setUser(null);
    setAthlete(null);
  }, []);

  const resetPassword = React.useCallback(async (email: string) => {
    // Phase 5 B1: deep-link handler exists -- forward the reset email back
    // into the app via the `elorated://reset-password` custom scheme. The
    // dedicated reset-password screen is deferred (handler currently routes
    // the token to /login). Universal-link flavor (`https://elorated.com/...`)
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
      signIn,
      signInWithGoogle,
      signUp,
      signOut,
      resetPassword,
      refreshAthlete,
    }),
    [
      user,
      session,
      athlete,
      isLoading,
      isAthleteActive,
      signIn,
      signInWithGoogle,
      signUp,
      signOut,
      resetPassword,
      refreshAthlete,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export { AuthContext };

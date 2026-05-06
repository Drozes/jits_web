import * as React from "react";
import type { Session, User } from "@supabase/supabase-js";
import { ATHLETE_STATUS } from "@jits/shared/constants";
import {
  getCurrentAthlete,
  type AthleteGuardRow,
} from "@jits/shared/api/queries";
import { supabase } from "../supabase/client";

type AuthError = { message: string };

export type AuthState = {
  user: User | null;
  session: Session | null;
  athlete: AthleteGuardRow | null;
  isLoading: boolean;
  isAthleteActive: boolean;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUp: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>;
  refreshAthlete: () => Promise<void>;
};

const AuthContext = React.createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null);
  const [user, setUser] = React.useState<User | null>(null);
  const [athlete, setAthlete] = React.useState<AthleteGuardRow | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  // Hydrate from stored session on mount, then subscribe to auth changes.
  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      const initialSession = data.session;
      setSession(initialSession);
      setUser(initialSession?.user ?? null);
      if (initialSession?.user) {
        const row = await getCurrentAthlete(supabase, initialSession.user.id);
        if (!cancelled) setAthlete(row);
      }
      if (!cancelled) setIsLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(
      async (_event, nextSession) => {
        setSession(nextSession);
        setUser(nextSession?.user ?? null);
        if (nextSession?.user) {
          const row = await getCurrentAthlete(supabase, nextSession.user.id);
          setAthlete(row);
        } else {
          setAthlete(null);
        }
        setIsLoading(false);
      },
    );

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

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

  const signUp = React.useCallback(async (email: string, password: string) => {
    // We deliberately do NOT auto-create an athlete row here.
    // The profile-setup wizard (A3) handles activation.
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error ? { message: error.message } : null };
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
      signUp,
      signOut,
      resetPassword,
      refreshAthlete,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export { AuthContext };

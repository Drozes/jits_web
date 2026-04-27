import * as React from "react";
import type { Session, User } from "@supabase/supabase-js";
import type { Athlete } from "@jits/shared/types/athlete";
import { ATHLETE_STATUS } from "@jits/shared/constants";
import { supabase } from "../supabase/client";

/**
 * Columns the guard hooks read off the athlete row. Mirrors the web's
 * `ATHLETE_GUARD_SELECT` in `apps/web/lib/guards.ts` — keep these aligned
 * so the two clients agree on activation state.
 */
const ATHLETE_GUARD_SELECT =
  "id, auth_user_id, display_name, current_elo, highest_elo, current_weight, primary_gym_id, profile_photo_url, looking_for_casual, looking_for_ranked, status, free_agent, gender, date_of_birth, city" as const;

/**
 * Subset of the Athlete row guards actually consume. Phase 3 work will
 * extract a typed `getCurrentAthlete()` helper into `@jits/shared` so
 * web and mobile share one query; until then this inline query is
 * intentional (see deliverable notes).
 */
type AthleteGuardRow = Pick<
  Athlete,
  | "id"
  | "auth_user_id"
  | "display_name"
  | "current_elo"
  | "highest_elo"
  | "current_weight"
  | "primary_gym_id"
  | "profile_photo_url"
  | "looking_for_casual"
  | "looking_for_ranked"
  | "status"
  | "free_agent"
  | "gender"
  | "date_of_birth"
  | "city"
>;

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

async function fetchAthleteByAuthId(
  authUserId: string,
): Promise<AthleteGuardRow | null> {
  const { data, error } = await supabase
    .from("athletes")
    .select(ATHLETE_GUARD_SELECT)
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error || !data) return null;
  return data as AthleteGuardRow;
}

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
        const row = await fetchAthleteByAuthId(initialSession.user.id);
        if (!cancelled) setAthlete(row);
      }
      if (!cancelled) setIsLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(
      async (_event, nextSession) => {
        setSession(nextSession);
        setUser(nextSession?.user ?? null);
        if (nextSession?.user) {
          const row = await fetchAthleteByAuthId(nextSession.user.id);
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
    const row = await fetchAthleteByAuthId(user.id);
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
    // TODO(A2): Wire `redirectTo` to a deep link (e.g. jits://reset-password)
    // once the deep-link handler exists. For Phase 2 simplicity we ship the
    // email-only flow.
    const { error } = await supabase.auth.resetPasswordForEmail(email);
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

import * as React from "react";
import { useRouter } from "expo-router";
import { ATHLETE_STATUS } from "@jits/shared/constants";
import { AuthContext, type AuthState } from "./auth-context";

/**
 * Reads the AuthProvider context. Throws if not inside an `<AuthProvider>`.
 */
export function useAuth(): AuthState {
  const ctx = React.useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within <AuthProvider>");
  }
  return ctx;
}

/**
 * Mirrors `apps/web/lib/guards.ts#requireAuth`: redirects unauthenticated
 * users to /login. Render the screen contents conditionally on `isLoading`
 * so we don't flash the protected UI before the redirect fires.
 */
export function useRequireAuth() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/login");
    }
  }, [user, isLoading, router]);

  return { user, isLoading };
}

/**
 * Mirrors `apps/web/lib/guards.ts#requireAthlete`: redirects to /login if
 * unauthenticated, or /profile-setup if the athlete row is missing or
 * still in the `pending` status (activation incomplete).
 */
export function useRequireAthlete() {
  const { user, athlete, isLoading } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!athlete || athlete.status === ATHLETE_STATUS.PENDING) {
      router.replace("/profile-setup");
    }
  }, [user, athlete, isLoading, router]);

  return { user, athlete, isLoading };
}

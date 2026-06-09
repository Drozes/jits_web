/**
 * Regression tests for the auth loading gate (jits bug: signing in always
 * dumps an already-active athlete back to /profile-setup).
 *
 * Two layers:
 *   1. `needsAthleteLoad`, the real pure decision the provider's auth-state
 *      callback uses to decide whether to re-arm the loading gate.
 *   2. A faithful simulation of `AuthProvider`'s (user, athlete, isLoading)
 *      state machine across the exact event sequence that triggered the bug,
 *      asserting the gate (`app/index.tsx`) never redirects an active athlete
 *      to /profile-setup during sign-in.
 *
 * The simulation mirrors the real transitions in `lib/auth/auth-context.tsx`
 * and the gate in `app/index.tsx`. It cannot import the provider directly
 * (it boots the Supabase client + RN modules), so it models the same logic,
 * consistent with the simulate-the-logic approach in use-require-auth.test.ts.
 */

import { needsAthleteLoad } from "@/lib/auth/athlete-load";

describe("needsAthleteLoad", () => {
  it("is false when there is no user (signed out)", () => {
    expect(needsAthleteLoad(null, null)).toBe(false);
    expect(needsAthleteLoad(null, "u1")).toBe(false);
  });

  it("is true for a fresh sign-in (no athlete loaded yet)", () => {
    expect(needsAthleteLoad("u1", null)).toBe(true);
  });

  it("is true for an account switch (different user than loaded)", () => {
    expect(needsAthleteLoad("u2", "u1")).toBe(true);
  });

  it("is false for a repeat event for the already-loaded user (token refresh)", () => {
    expect(needsAthleteLoad("u1", "u1")).toBe(false);
  });
});

/**
 * Minimal model of AuthProvider + the index.tsx gate. State and transitions
 * are kept 1:1 with the real implementation so this test catches a regression
 * in the loading-gate wiring, not just the pure helper.
 */
type AthleteRow = { id: string; status: string } | null;

function createAuthModel() {
  let user: { id: string } | null = null;
  let athlete: AthleteRow = null;
  let isLoading = true;
  let loadedForUserId: string | null = null;

  // Mirrors onAuthStateChange in auth-context.tsx (synchronous part only).
  function onAuthStateChange(nextUser: { id: string } | null) {
    user = nextUser;
    if (!nextUser) {
      loadedForUserId = null;
      athlete = null;
      isLoading = false;
    } else if (needsAthleteLoad(nextUser.id, loadedForUserId)) {
      isLoading = true;
    }
  }

  // Mirrors the user-keyed effect resolving getCurrentAthlete.
  function resolveAthleteLoad(row: AthleteRow) {
    if (!user) return;
    athlete = row;
    loadedForUserId = user.id;
    isLoading = false;
  }

  // Mirrors the redirect decision in app/index.tsx.
  function gateDestination(): string {
    if (isLoading) return "loading";
    if (!user) return "/login";
    if (!athlete || athlete.status === "pending") return "/profile-setup";
    return "/(app)/(home)";
  }

  return {
    onAuthStateChange,
    resolveAthleteLoad,
    gateDestination,
    snapshot: () => ({ user, athlete, isLoading, loadedForUserId }),
  };
}

describe("AuthProvider loading gate (sign-in race regression)", () => {
  it("never sends an already-active athlete to /profile-setup during sign-in", () => {
    const m = createAuthModel();

    // Cold start, signed out: INITIAL_SESSION with no user -> sit on /login.
    m.onAuthStateChange(null);
    expect(m.gateDestination()).toBe("/login");
    expect(m.snapshot().isLoading).toBe(false);

    // User taps "Continue with Google": SIGNED_IN fires with the user BEFORE
    // the athlete row has loaded. The gate must show "loading", NOT bounce to
    // setup. (Pre-fix this returned "/profile-setup" because isLoading stayed
    // false from the prior no-user event.)
    m.onAuthStateChange({ id: "u1" });
    expect(m.snapshot().isLoading).toBe(true);
    expect(m.gateDestination()).toBe("loading");

    // Athlete row resolves as ACTIVE -> straight to home, setup never shown.
    m.resolveAthleteLoad({ id: "a1", status: "active" });
    expect(m.gateDestination()).toBe("/(app)/(home)");
  });

  it("still routes a genuinely pending athlete to /profile-setup", () => {
    const m = createAuthModel();
    m.onAuthStateChange(null);
    m.onAuthStateChange({ id: "u1" });
    m.resolveAthleteLoad({ id: "a1", status: "pending" });
    expect(m.gateDestination()).toBe("/profile-setup");
  });

  it("does not re-arm loading on a token refresh for the same user", () => {
    const m = createAuthModel();
    m.onAuthStateChange({ id: "u1" });
    m.resolveAthleteLoad({ id: "a1", status: "active" });
    expect(m.gateDestination()).toBe("/(app)/(home)");

    // TOKEN_REFRESHED: same user id, athlete already loaded -> no loading flash.
    m.onAuthStateChange({ id: "u1" });
    expect(m.snapshot().isLoading).toBe(false);
    expect(m.gateDestination()).toBe("/(app)/(home)");
  });

  it("re-arms loading and reloads on an account switch", () => {
    const m = createAuthModel();
    m.onAuthStateChange({ id: "u1" });
    m.resolveAthleteLoad({ id: "a1", status: "active" });

    // Different user signs in: must hold loading until the new row resolves.
    m.onAuthStateChange({ id: "u2" });
    expect(m.snapshot().isLoading).toBe(true);
    expect(m.gateDestination()).toBe("loading");
  });
});
